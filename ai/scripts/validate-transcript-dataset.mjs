import { readFile } from 'node:fs/promises';

const rows = (await readFile(process.argv[2] ?? new URL('../evals/transcript-v2.jsonl', import.meta.url), 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
if (rows.length !== 33) throw new Error('EXPECTED_33_TRANSCRIPT_CASES');
if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error('DUPLICATE_CASE_ID');
if (rows.some((row) => row.dataset_version !== 'transcript-v2' || ['owner_id', 'farm_id', 'member_id', 'worker_id'].some((key) => key in row))) throw new Error('INVALID_OR_IDENTITY_CASE');
if (rows.filter((row) => row.kind === 'QUANTITY_CHANGE').length !== 5) throw new Error('EXPECTED_5_QUANTITY_CASES');
if (rows.filter((row) => row.expected.interpretation === 'AMBIGUOUS').length < 5) throw new Error('EXPECTED_5_AMBIGUITY_CASES');
