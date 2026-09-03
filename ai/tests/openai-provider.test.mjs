import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiProvider } from '../lib/openai-provider.mjs';

test('transcription always sends Korean without seeding hallucinated prompt text', async () => {
  let request;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async (_url, init) => {
    request = init.body;
    return { ok: true, json: async () => ({ text: '양파 스무 망을 수확해.' }) };
  } });

  const result = await provider.transcribe({ audio_base64: 'AQID', filename: 'recording.webm', content_type: 'audio/webm', language_hint: 'en' });

  assert.deepEqual(result, { transcript: '양파 스무 망을 수확해.' });
  assert.equal(request.get('language'), 'ko');
  assert.equal(request.get('prompt'), null);
});

test('structure requests adapt the contract schema and read REST response output', async () => {
  let request;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: '{"interpretation":"READY"}' }] }] }) };
  } });
  const result = await provider.interpretStructureV2({
    prompt: 'prompt', transcript: '양파 수확',
    schema: { type: 'object', allOf: [{ if: {}, then: {} }], properties: { interpretation: { enum: ['READY', 'AMBIGUOUS'] }, version: { const: '2' } } },
  });

  assert.deepEqual(result, { interpretation: 'READY' });
  assert.equal(request.text.format.schema.allOf, undefined);
  assert.equal(request.text.format.schema.properties.interpretation.type, 'string');
  assert.equal(request.text.format.schema.properties.version.type, 'string');
});

test('synthesize returns a deterministic transport contract with bytes, hash, and no public URL', async () => {
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model', OPENAI_TTS_VOICE: 'test-voice' }, fetchImpl: async (_url, init) => {
    assert.match(init.body, /gpt-4o-mini-tts/);
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  } });
  const result = await provider.synthesize({ text: 'vi:양파 수확', languageCode: 'vi' });
  assert.deepEqual(result, { status: 'READY', text_hash: 'b0f5459d9cf4c6f2fcd26420e98adbf3cc3d448891685b1c6e59dfc0c6ed7eb1', audio_url: null, audio_bytes_base64: 'AQID' });
});

test('quantity parsing sends the versioned prompt rule for an explicit Korean target', async () => {
  let request;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ interpretation: 'READY', quantity: { value: 12, unit: '망' }, expected_version: 4, ambiguities: [], schema_version: '1', contract_version: 'quantity-change-v1' }) }) };
  } });
  await provider.interpretQuantityChange({ prompt: '`열두 망으로 맞춰` is a READY quantity change.', transcript: '열두 망으로 맞춰', expected_version: 4, schema: { type: 'object' } });
  assert.match(request.input[0].content, /`열두 망으로 맞춰` is a READY quantity change/);
  assert.match(request.input[0].content, /<owner-transcript>열두 망으로 맞춰<\/owner-transcript>/);
});
