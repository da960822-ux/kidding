import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../index.mjs';

const structure = {
  interpretation: 'READY', summary_ko: '양파를 수확한다.',
  location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null }, task_family: 'ONION',
  quantity: { value: 200000, unit: '개' }, deadline: null, safety: [], notes: '상한 것은 따로 두세요.',
  steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null }],
  ambiguities: [], schema_version: '2', contract_version: 'structure-v2', ontology_version: 'ontology-v2',
};
const quantityResult = (quantity) => ({ interpretation: 'READY', quantity, expected_version: 2, ambiguities: [], schema_version: '1', contract_version: 'quantity-change-v1' });

test('clear numeric unit disagreement becomes blocking quantity ambiguity in initial, supplement and quantity parse', async () => {
  const requests = [];
  const runtime = createRuntime({ providers: {
    interpretStructureV2: async (request) => { requests.push(request); return structuredClone(structure); },
    interpretQuantityChange: async (request) => { requests.push(request); return quantityResult(structure.quantity); },
  } });
  const transcript = '양파 20망을 수확해';
  const results = [await runtime.buildOwnerDraftV2({ transcript }), await runtime.mergeSupplementV2({ structure: { ...structure, quantity: { value: 15, unit: '망' } }, transcript }), await runtime.parseQuantityChange({ transcript, expected_version: 2 })];
  for (const result of results) {
    assert.equal(result.interpretation, 'AMBIGUOUS');
    assert.equal(result.quantity, null);
    assert.equal(result.ambiguities.some((item) => item.kind === 'QUANTITY' && item.blocking), true);
  }
  assert.deepEqual(results[0].steps, structure.steps);
  assert.equal(results[0].notes, structure.notes);
  assert.equal(results[2].expected_version, 2);
  assert.equal(requests.every((request) => request.transcript === transcript), true);
});

test('an unchanged supplement target is not replaced by an auxiliary count', async () => {
  const previous = { ...structure, quantity: { value: 20, unit: '망' } };
  const output = { ...previous, notes: '상한 양파 3개는 따로 빼 둬' };
  const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(output) } });
  assert.deepEqual(await runtime.mergeSupplementV2({ structure: previous, transcript: '상한 양파 3개는 따로 빼 둬' }), output);
  assert.deepEqual(await runtime.mergeSupplementV2({ structure: previous, transcript: '수량은 그대로야. 상한 양파 3개는 따로 빼 둬' }), output);
});

test('explicit supplement quantity correction is checked even when the provider retains the previous quantity', async () => {
  const previous = { ...structure, quantity: { value: 15, unit: '망' } };
  const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(previous) } });
  for (const transcript of ['수량은20망으로 바꿔', '20망으로 바꿔', '목표량은 20망이야', '총량을 20망으로 맞춰']) {
    const result = await runtime.mergeSupplementV2({ structure: previous, transcript });
    assert.equal(result.interpretation, 'AMBIGUOUS', transcript);
    assert.equal(result.quantity, null);
    assert.equal(result.ambiguities.some((item) => item.kind === 'QUANTITY' && item.blocking), true);
  }
});

test('mixed Korean targets and numeric secondary counts are not treated as single target evidence', async () => {
  const output = { ...structure, quantity: { value: 20, unit: '망' } };
  const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(output) } });
  for (const transcript of ['양파 스무 망을 수확하고 3개는 표본으로 남겨', '양파 이십망을 수확하고 3개는 따로 빼 둬', '양파 스무망을 수확하고 3개는 확인해']) {
    assert.deepEqual(await runtime.buildOwnerDraftV2({ transcript }), output, transcript);
  }
});

test('compound numerals are not validated against a partial trailing digit span', async () => {
  for (const [transcript, value] of [['양파 1천20개 수확', 1020], ['양파 1만2천개 수확', 12000], ['양파 1만 2천개 수확', 12000], ['양파 일천20개 수확', 1020]]) {
    const output = { ...structure, quantity: { value, unit: '개' } };
    const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(output), interpretQuantityChange: async () => quantityResult(output.quantity) } });
    assert.deepEqual(await runtime.buildOwnerDraftV2({ transcript }), output, transcript);
    assert.deepEqual(await runtime.parseQuantityChange({ transcript, expected_version: 2 }), quantityResult(output.quantity), transcript);
  }
});

test('numeric evidence guard preserves genuine large counts, supported quantities and unmentioned supplement quantities', async () => {
  for (const [transcript, quantity] of [
    ['양파 20만개 수확', { value: 200000, unit: '개' }],
    ['양파 20만 개 수확', { value: 200000, unit: '개' }],
    ['양파 20망 수확', { value: 20, unit: '망' }],
    ['양파 3포대 옮겨', { value: 3, unit: '포대' }],
    ['양파 12상자 옮겨', { value: 12, unit: '상자' }],
    ['양파 스무 망 수확', { value: 20, unit: '망' }],
    ['양파 이십 망 수확', { value: 20, unit: '망' }],
    ['양파 2번 밭에서 수확', { value: 20, unit: '망' }],
    ['장소는 창고 앞이야', { value: 20, unit: '망' }],
  ]) {
    const output = { ...structure, quantity };
    const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(output) } });
    assert.deepEqual(await runtime.mergeSupplementV2({ structure: output, transcript }), output, transcript);
  }
});

test('a per-container count is not evidence for replacing a separately stated target', async () => {
  const output = { ...structure, quantity: { value: 20, unit: '망' } };
  const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(output) } });
  for (const transcript of ['양파 스무 망을 상자당 3개씩 담아', '양파 스무 망을 상자마다 3개 넣어']) {
    assert.deepEqual(await runtime.buildOwnerDraftV2({ transcript }), output);
  }
});

test('mismatched unsupported quantity is rejected without weakening the unsupported schema rule', async () => {
  const output = { ...structure, interpretation: 'UNSUPPORTED', steps: [{ ...structure.steps[0], task_code: null, unsupported_reason: '지원하지 않는 비안전 작업' }] };
  const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(output) } });
  await assert.rejects(runtime.buildOwnerDraftV2({ transcript: '양파 20망 작업' }), /INVALID_STRUCTURE_V2_QUANTITY_SOURCE/);
});

test('numeric guard never fills unknown, cancelled, corrected or compound quantities from an isolated digit span', async () => {
  const ambiguous = { ...structure, interpretation: 'AMBIGUOUS', quantity: null, ambiguities: [{ field: 'quantity', message: '수량을 확인해 주세요.', blocking: true, kind: 'QUANTITY' }] };
  for (const transcript of ['양파 20망은 취소해', '양파 20망 말고 15망 수확', '양파 20망인지 모르겠어', '양파 20망과 3상자를 옮겨', '양파 20망 수확']) {
    const runtime = createRuntime({ providers: { interpretStructureV2: async () => structuredClone(ambiguous) } });
    assert.deepEqual(await runtime.buildOwnerDraftV2({ transcript }), ambiguous);
  }
});

test('initial and supplement prompts retain methods, conditions, prohibitions and notes without a new workflow schema', async () => {
  const requests = [];
  const runtime = createRuntime({ providers: { interpretStructureV2: async (request) => { requests.push(request); return structuredClone(structure); } } });
  const transcript = '양파는 잎을 잡고 캐서 줄기를 손질하고 상한 것은 따로 골라 창고로 옮겨. 비가 오면 젖은 것은 나중에 하고 던지지 마. 상자는 그늘에 두어.';
  await runtime.buildOwnerDraftV2({ transcript });
  await runtime.mergeSupplementV2({ structure, transcript });
  for (const request of requests) {
    assert.match(request.prompt, /methods, conditions, prohibitions, and notes/i);
    assert.match(request.prompt, /Never drop notes/i);
    assert.equal('workflow' in request.schema.properties, false);
    assert.equal(request.transcript, transcript);
  }
});
