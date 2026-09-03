import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateDataset, validateDialectProvenance } from '../scripts/validate-transcript-dataset.mjs';

const datasetPath = new URL('../evals/transcript-v1.jsonl', import.meta.url);
const validCases = readFileSync(datasetPath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const dialectDatasetPath = new URL('../evals/transcript-jeolla-v1.jsonl', import.meta.url);
const dialectCases = readFileSync(dialectDatasetPath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const dialectProvenance = JSON.parse(readFileSync(
  new URL('../evals/transcript-jeolla-v1.provenance.json', import.meta.url),
  'utf8',
));

test('accepts the fixed transcript evaluation set', () => {
  assert.deepEqual(validateDataset(validCases), {
    datasetVersion: 'transcript-v1',
    caseCount: 30,
    quantityChangeCount: 5,
    ambiguousCount: 8,
  });
});

test('accepts the synthetic Jeolla dialect set and complete provenance', () => {
  assert.equal(dialectProvenance.guide_forms.length, 8);
  assert.deepEqual(validateDataset(dialectCases), {
    datasetVersion: 'transcript-jeolla-v1',
    caseCount: 30,
    quantityChangeCount: 5,
    ambiguousCount: 8,
  });
  assert.deepEqual(validateDialectProvenance(dialectCases, dialectProvenance), {
    caseCount: 30,
    reviewStatus: 'PENDING',
  });
});

test('rejects dialect provenance without a marker for every case', () => {
  const provenance = structuredClone(dialectProvenance);
  provenance.cases.pop();

  assert.throws(() => validateDialectProvenance(dialectCases, provenance), /every dataset case/);
});

test('rejects dialect provenance without valid printed and PDF page numbers', () => {
  const provenance = structuredClone(dialectProvenance);
  provenance.cases[0].markers[0].pdf_page = 0;

  assert.throws(() => validateDialectProvenance(dialectCases, provenance), /positive integer/);
});

test('rejects a dataset with the wrong case count', () => {
  assert.throws(() => validateDataset(validCases.slice(0, 29)), /exactly 30/);
});

test('rejects an unknown record kind', () => {
  const records = structuredClone(validCases);
  records[0].kind = 'UNSAFE_KIND';

  assert.throws(() => validateDataset(records), /kind/);
});

test('rejects a deictic location without a non-blocking location ambiguity', () => {
  const records = structuredClone(validCases);
  const record = records.find(({ gold_structure }) => gold_structure?.location.kind === 'DEICTIC');
  record.kind = 'STRUCTURE';
  record.gold_structure.interpretation = 'READY';
  record.gold_structure.ambiguities = [];

  assert.throws(() => validateDataset(records), /deictic location/);
});

test('accepts more than five ambiguity cases', () => {
  const records = structuredClone(validCases);
  const record = records.find(({ kind }) => kind === 'STRUCTURE');
  record.kind = 'AMBIGUOUS';
  record.gold_structure.interpretation = 'AMBIGUOUS';
  record.gold_structure.ambiguities = [{
    field: 'location',
    message: '위치를 확인해야 한다.',
    blocking: false,
    kind: 'LOCATION',
  }];

  assert.deepEqual(validateDataset(records), {
    datasetVersion: 'transcript-v1',
    caseCount: 30,
    quantityChangeCount: 5,
    ambiguousCount: 9,
  });
});

test('accepts more than five quantity-change cases', () => {
  const records = structuredClone(validCases);
  const record = records.find(({ kind }) => kind === 'STRUCTURE');
  record.kind = 'QUANTITY_CHANGE';
  record.gold_structure = null;
  record.gold_quantity = {
    interpretation: 'READY',
    quantity: { value: 11, unit: '망' },
    expected_version: 1,
    ambiguities: [],
    schema_version: '1',
    contract_version: 'quantity-change-v1',
  };

  assert.deepEqual(validateDataset(records), {
    datasetVersion: 'transcript-v1',
    caseCount: 30,
    quantityChangeCount: 6,
    ambiguousCount: 8,
  });
});
