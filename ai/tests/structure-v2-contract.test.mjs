import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const schema = JSON.parse(await readFile(new URL('docs/schemas/structure-v2.schema.json', root)));

test('structure-v2 is an exact versioned object with family-specific task codes', () => {
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.contract_version.const, 'structure-v2');
  assert.equal(schema.properties.ontology_version.const, 'ontology-v2');
  assert.deepEqual(schema.properties.task_family.enum, ['ONION', 'STRAWBERRY']);
  assert.ok(schema.allOf.some((rule) => rule.if?.properties?.task_family?.const === 'ONION'));
  assert.ok(schema.allOf.some((rule) => rule.if?.properties?.task_family?.const === 'STRAWBERRY'));
});
