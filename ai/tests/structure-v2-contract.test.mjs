import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const schema = JSON.parse(await readFile(new URL('docs/schemas/structure-v2.schema.json', root)));
const prompt = await readFile(new URL('ai/prompts/prompt-structure-005.md', root), 'utf8');

test('structure-v2 is an exact versioned object with family-specific task codes', () => {
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.contract_version.const, 'structure-v2');
  assert.equal(schema.properties.ontology_version.const, 'ontology-v2');
  assert.deepEqual(schema.properties.task_family.enum, ['ONION', 'STRAWBERRY']);
  assert.deepEqual(schema.$defs.step.properties.task_code.anyOf[0].enum, [
    'ONION_HARVEST', 'ONION_TRIMMING', 'ONION_SORTING', 'ONION_TRANSPORT',
    'STRAWBERRY_HARVEST', 'STRAWBERRY_SORTING', 'STRAWBERRY_INSPECTION', 'STRAWBERRY_PACKING',
  ]);
  assert.ok(schema.allOf.some((rule) => rule.if?.properties?.task_family?.const === 'ONION'));
  assert.ok(schema.allOf.some((rule) => rule.if?.properties?.task_family?.const === 'STRAWBERRY'));
});

test('structure prompt states semantic rules omitted by provider schema adaptation', () => {
  assert.match(prompt, /Every non-null `task_code` must match `task_family`/);
  assert.match(prompt, /Use `task_code: null` only for `interpretation: UNSUPPORTED`/);
  assert.match(prompt, /`AMBIGUOUS` requires at least one ambiguity/);
});
