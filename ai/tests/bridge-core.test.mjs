import test from 'node:test';
import assert from 'node:assert/strict';

import { handleJsonlLine } from '../bridge-core.mjs';

const request = { operation: 'PARSE_QUANTITY_CHANGE', payload: { transcript: '15망으로 바꿔', expected_version: 1 } };
const services = { parseQuantityChange: async () => ({ interpretation: 'READY', quantity: { value: 15, unit: '망' }, expected_version: 1, ambiguities: [], schema_version: '1', contract_version: 'quantity-change-v1' }) };

test('handleJsonlLine rejects malformed JSONL without provider details', async () => {
  const result = await handleJsonlLine('{', services);
  assert.deepEqual(result, { ok: false, error: { code: 'INVALID_JSONL' } });
});

test('handleJsonlLine rejects identity fields before dispatch', async () => {
  const result = await handleJsonlLine(JSON.stringify({ ...request, payload: { ...request.payload, member_id: 'person-1' } }), services);
  assert.deepEqual(result, { ok: false, error: { code: 'IDENTITY_FIELD_FORBIDDEN' } });
});

test('handleJsonlLine rejects nickname and camelCase identity variants', async () => {
  for (const key of ['nickname', 'workerId', 'memberId', 'displayName', 'workerName', 'memberName', 'firstName', 'fullName', 'name_ko']) {
    const result = await handleJsonlLine(JSON.stringify({ ...request, payload: { ...request.payload, [key]: 'person-1' } }), services);
    assert.deepEqual(result, { ok: false, error: { code: 'IDENTITY_FIELD_FORBIDDEN' } });
  }
});

test('handleJsonlLine rejects nested normalized identity fields but accepts canonical_name', async () => {
  const rejected = await handleJsonlLine(JSON.stringify({ ...request, payload: { ...request.payload, structure: { context: { full_name: 'person-1' } } } }), services);
  const accepted = await handleJsonlLine(JSON.stringify({ ...request, payload: { ...request.payload, structure: { location: { canonical_name: '창고' } } } }), services);
  assert.deepEqual(rejected, { ok: false, error: { code: 'IDENTITY_FIELD_FORBIDDEN' } });
  assert.equal(accepted.ok, true);
});

test('handleJsonlLine redacts identity leaked by a provider result', async () => {
  const result = await handleJsonlLine(JSON.stringify(request), { parseQuantityChange: async () => ({ provider_metadata: { workerId: 'person-1' } }) });
  assert.deepEqual(result, { ok: false, error: { code: 'IDENTITY_FIELD_FORBIDDEN' } });
});

test('handleJsonlLine rejects unknown operations', async () => {
  const result = await handleJsonlLine(JSON.stringify({ operation: 'SHELL', payload: {} }), services);
  assert.deepEqual(result, { ok: false, error: { code: 'UNKNOWN_OPERATION' } });
});

test('handleJsonlLine rejects malformed base64 before dispatch', async () => {
  const result = await handleJsonlLine(JSON.stringify({ ...request, payload: { ...request.payload, audio_base64: 'not base64' } }), services);
  assert.deepEqual(result, { ok: false, error: { code: 'INVALID_AUDIO_BASE64' } });
});

test('handleJsonlLine rejects decoded audio over 10 MiB before dispatch', async () => {
  const result = await handleJsonlLine(JSON.stringify({ ...request, payload: { ...request.payload, audio_base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64') } }), services);
  assert.deepEqual(result, { ok: false, error: { code: 'AUDIO_TOO_LARGE' } });
});

test('handleJsonlLine returns an operation result without echoing input identity', async () => {
  const result = await handleJsonlLine(JSON.stringify(request), services);
  assert.equal(result.ok, true);
  assert.equal(result.result.quantity.value, 15);
});

test('TRANSCRIBE_AUDIO routes validated audio only to the Node transcriber and returns transcript', async () => {
  const request = { operation: 'TRANSCRIBE_AUDIO', payload: { audio_base64: 'AQID', filename: 'recording.wav', content_type: 'audio/wav', language_hint: 'ko' } };
  const result = await handleJsonlLine(JSON.stringify(request), { transcribeAudio: async (payload) => {
    assert.deepEqual(payload, request.payload);
    return { transcript: '양파 수확해', confidence: 0.9 };
  } });
  assert.deepEqual(result, { ok: true, result: { transcript: '양파 수확해' } });
});

test('TRANSCRIBE_AUDIO classifies an empty transcript as unclear audio', async () => {
  const request = { operation: 'TRANSCRIBE_AUDIO', payload: { audio_base64: 'AQID', content_type: 'audio/wav' } };
  const result = await handleJsonlLine(JSON.stringify(request), { transcribeAudio: async () => ({ transcript: '' }) });
  assert.deepEqual(result, { ok: false, error: { code: 'AUDIO_UNCLEAR' } });
});

test('TRANSCRIBE_AUDIO rejects invalid audio content type before provider dispatch', async () => {
  const result = await handleJsonlLine(JSON.stringify({ operation: 'TRANSCRIBE_AUDIO', payload: { audio_base64: 'AQID', content_type: 'text/plain' } }), { transcribeAudio: async () => assert.fail('must not dispatch') });
  assert.deepEqual(result, { ok: false, error: { code: 'INVALID_AUDIO_FORMAT' } });
});

test('provider failures retain only the operation, safe category, and HTTP status', async () => {
  const result = await handleJsonlLine(JSON.stringify(request), {
    parseQuantityChange: async () => { throw new Error('OPENAI_REQUEST_FAILED_429'); }
  });
  assert.deepEqual(result, { ok: false, error: { code: 'PARSE_QUANTITY_CHANGE_OPENAI_REQUEST_FAILED_429' } });
});

test('structure validation failures retain the safe validation category', async () => {
  const result = await handleJsonlLine(JSON.stringify(request), {
    parseQuantityChange: async () => { throw new TypeError('INVALID_STRUCTURE_V2_INVALID_STEP'); }
  });
  assert.deepEqual(result, { ok: false, error: { code: 'PARSE_QUANTITY_CHANGE_INVALID_STRUCTURE_V2_INVALID_STEP' } });
});
