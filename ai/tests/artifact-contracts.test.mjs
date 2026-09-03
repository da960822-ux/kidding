import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('AI artifact paths are documented', async () => {
  const [evals, dataModel, workbook] = await Promise.all([
    read('docs/EVALS.md'),
    read('docs/DATA_MODEL.md'),
    read('docs/reference/government_guide_extraction_workbook.md'),
  ]);

  assert.match(evals, /ai\/evals\/transcript-v1\.jsonl/);
  assert.match(evals, /ai\/evals\/transcript-jeolla-v1\.jsonl/);
  assert.match(dataModel, /ai\/manifests\/visual_assets\.csv/);
  assert.match(workbook, /ai\/manifests\/guide_translations\.csv/);
});
