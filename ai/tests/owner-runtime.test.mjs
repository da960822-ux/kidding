import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiRuntimeError,
  validateQuantityChangeContract,
  validateStt,
  validateStructureContract,
} from '../lib/contracts.mjs';
import { preflightSafety } from '../lib/safety.mjs';
import {
  buildOwnerDraft,
  interpretQuantityChange,
  interpretTranscript,
  mergeSupplement,
  transcribeAudio,
} from '../lib/owner-runtime.mjs';

const structure = (overrides = {}) => ({
  interpretation: 'READY',
  summary_ko: '양파를 수확한다.',
  location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null },
  task_family: 'ONION',
  quantity: { value: 20, unit: '망' },
  deadline: null,
  safety: [],
  notes: null,
  steps: [{
    sequence: 1,
    task_code: 'ONION_HARVEST',
    title_ko: '양파 수확',
    description_ko: '양파를 수확한다.',
    unsupported_reason: null,
  }],
  ambiguities: [],
  schema_version: '1',
  contract_version: 'structure-v1',
  ...overrides,
});

const response = (value) => ({ status: 'completed', output_text: JSON.stringify(value) });

test('transcribeAudio returns stt-v1 and preserves missing confidence as null', async () => {
  let received;
  const result = await transcribeAudio(new Uint8Array([1]), {
    transcribe: async (audio, options) => {
      received = { audio, options };
      return { text: '양파를 캔다.' };
    },
  });

  assert.equal(result.transcript, '양파를 캔다.');
  assert.equal(result.language_code, 'ko');
  assert.equal(result.confidence, null);
  assert.equal(result.contract_version, 'stt-v1');
  assert.deepEqual(received.options, { language: 'ko' });
});

test('transcribeAudio rejects empty audio and empty provider transcripts before structure', async () => {
  let calls = 0;
  await assert.rejects(
    transcribeAudio(new Uint8Array(), { transcribe: async () => { calls += 1; } }),
    (error) => error instanceof AiRuntimeError && error.code === 'AUDIO_EMPTY',
  );
  await assert.rejects(
    transcribeAudio(new Uint8Array([1]), { transcribe: async () => { calls += 1; return { text: '' }; } }),
    (error) => error instanceof AiRuntimeError && error.code === 'TRANSCRIPT_EMPTY',
  );
  assert.equal(calls, 1);
});

test('interpretTranscript accepts only completed output and validates structure sequence', async () => {
  const result = await interpretTranscript('양파를 캔다.', { respond: async () => response(structure()) });
  assert.equal(result.contract_version, 'structure-v1');

  const invalid = structure({ steps: [{ ...structure().steps[0], sequence: 2 }] });
  await assert.rejects(
    interpretTranscript('양파를 캔다.', { respond: async () => response(invalid) }),
    (error) => error instanceof AiRuntimeError && error.code === 'SCHEMA_INVALID',
  );
  await assert.rejects(
    interpretTranscript('양파를 캔다.', { respond: async () => ({ status: 'incomplete', output_text: JSON.stringify(structure()) }) }),
    (error) => error instanceof AiRuntimeError && error.code === 'RESPONSE_INCOMPLETE',
  );
  await assert.rejects(
    interpretTranscript('양파를 캔다.', { respond: async () => ({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }) }),
    (error) => error instanceof AiRuntimeError && error.code === 'PROVIDER_REFUSAL',
  );
});

test('mergeSupplement re-structures combined transcript without mutating the base', async () => {
  const base = structure();
  const snapshot = structuredClone(base);
  let request;
  const result = await mergeSupplement({
    baseTranscript: '양파를 캔다.',
    baseStructure: base,
    supplementTranscript: '앞밭에서 해라.',
  }, {
    respond: async (value) => { request = value; return response(structure({ location: { raw_text: '앞밭', kind: 'NAMED', canonical_name: '앞밭' } })); },
  });

  assert.deepEqual(base, snapshot);
  assert.equal(result.transcript, '양파를 캔다.\n앞밭에서 해라.');
  assert.equal(result.structure.location.canonical_name, '앞밭');
  assert.equal(result.publishable, true);
  assert.equal(result.requires_owner_decision, false);
  assert.match(request.input.at(-1).content, /<previous_validated_structure>/);
  assert.match(request.input.at(-1).content, /<untrusted_original_transcript>/);
  assert.match(request.input.at(-1).content, /<untrusted_supplement_transcript>/);
});

test('interpretQuantityChange validates trusted expected version and ambiguity shape', async () => {
  const ready = await interpretQuantityChange('열다섯 망으로 바꿔', 1, {
    respond: async () => response({
      interpretation: 'READY',
      quantity: { value: 15, unit: '망' },
      expected_version: 1,
      ambiguities: [],
      schema_version: '1',
      contract_version: 'quantity-change-v1',
    }),
  });
  assert.equal(ready.quantity.value, 15);
  const ambiguous = await interpretQuantityChange('그걸로 바꿔', 1, {
    respond: async () => response({
      interpretation: 'AMBIGUOUS',
      quantity: null,
      expected_version: 1,
      ambiguities: [{ field: 'quantity', message: '수량을 다시 말해주세요.', blocking: true, kind: 'QUANTITY' }],
      schema_version: '1',
      contract_version: 'quantity-change-v1',
    }),
  });
  assert.equal(ambiguous.quantity, null);
  await assert.rejects(
    interpretQuantityChange('열다섯 망', 0, { respond: async () => response(ready) }),
    (error) => error instanceof AiRuntimeError && error.code === 'EXPECTED_VERSION_INVALID',
  );
  await assert.rejects(
    interpretQuantityChange('열다섯 망', 1, { respond: async () => response({ ...ready, expected_version: 2 }) }),
    (error) => error instanceof AiRuntimeError && error.code === 'SCHEMA_INVALID',
  );
});

test('preflightSafety marks only explicit hazards high and safety ambiguity unknown', () => {
  assert.deepEqual(preflightSafety(structure()), {
    level: 'LOW', reasons: [], schema_version: '1', contract_version: 'safety-policy-v1',
  });
  assert.equal(preflightSafety(structure({ notes: '트럭을 운전한다.' })).level, 'HIGH');
  assert.deepEqual(preflightSafety(structure({ ambiguities: [{ field: 'safety', message: '안전 맥락 확인 필요', blocking: true, kind: 'SAFETY' }] })), {
    level: 'UNKNOWN', reasons: ['INSUFFICIENT_CONTEXT'], schema_version: '1', contract_version: 'safety-policy-v1',
  });
  assert.equal(preflightSafety(structure({ ambiguities: [{ field: 'safety', message: '농약 사용 여부 확인 필요', blocking: true, kind: 'SAFETY' }] })).level, 'UNKNOWN');
});

test('buildOwnerDraft composes STT, structure, and safety once and reports blockers', async () => {
  const calls = [];
  const draft = await buildOwnerDraft(new Uint8Array([1]), {
    transcribe: async () => { calls.push('stt'); return { text: '양파를 캔다.' }; },
    respond: async () => { calls.push('structure'); return response(structure({ steps: [], interpretation: 'AMBIGUOUS', ambiguities: [{ field: 'task', message: '작업 확인 필요', blocking: true, kind: 'TASK' }] })); },
  });

  assert.deepEqual(calls, ['stt', 'structure']);
  assert.equal(draft.publishable, false);
  assert.deepEqual(draft.blockers, ['BLOCKING_AMBIGUITY', 'NO_EXECUTABLE_STEP']);
  assert.equal(draft.risk_assessment.level, 'LOW');
});

test('buildOwnerDraft requires an owner decision for non-blocking ambiguity', async () => {
  const ambiguous = structure({
    interpretation: 'AMBIGUOUS',
    location: { raw_text: '저짝', kind: 'DEICTIC', canonical_name: null },
    ambiguities: [{ field: 'location', message: '현장 위치 확인 필요', blocking: false, kind: 'LOCATION' }],
  });
  const result = await buildOwnerDraft(new Uint8Array([1]), {
    transcribe: async () => ({ text: '저짝 양파를 캐라' }),
    respond: async () => response(ambiguous),
  });

  assert.equal(result.publishable, false);
  assert.equal(result.requires_owner_decision, true);
  assert.equal(result.override_allowed, true);
  assert.deepEqual(result.blockers, []);
});

test('contract validators reject non-contract values with typed errors', () => {
  assert.doesNotThrow(() => validateStructureContract(structure()));
  assert.throws(() => validateStructureContract({}), (error) => error instanceof AiRuntimeError && error.code === 'SCHEMA_INVALID');
  assert.throws(() => validateQuantityChangeContract({}), (error) => error instanceof AiRuntimeError && error.code === 'SCHEMA_INVALID');
  assert.throws(() => validateStt({
    transcript: '양파를 캔다.', language_code: 'ko', confidence: Number.NaN,
    schema_version: '1', contract_version: 'stt-v1',
  }), (error) => error instanceof AiRuntimeError && error.code === 'SCHEMA_INVALID');
  assert.throws(() => validateStructureContract(structure({ interpretation: 'UNSUPPORTED' })), /SCHEMA_INVALID/);
  assert.throws(() => validateStructureContract(structure({
    steps: [{ sequence: 1, task_code: null, title_ko: '미지원 작업', description_ko: '미지원 작업을 한다.', unsupported_reason: 'P0 범위 밖' }],
  })), /SCHEMA_INVALID/);
  assert.doesNotThrow(() => validateStructureContract(structure({
    interpretation: 'UNSUPPORTED',
    steps: [{ sequence: 1, task_code: null, title_ko: '미지원 작업', description_ko: '미지원 작업을 한다.', unsupported_reason: 'P0 범위 밖' }],
  })));
});
