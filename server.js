import { buildHistoryEntry, buildUpstreamRequest, createSafeFilename, normalizeImageResponse } from './lib/shared.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
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
    return { filePath, filename };
  }

  const response = await fetch(result.imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated image: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
  return { filePath, filename };
}

async function handleGenerate(req, res) {
  try {
    const bodyText = await readBody(req);
    const body = JSON.parse(bodyText || '{}');
    const request = buildUpstreamRequest(body);
    const upstreamResponse = await fetch(request.url, request.fetchOptions);
    const payload = await upstreamResponse.json();

    if (!upstreamResponse.ok) {
      const message = payload?.error?.message ?? `Upstream request failed with status ${upstreamResponse.status}`;
      sendJson(res, upstreamResponse.status, { error: message });
      return;
    }

    const result = normalizeImageResponse(payload);
    const saved = await saveImageFromResult(result, body.prompt);
    const historyEntry = buildHistoryEntry({
      model: body.model,
      size: body.size,
      prompt: body.prompt,
      imagePath: `/generated/${saved.filename}`,
      revisedPrompt: result.revisedPrompt,
    });

    sendJson(res, 200, {
      imagePath: `/generated/${saved.filename}`,
      revisedPrompt: result.revisedPrompt,
      savedFilename: saved.filename,
      historyEntry,
    });
  } catch (error) {
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
