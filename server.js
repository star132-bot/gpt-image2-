import { buildHistoryEntry, buildUpstreamRequest, createSafeFilename, normalizeImageResponse } from './lib/shared.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = __dirname;
const outputDir = path.join(__dirname, 'generated');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function runCurlJson(url, fetchOptions) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--fail-with-body',
    '--retry',
    '2',
    '--retry-delay',
    '2',
    '--connect-timeout',
    '30',
    '--max-time',
    '600',
    '--write-out',
    '\n%{http_code}',
    '--request',
    fetchOptions.method ?? 'POST',
  ];

  if (proxy) {
    args.push('--proxy', proxy);
  }

  for (const [key, value] of Object.entries(fetchOptions.headers ?? {})) {
    args.push('--header', `${key}: ${value}`);
  }

  args.push('--data', fetchOptions.body ?? '{}', url);

  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const text = Buffer.concat(stdout).toString('utf8');
      const errText = Buffer.concat(stderr).toString('utf8');

      if (code !== 0) {
        reject(new Error(errText || `curl exited with code ${code}`));
        return;
      }

      try {
        const markerIndex = text.lastIndexOf('\n');
        const bodyText = markerIndex >= 0 ? text.slice(0, markerIndex) : text;
        const statusText = markerIndex >= 0 ? text.slice(markerIndex + 1).trim() : '200';
        const status = Number(statusText) || 200;
        resolve({ status, ok: status >= 200 && status < 300, payload: JSON.parse(bodyText), transport: 'curl' });
      } catch (error) {
        reject(new Error(`curl returned non-JSON response: ${text.slice(0, 300)}`));
      }
    });
  });
}

async function requestUpstreamJson(request) {
  try {
    const response = await fetch(request.url, request.fetchOptions);
    const payload = await response.json();
    return {
      status: response.status,
      ok: response.ok,
      payload,
      transport: 'fetch',
    };
  } catch (error) {
    console.error(`[generate] node fetch failed, retrying with curl: ${error instanceof Error ? error.message : String(error)}`);
    return runCurlJson(request.url, request.fetchOptions);
  }
}

async function runCurlBuffer(url) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--fail',
    '--retry',
    '2',
    '--retry-delay',
    '2',
    '--connect-timeout',
    '30',
    '--max-time',
    '600',
    url,
  ];

  if (proxy) {
    args.splice(args.length - 1, 0, '--proxy', proxy);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString('utf8') || `curl download exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}

async function ensureOutputDir() {
  await fs.mkdir(outputDir, { recursive: true });
}

async function saveImageFromResult(result, prompt) {
  await ensureOutputDir();
  const filename = createSafeFilename(prompt, 'png');
  const filePath = path.join(outputDir, filename);

  if (result.format === 'base64') {
    const base64 = result.imageUrl.replace(/^data:image\/png;base64,/, '');
    await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
    return { filePath, filename, imagePath: `/generated/${filename}` };
  }

  try {
    const response = await fetch(result.imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, bytes);
    return { filePath, filename, imagePath: `/generated/${filename}` };
  } catch (error) {
    console.error(`[generate] node image download failed, retrying with curl: ${error instanceof Error ? error.message : String(error)}`);
    const bytes = await runCurlBuffer(result.imageUrl);
    await fs.writeFile(filePath, bytes);
    return { filePath, filename, imagePath: `/generated/${filename}` };
  }
}

async function handleGenerate(req, res) {
  const startedAt = Date.now();
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(bodyText || '{}');
    const request = buildUpstreamRequest(body);
    console.log(`[generate] start model=${body.model} size=${body.size} promptLength=${String(body.prompt ?? '').length}`);

    const upstreamStartedAt = Date.now();
    const upstream = await requestUpstreamJson(request);
    const upstreamMs = Date.now() - upstreamStartedAt;
    const payload = upstream.payload;
    console.log(`[generate] upstream finished status=${upstream.status} transport=${upstream.transport} time=${upstreamMs}ms`);

    if (!upstream.ok) {
      const message = payload?.error?.message ?? `Upstream request failed with status ${upstream.status}`;
      sendJson(res, upstream.status, { error: message, upstreamMs, transport: upstream.transport });
      return;
    }

    const result = normalizeImageResponse(payload);
    const saveStartedAt = Date.now();
    let saved;
    let saveError = '';

    try {
      saved = await saveImageFromResult(result, body.prompt);
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Unknown save error.';
      console.error(`[generate] image save failed, returning remote image instead: ${saveError}`);
      saved = {
        filename: 'remote-image-not-saved.png',
        imagePath: result.imageUrl,
      };
    }

    const saveMs = Date.now() - saveStartedAt;
    const totalMs = Date.now() - startedAt;
    console.log(`[generate] image ready filename=${saved.filename} save=${saveMs}ms total=${totalMs}ms saveError=${saveError || 'none'}`);

    const historyEntry = buildHistoryEntry({
      model: body.model,
      size: body.size,
      prompt: body.prompt,
      imagePath: saved.imagePath,
      revisedPrompt: result.revisedPrompt,
    });

    sendJson(res, 200, {
      imagePath: saved.imagePath,
      revisedPrompt: result.revisedPrompt,
      savedFilename: saved.filename,
      saveError,
      timings: { upstreamMs, saveMs, totalMs },
      historyEntry,
    });
  } catch (error) {
    console.error(`[generate] failed after ${Date.now() - startedAt}ms`, error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unknown server error.',
    });
  }
}

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function handleStatic(req, res) {
  const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const requestPath = parsedUrl.pathname === '/' ? '/index.html' : decodeURIComponent(parsedUrl.pathname);
  const filePath = path.resolve(publicDir, `.${requestPath}`);

  if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Cache-Control': requestPath.startsWith('/generated/') ? 'no-store' : 'public, max-age=60',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: 'Invalid request.' });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    await handleGenerate(req, res);
    return;
  }

  await handleStatic(req, res);
});

const port = Number(process.env.PORT || 3210);
server.listen(port, () => {
  console.log(`GPT Image Window running at http://127.0.0.1:${port}`);
});
