import { buildProxyRequestPayload, normalizeImageResponse } from './lib/shared.js';

const hasDocument = typeof document !== 'undefined';
const form = hasDocument ? document.querySelector('#image-form') : null;
const promptInput = hasDocument ? document.querySelector('#prompt') : null;
const apiKeyInput = hasDocument ? document.querySelector('#api-key') : null;
const baseUrlInput = hasDocument ? document.querySelector('#base-url') : null;
const modelInput = hasDocument ? document.querySelector('#model') : null;
const sizeInput = hasDocument ? document.querySelector('#size') : null;
const statusBox = hasDocument ? document.querySelector('#status') : null;
const imageBox = hasDocument ? document.querySelector('#result-image') : null;
const promptBox = hasDocument ? document.querySelector('#revised-prompt') : null;
const outputLink = hasDocument ? document.querySelector('#result-link') : null;
const historyList = hasDocument ? document.querySelector('#history-list') : null;
const downloadButton = hasDocument ? document.querySelector('#download-button') : null;
const clearHistoryButton = hasDocument ? document.querySelector('#clear-history') : null;

const STORAGE_KEY = 'gpt-image-window-config';
const HISTORY_KEY = 'gpt-image-window-history';
let latestImageUrl = '';
let latestDownloadName = 'generated-image.png';

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const saved = JSON.parse(raw);
    apiKeyInput.value = saved.apiKey ?? '';
    baseUrlInput.value = saved.baseUrl ?? 'https://ai.t8star.cn/v1';
    modelInput.value = saved.model ?? 'gpt-image-2';
    sizeInput.value = saved.size ?? '1024x1024';
  } catch {
    statusBox.textContent = 'Stored config could not be read. Please re-enter it.';
  }
}

function saveConfig() {
  const payload = {
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim(),
    model: modelInput.value.trim(),
    size: sizeInput.value.trim(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
}

function renderHistory() {
  const items = readHistory();
  historyList.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = '还没有历史记录。';
    historyList.append(empty);
    return;
  }

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'history-item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-button';
    button.innerHTML = `
      <strong>${item.model}</strong>
      <span>${item.promptPreview}</span>
      <small>${new Date(item.createdAt).toLocaleString()}</small>
    `;

    button.addEventListener('click', () => {
      imageBox.src = item.imagePath;
      imageBox.hidden = false;
      outputLink.href = item.imagePath;
      outputLink.hidden = false;
      promptBox.textContent = item.revisedPrompt || 'No revised prompt returned.';
      promptInput.value = item.prompt;
      statusBox.textContent = `Loaded history item: ${item.model}`;
      latestImageUrl = item.imagePath;
      latestDownloadName = item.imagePath.split('/').pop() || 'generated-image.png';
      downloadButton.hidden = false;
    });

    li.append(button);
    historyList.append(li);
  }
}

function pushHistory(entry) {
  const items = readHistory();
  items.unshift(entry);
  writeHistory(items);
  renderHistory();
}

function setLoading(isLoading) {
  form.querySelector('button[type="submit"]').disabled = isLoading;
  form.querySelector('button[type="submit"]').textContent = isLoading ? 'Generating...' : 'Generate Image';
}

async function saveImageLocally() {
  if (!latestImageUrl) {
    statusBox.textContent = 'No image to save yet.';
    return;
  }

  const link = document.createElement('a');
  link.href = latestImageUrl;
  link.download = latestDownloadName;
  link.click();
}

async function handleSubmit(event) {
  event.preventDefault();
  setLoading(true);
  statusBox.textContent = 'Generating image...';
  imageBox.removeAttribute('src');
  imageBox.hidden = true;
  outputLink.hidden = true;
  promptBox.textContent = '';
  downloadButton.hidden = true;

  try {
    const payload = buildProxyRequestPayload({
      apiKey: apiKeyInput.value,
      baseUrl: baseUrlInput.value,
      model: modelInput.value,
      prompt: promptInput.value,
      size: sizeInput.value,
    });

    saveConfig();

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json();

    if (!response.ok) {
      throw new Error(body?.error ?? `Request failed with status ${response.status}`);
    }

    const result = normalizeImageResponse({
      data: [{
        url: body.imagePath,
        revised_prompt: body.revisedPrompt,
      }],
    });

    imageBox.src = result.imageUrl;
    imageBox.hidden = false;
    outputLink.href = result.imageUrl;
    outputLink.hidden = false;
    promptBox.textContent = result.revisedPrompt || 'No revised prompt returned.';
    const timingText = body.timings
      ? `模型生成 ${(body.timings.upstreamMs / 1000).toFixed(1)} 秒，保存 ${(body.timings.saveMs / 1000).toFixed(1)} 秒，总计 ${(body.timings.totalMs / 1000).toFixed(1)} 秒。`
      : '';
    const saveWarning = body.saveError
      ? ` | 注意：远程图片已返回，但本地保存失败：${body.saveError}。已先显示远程图片，请立刻点 Open image in new tab 或保存。`
      : '';
    statusBox.textContent = `Done. Saved to server: ${body.savedFilename}${timingText ? ` | ${timingText}` : ''}${saveWarning}`;
    latestImageUrl = result.imageUrl;
    latestDownloadName = body.savedFilename;
    downloadButton.hidden = false;
    pushHistory(body.historyEntry);
  } catch (error) {
    statusBox.textContent = error instanceof Error ? error.message : 'Unknown error.';
  } finally {
    setLoading(false);
  }
}

if (form) {
  loadStoredConfig();
  renderHistory();
  form.addEventListener('submit', handleSubmit);
  downloadButton.addEventListener('click', saveImageLocally);
  clearHistoryButton.addEventListener('click', () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    statusBox.textContent = 'History cleared.';
  });
}
