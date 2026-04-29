import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProxyRequestPayload,
  buildHistoryEntry,
  createSafeFilename,
  normalizeImageResponse,
} from './lib/shared.js';

test('buildProxyRequestPayload validates required fields', () => {
  const payload = buildProxyRequestPayload({
    apiKey: ' sk-test ',
    baseUrl: 'https://ai.t8star.cn/v1/',
    model: ' gpt-image-2 ',
    prompt: ' draw a cat ',
    size: '1024x1024',
  });

  assert.deepEqual(payload, {
    apiKey: 'sk-test',
    baseUrl: 'https://ai.t8star.cn/v1',
    model: 'gpt-image-2',
    prompt: 'draw a cat',
    size: '1024x1024',
  });

  assert.throws(() => buildProxyRequestPayload({ apiKey: '', baseUrl: 'x', model: 'm', prompt: 'p', size: 's' }), /API Key/);
  assert.throws(() => buildProxyRequestPayload({ apiKey: 'k', baseUrl: '', model: 'm', prompt: 'p', size: 's' }), /Base URL/);
  assert.throws(() => buildProxyRequestPayload({ apiKey: 'k', baseUrl: 'x', model: '', prompt: 'p', size: 's' }), /Model/);
  assert.throws(() => buildProxyRequestPayload({ apiKey: 'k', baseUrl: 'x', model: 'm', prompt: '', size: 's' }), /Prompt/);
});

test('normalizeImageResponse supports url and base64 images', () => {
  assert.deepEqual(
    normalizeImageResponse({ data: [{ url: 'https://example.com/image.png', revised_prompt: 'nice prompt' }] }),
    {
      imageUrl: 'https://example.com/image.png',
      revisedPrompt: 'nice prompt',
      format: 'url',
    }
  );

  assert.deepEqual(
    normalizeImageResponse({ data: [{ b64_json: 'YWJj' }] }),
    {
      imageUrl: 'data:image/png;base64,YWJj',
      revisedPrompt: '',
      format: 'base64',
    }
  );
});

test('createSafeFilename keeps filenames readable and safe', () => {
  const filename = createSafeFilename('一只白猫 / white cat', 'png');
  assert.match(filename, /^[A-Za-z0-9-]+\.png$/);
});

test('buildHistoryEntry keeps important fields for the sidebar', () => {
  const entry = buildHistoryEntry({
    model: 'gpt-image-2',
    size: '1024x1024',
    prompt: 'A calm lake at sunset',
    imagePath: '/images/lake.png',
    revisedPrompt: 'A calm lake at sunset with orange light',
  });

  assert.equal(entry.model, 'gpt-image-2');
  assert.equal(entry.size, '1024x1024');
  assert.equal(entry.imagePath, '/images/lake.png');
  assert.ok(entry.id);
  assert.ok(entry.createdAt);
  assert.equal(entry.promptPreview, 'A calm lake at sunset');
});
