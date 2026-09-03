import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildQuantityChangeRequest,
  buildStructureRequest,
  assertOpenAiStructuredOutputSchema,
  toOpenAiStructuredOutputSchema,
} from '../lib/openai-requests.mjs';

const root = new URL('../..', import.meta.url);
const schema = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const parsingReference = JSON.parse(readFileSync(new URL('../references/structure-parsing-v1.json', import.meta.url), 'utf8'));

test('buildStructureRequest binds structure schema and delimits untrusted transcript', () => {
  const request = buildStructureRequest('저짝 양파 스무 망 캐갖고');

  assert.equal(request.model, process.env.OPENAI_MODEL || 'gpt-5.6-terra');
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.name, 'structure_v1');
  assert.equal(request.text.format.strict, true);
  assert.ok('allOf' in schema('docs/schemas/structure-v1.schema.json'));
  assert.equal(JSON.stringify(request.text.format.schema).includes('"allOf"'), false);
  assert.equal(JSON.stringify(request.text.format.schema).includes('"oneOf"'), false);
  assert.equal(JSON.stringify(request.text.format.schema).includes('"anyOf"'), true);
  assert.match(request.input.at(-1).content, /<untrusted_transcript>/);
  assert.match(request.input.at(-1).content, /저짝 양파 스무 망 캐갖고/);
  assert.deepEqual(request.tools, []);
});

test('buildQuantityChangeRequest binds quantity schema and expected version', () => {
  const request = buildQuantityChangeRequest('열다섯 망으로 바꿔', 1);

  assert.equal(request.model, process.env.OPENAI_MODEL || 'gpt-5.6-terra');
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.name, 'quantity_change_v1');
  assert.equal(request.text.format.strict, true);
  assert.ok('oneOf' in schema('docs/schemas/quantity-change-v1.schema.json'));
  assert.equal(JSON.stringify(request.text.format.schema).includes('"allOf"'), false);
  assert.equal(JSON.stringify(request.text.format.schema).includes('"oneOf"'), false);
  assert.equal(JSON.stringify(request.text.format.schema).includes('"anyOf"'), true);
  assert.match(request.input.at(-1).content, /<untrusted_transcript>/);
  assert.match(request.input.at(-1).content, /"expected_version":1/);
  assert.deepEqual(request.tools, []);
});

test('OpenAI schema adapter adds types for enum and const fields', () => {
  const adapted = toOpenAiStructuredOutputSchema(schema('docs/schemas/structure-v1.schema.json'));

  assert.equal(adapted.properties.task_family.type, 'string');
  assert.equal(adapted.properties.interpretation.type, 'string');
  assert.deepEqual(adapted.properties.steps.items.properties.task_code.type, ['string', 'null']);
});

test('OpenAI schema adapter removes unsupported metadata and conditional composition', () => {
  for (const path of ['docs/schemas/structure-v1.schema.json', 'docs/schemas/quantity-change-v1.schema.json']) {
    const adapted = toOpenAiStructuredOutputSchema(schema(path));
    assert.doesNotThrow(() => assertOpenAiStructuredOutputSchema(adapted));
    assert.equal(JSON.stringify(adapted).match(/"(?:allOf|oneOf|not|if|then|else|\\$schema|\\$id|title)"/), null);
  }
});

test('structure prompt v4 requires evidence-bound parsing', () => {
  const prompt = buildStructureRequest('저짝 양파 스무 망 캐라').input[0].content;

  assert.match(prompt, /prompt-structure-004/);
  assert.match(prompt, /only from evidence in the transcript/);
  assert.match(prompt, /explicit action-verb evidence span/);
  assert.match(prompt, /exactly one explicit positive integer/);
  assert.match(prompt, /reference invariant/);
});

test('structure request supplies a trusted parsing reference and evidence rules', () => {
  const prompt = buildStructureRequest('양파 세 망 손으로 실어 나뚸잉').input[0].content;

  assert.match(prompt, /<trusted_structure_parsing_reference>/);
  assert.match(prompt, /"reference_version":"jeolla-structure-v1"/);
  assert.match(prompt, /evidence in the transcript/);
  assert.match(prompt, /Before returning JSON/);
});

test('parsing reference defines general note, compound-action, and location boundaries', () => {
  assert.ok(parsingReference.field_rules.notes.excluded_roles.includes('DESTINATION_OR_ACTION_COMPLEMENT'));
  assert.equal(parsingReference.task_semantics.find(({ task_code: code }) => code === 'ONION_COLLECT').merge_surface_verbs, true);
  assert.equal(parsingReference.field_rules.location.embedded_deictic_is_named, true);
  assert.equal(parsingReference.field_rules.recalled_context.requires_task_and_location_ambiguity, true);
});

test('quantity prompt v2 treats a spoken target quantity as ready', () => {
  const prompt = buildQuantityChangeRequest('열두 망으로 맞춰', 4).input[0].content;

  assert.match(prompt, /prompt-quantity-change-002/);
  assert.match(prompt, /`열두 망으로 맞춰` states a READY change to/);
});
