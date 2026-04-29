export function requireNonEmpty(value, fieldName) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

export function buildProxyRequestPayload({ apiKey, baseUrl, model, prompt, size }) {
  return {
    apiKey: requireNonEmpty(apiKey, 'API Key'),
    baseUrl: requireNonEmpty(baseUrl, 'Base URL').replace(/\/$/, ''),
    model: requireNonEmpty(model, 'Model'),
    prompt: requireNonEmpty(prompt, 'Prompt'),
    size: requireNonEmpty(size, 'Size'),
  };
}

export function buildUpstreamRequest({ apiKey, baseUrl, model, prompt, size }) {
  const payload = buildProxyRequestPayload({ apiKey, baseUrl, model, prompt, size });
  return {
    url: `${payload.baseUrl}/images/generations`,
    fetchOptions: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${payload.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: payload.model,
        prompt: payload.prompt,
        size: payload.size,
      }),
    },
  };
}

export function normalizeImageResponse(payload) {
  const firstItem = payload?.data?.[0];
  if (!firstItem) {
    throw new Error('No image returned by the API.');
  }

  if (typeof firstItem.url === 'string' && firstItem.url) {
    return {
      imageUrl: firstItem.url,
      revisedPrompt: firstItem.revised_prompt ?? '',
      format: 'url',
    };
  }

  if (typeof firstItem.b64_json === 'string' && firstItem.b64_json) {
    return {
      imageUrl: `data:image/png;base64,${firstItem.b64_json}`,
      revisedPrompt: firstItem.revised_prompt ?? '',
      format: 'base64',
    };
  }

  throw new Error('No usable image found in API response.');
}

export function createSafeFilename(prompt, extension = 'png') {
  const normalized = String(prompt ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'image';

  const timestamp = new Date().toISOString().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${timestamp}-${normalized}.${extension}`;
}

export function buildHistoryEntry({ model, size, prompt, imagePath, revisedPrompt }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    model,
    size,
    prompt,
    promptPreview: String(prompt).slice(0, 80),
    imagePath,
    revisedPrompt: revisedPrompt ?? '',
  };
}
