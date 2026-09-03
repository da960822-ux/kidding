import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenAiProvider } from '../lib/openai-provider.mjs';

test('provider sends audio transcription without a manual multipart content type', async () => {
  let captured;
  const provider = createOpenAiProvider({
    key: 'test-key',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ text: '양파를 캐라' }), { status: 200 });
    },
  });

  const result = await provider.transcribe(new Uint8Array([1, 2, 3]), { filename: 'voice.webm' });

  assert.match(captured.url, /audio\/transcriptions$/);
  assert.equal(captured.options.headers['Content-Type'], undefined);
  assert.equal(captured.options.body.get('model'), 'gpt-4o-transcribe');
  assert.equal(captured.options.body.get('language'), 'ko');
  assert.equal(result.text, '양파를 캐라');
  assert.equal(result.confidence, null);
});

test('provider accepts only completed Responses payloads', async () => {
  const provider = createOpenAiProvider({
    key: 'test-key',
    fetchImpl: async () => new Response(JSON.stringify({ status: 'completed', output_text: '{"ok":true}' }), { status: 200 }),
  });

  assert.equal((await provider.respond({ model: 'gpt-5.6-terra' })).output_text, '{"ok":true}');
});

test('provider returns speech bytes and metadata', async () => {
  let body;
  const provider = createOpenAiProvider({
    key: 'test-key',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(new Uint8Array([4, 5, 6]), { status: 200 });
    },
  });

  const result = await provider.speak('Thu hoạch hành.', { voice: 'alloy' });

  assert.deepEqual([...result.audio], [4, 5, 6]);
  assert.equal(body.model, 'gpt-4o-mini-tts');
  assert.equal(result.response_format, 'mp3');
});

test('provider rejects empty audio, oversized speech, and unknown voices before fetch', async () => {
  let calls = 0;
  const provider = createOpenAiProvider({ key: 'test-key', fetchImpl: async () => { calls += 1; } });

  await assert.rejects(provider.transcribe(new Uint8Array()), /audio/);
  await assert.rejects(provider.speak('x'.repeat(4097)), /4096/);
  await assert.rejects(provider.speak('text', { voice: 'unknown' }), /voice/);
  assert.equal(calls, 0);
});
