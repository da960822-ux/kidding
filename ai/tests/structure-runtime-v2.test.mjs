import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStructureV2 } from '../lib/structure-v2-contract.mjs';

const valid = { interpretation: 'READY', summary_ko: '양파 수확', location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null }, task_family: 'ONION', quantity: { value: 20, unit: '망' }, deadline: null, safety: [], notes: null, steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null }], ambiguities: [], schema_version: '2', contract_version: 'structure-v2', ontology_version: 'ontology-v2' };

test('validateStructureV2 accepts a schema-complete executable v2 structure', () => {
  assert.deepEqual(validateStructureV2(valid), { ok: true });
});

test('validateStructureV2 rejects wrong version, family mismatch, and empty executable steps', () => {
  assert.equal(validateStructureV2({ ...valid, contract_version: 'structure-v1' }).ok, false);
  assert.equal(validateStructureV2({ ...valid, task_family: 'STRAWBERRY' }).ok, false);
  assert.equal(validateStructureV2({ ...valid, steps: [] }).ok, false);
});

test('validateStructureV2 rejects invalid consumed nested schema fields', () => {
  const cases = [
    { ...valid, summary_ko: '' },
    { ...valid, quantity: { value: 0, unit: '' } },
    { ...valid, location: { kind: 'UNSPECIFIED', raw_text: null } },
    { ...valid, location: { ...valid.location, extra: true } },
    { ...valid, steps: [{ ...valid.steps[0], extra: true }] },
    { ...valid, steps: [{ ...valid.steps[0], unsupported_reason: 'not allowed' }] },
    { ...valid, interpretation: 'AMBIGUOUS', steps: [] }
  ];
  for (const candidate of cases) assert.equal(validateStructureV2(candidate).ok, false);
});

test('validateStructureV2 permits only an explicit UNSUPPORTED text fallback step', () => {
  const unsupported = { ...valid, interpretation: 'UNSUPPORTED', steps: [{ ...valid.steps[0], task_code: null, unsupported_reason: 'P0 밖의 비안전 작업' }] };
  assert.equal(validateStructureV2(unsupported).ok, true);
  assert.equal(validateStructureV2({ ...unsupported, steps: [{ ...unsupported.steps[0], unsupported_reason: null }] }).ok, false);
});
