import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const ontology = JSON.parse(await readFile(new URL('docs/ontology-v2.json', root)));

test('ontology-v2 accepts every canonical family and code pair', () => {
  for (const [family, codes] of Object.entries(ontology.task_codes_by_family)) {
    for (const code of codes) {
      assert.equal(ontology.task_family_by_code[code], family);
    }
  }
});

test('ontology-v2 rejects legacy codes and family mismatches for new output', () => {
  assert.equal(ontology.task_family_by_code.ONION_COLLECT, undefined);
  assert.equal(ontology.task_family_by_code.BAGGING, undefined);
  assert.notEqual(ontology.task_family_by_code.ONION_HARVEST, 'STRAWBERRY');
  assert.notEqual(ontology.task_family_by_code.STRAWBERRY_HARVEST, 'ONION');
});
