import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRuntime } from '../index.mjs';
import {
  loadDialectReferenceDocument,
  selectDialectContext,
  validateDialectReferenceDocument,
} from '../lib/dialect-reference.mjs';

const referenceUrl = new URL('../references/dialect-v2.json', import.meta.url);

test('dialect selector routes movement with a destination and excludes unrelated crop hints', async () => {
  const document = await loadDialectReferenceDocument(referenceUrl);
  const context = selectDialectContext('양파 창고로 날러부러', document);

  assert.equal(context.matches.some((match) => match.task_code === 'ONION_TRANSPORT'), true);
  assert.equal(context.matches.some((match) => match.task_code?.startsWith('STRAWBERRY_')), false);
  assert.equal(context.matches.every((match) => match.provenance === 'unverified advisory' && match.review_status === 'PENDING'), true);
  assert.match(JSON.stringify(context), /explicit movement action and explicit destination/);
});

test('unmatched transcript receives no dialect reference context', async () => {
  const document = await loadDialectReferenceDocument(referenceUrl);
  assert.deepEqual(selectDialectContext('오늘 날씨가 좋네', document), { matches: [] });
});

test('controlled evaluation can omit reference context without changing transcript or schema', async () => {
  const requests = [];
  const providers = { interpretQuantityChange: async (request) => { requests.push(request); return {}; } };
  await createRuntime({ providers }).parseQuantityChange({ transcript: '열세 망으로 바꿔부러', expected_version: 1 });
  await createRuntime({ providers, dialectReference: null }).parseQuantityChange({ transcript: '열세 망으로 바꿔부러', expected_version: 1 });
  assert.equal(requests[0].transcript, requests[1].transcript);
  assert.deepEqual(requests[0].schema, requests[1].schema);
  assert.match(requests[0].prompt, /matched_forms/);
  assert.match(requests[1].prompt, /<dialect-context>none selected<\/dialect-context>/);
});

test('reference validator rejects retired task codes', async () => {
  const document = JSON.parse(await readFile(referenceUrl, 'utf8'));
  assert.equal(document.provenance.official_sources.every((source) => ['COLLECTED_UNVERIFIED', 'OBSERVED_PRIMARY_RESEARCH', 'OBSERVED_OFFICIAL_TEXT', 'LOOKUP_ONLY'].includes(source.status)), true);
  assert.equal(document.provenance.examples_status, 'SELF_AUTHORED');
  assert.equal(document.entries.every((entry) => entry.review_status === 'PENDING'), true);
  assert.throws(() => validateDialectReferenceDocument({
    ...document,
    entries: [{ ...document.entries[0], task_code: 'ONION_COLLECT' }],
  }), /INVALID_DIALECT_REFERENCE_TASK_CODE/);
  assert.throws(() => validateDialectReferenceDocument({
    ...document,
    entries: [{ ...document.entries[0], source_ids: ['missing-source'] }],
  }), /INVALID_DIALECT_REFERENCE_MISSING_SOURCE_ID/);
});

test('initial structure wiring keeps transcript unchanged and sends selected context', async () => {
  let request;
  const runtime = createRuntime({
    providers: {
      interpretStructureV2: async (value) => {
        request = value;
        return {
          interpretation: 'READY', summary_ko: '양파 운반',
          location: { raw_text: '창고', kind: 'NAMED', canonical_name: '창고' },
          task_family: 'ONION', quantity: 'UNSPECIFIED', deadline: null, safety: [], notes: null,
          steps: [{ sequence: 1, task_code: 'ONION_TRANSPORT', title_ko: '양파 운반', description_ko: '양파를 창고로 옮긴다.', unsupported_reason: null }],
          ambiguities: [], schema_version: '2', contract_version: 'structure-v2', ontology_version: 'ontology-v2',
        };
      },
    },
  });
  const transcript = '양파 창고로 날러부러';
  await runtime.buildOwnerDraftV2({ transcript });

  assert.equal(request.transcript, transcript);
  assert.match(request.prompt, /<dialect-context>/);
  assert.match(request.prompt, /ONION_TRANSPORT/);
  assert.match(request.prompt, /explicit movement action and explicit destination/);
});

test('supplement and quantity wiring select only relevant dialect context', async () => {
  const requests = [];
  const runtime = createRuntime({
    providers: {
      interpretStructureV2: async (value) => {
        requests.push(value);
        return {
          interpretation: 'READY', summary_ko: '양파 수확',
          location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null },
          task_family: 'ONION', quantity: 'UNSPECIFIED', deadline: null, safety: [], notes: null,
          steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null }],
          ambiguities: [], schema_version: '2', contract_version: 'structure-v2', ontology_version: 'ontology-v2',
        };
      },
      interpretQuantityChange: async (value) => {
        requests.push(value);
        return { interpretation: 'AMBIGUOUS', quantity: null, expected_version: 1, ambiguities: [{ field: 'quantity', message: '수량을 알 수 없다.', blocking: true, kind: 'QUANTITY' }], schema_version: '1', contract_version: 'quantity-change-v1' };
      },
    },
  });
  const structure = {
    interpretation: 'READY', summary_ko: '양파 수확',
    location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null }, task_family: 'ONION',
    quantity: 'UNSPECIFIED', deadline: null, safety: [], notes: null,
    steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null }],
    ambiguities: [], schema_version: '2', contract_version: 'structure-v2', ontology_version: 'ontology-v2',
  };
  await runtime.mergeSupplementV2({ structure, transcript: '양파 망캐갖고' });
  await runtime.parseQuantityChange({ transcript: '수량은 아직 모르겠어', expected_version: 1 });

  assert.match(requests[0].prompt, /ONION_HARVEST/);
  assert.doesNotMatch(requests[0].prompt, /QUANTITY_CHANGE/);
  assert.match(requests[1].prompt, /quantity is explicitly unresolved|quantity ambiguity/i);
});
