import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeStructure } from '../lib/structure-normalization.mjs';

const structure = (overrides = {}) => ({
  interpretation: 'READY',
  summary_ko: '양파 작업',
  location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null },
  task_family: 'ONION',
  quantity: { value: 10, unit: '망' },
  deadline: null,
  safety: [],
  notes: null,
  steps: [{ sequence: 1, task_code: 'ONION_COLLECT', title_ko: '양파 모으기', description_ko: '양파를 모은다.', unsupported_reason: null }],
  ambiguities: [],
  schema_version: '1',
  contract_version: 'structure-v1',
  ...overrides,
});

test('normalizes a named location phrase by removing its trailing particle', () => {
  const result = normalizeStructure('양파를 창고 안에 옮겨라.', structure({
    location: { raw_text: '창고 안에', kind: 'NAMED', canonical_name: '창고 안' },
  }));

  assert.deepEqual(result.location, { raw_text: '창고 안', kind: 'NAMED', canonical_name: '창고 안' });
});

test('keeps a deictic token inside a named place as a named location', () => {
  const result = normalizeStructure('양파를 창고 한쪽에 쌓아라.', structure({
    location: { raw_text: '창고 한쪽에', kind: 'DEICTIC', canonical_name: null },
    interpretation: 'AMBIGUOUS',
    ambiguities: [{ field: 'location', message: '위치를 확인한다.', blocking: false, kind: 'LOCATION' }],
  }));

  assert.deepEqual(result.location, { raw_text: '창고 한쪽', kind: 'NAMED', canonical_name: '창고 한쪽' });
  assert.equal(result.interpretation, 'READY');
  assert.deepEqual(result.ambiguities, []);
});

test('merges coordinated collection verbs into one ordered step', () => {
  const result = normalizeStructure('양파를 주워서 모아라.', structure({
    steps: [
      { sequence: 1, task_code: 'ONION_COLLECT', title_ko: '양파 줍기', description_ko: '양파를 줍는다.', unsupported_reason: null },
      { sequence: 2, task_code: 'ONION_COLLECT', title_ko: '양파 모으기', description_ko: '양파를 모은다.', unsupported_reason: null },
    ],
  }));

  assert.deepEqual(result.steps.map(({ sequence, task_code }) => ({ sequence, task_code })), [{ sequence: 1, task_code: 'ONION_COLLECT' }]);
});

test('removes invented location ambiguity from an executable instruction', () => {
  const result = normalizeStructure('양파 열 망을 담아라.', structure({
    interpretation: 'AMBIGUOUS',
    ambiguities: [{ field: 'location', message: '위치가 없다.', blocking: true, kind: 'LOCATION' }],
  }));

  assert.equal(result.interpretation, 'READY');
  assert.deepEqual(result.ambiguities, []);
});

test('uses transcript action evidence instead of a transport hallucination', () => {
  const result = normalizeStructure('양파를 실어 나뚸라.', structure({
    steps: [{ sequence: 1, task_code: 'WAREHOUSE_TRANSPORT', title_ko: '운반', description_ko: '옮긴다.', unsupported_reason: null }],
  }));

  assert.equal(result.steps[0].task_code, 'LOADING');
});
