import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSupplementRequest,
  buildTranslationRequest,
} from '../lib/openai-requests.mjs';

test('buildSupplementRequest reinterprets validated context and two untrusted transcripts', () => {
  const base = {
    interpretation: 'AMBIGUOUS',
    summary_ko: '위치 확인이 필요하다.',
    location: { raw_text: '저짝', kind: 'DEICTIC', canonical_name: null },
    task_family: 'ONION',
    quantity: 'UNSPECIFIED',
    deadline: null,
    safety: [],
    notes: null,
    steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null }],
    ambiguities: [{ field: 'location', message: '위치 확인 필요', blocking: false, kind: 'LOCATION' }],
    schema_version: '1',
    contract_version: 'structure-v1',
  };

  const request = buildSupplementRequest('저짝 양파 캐', base, '아랫밭이여');

  assert.equal(request.text.format.name, 'structure_v1');
  assert.match(request.input.at(-1).content, /<previous_validated_structure>/);
  assert.match(request.input.at(-1).content, /<untrusted_original_transcript>/);
  assert.match(request.input.at(-1).content, /<untrusted_supplement_transcript>/);
  assert.match(request.input[0].content, /full `structure-v1`/);
});

test('buildTranslationRequest binds translation-v1 and requested worker language', () => {
  const request = buildTranslationRequest('양파를 수확한다.', 'ACTION', 'vi');

  assert.equal(request.model, process.env.OPENAI_MODEL || 'gpt-5.6-terra');
  assert.equal(request.text.format.name, 'translation_v1');
  assert.equal(request.text.format.strict, true);
  assert.match(request.input.at(-1).content, /"language_code":"vi"/);
  assert.match(request.input.at(-1).content, /<untrusted_source_text>/);
  assert.deepEqual(request.tools, []);
});

test('buildTranslationRequest rejects non-worker languages and non-AI segments', () => {
  assert.throws(() => buildTranslationRequest('양파', 'ACTION', 'ko'), /language/);
  assert.throws(() => buildTranslationRequest('조심', 'SAFETY', 'vi'), /SAFETY/);
  assert.throws(() => buildTranslationRequest('20망', 'QUANTITY', 'ne'), /deterministic/);
});
