import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v2 transcript evaluation set has 30 versioned identity-free cases', async () => {
  const rows = (await readFile(new URL('../evals/transcript-v2.jsonl', import.meta.url), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(rows.length, 30);
  assert.equal(new Set(rows.map((row) => row.id)).size, 30);
  assert.equal(rows.every((row) => row.dataset_version === 'transcript-v2' && !('owner_id' in row) && !('farm_id' in row) && !('member_id' in row)), true);
  assert.equal(rows.filter((row) => row.kind === 'QUANTITY_CHANGE').length, 5);
  assert.equal(rows.filter((row) => row.expected.interpretation === 'AMBIGUOUS').length >= 5, true);
});
