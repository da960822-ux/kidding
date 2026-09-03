import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { buildQuantityChangeRequest, buildStructureRequest } from '../lib/openai-requests.mjs';
import { OpenAiTransportError, requestOpenAi, requireCompletedResponse } from '../lib/openai-transport.mjs';
import { normalizeStructure } from '../lib/structure-normalization.mjs';
import { validateDataset, validateDialectProvenance, validateQuantityChange, validateStructure } from './validate-transcript-dataset.mjs';
import { requireOpenAiKey, resolveOutputDirectory } from './run-stt-smoke.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_DATASET = resolve(ROOT, 'ai/evals/transcript-v1.jsonl');
const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const usage = 'usage: node ai/scripts/run-openai-eval.mjs --output-dir <outside-git-dir> [--dataset <path>]';

function parseArgs(args) {
  const options = { dataset: DEFAULT_DATASET };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--help' || value === '-h') return { help: true };
    if (value === '--output-dir' || value === '--dataset') {
      if (!args[index + 1]) throw new Error(usage);
      options[value.slice(2).replace('-', '_')] = resolve(args[++index]);
    } else throw new Error(usage);
  }
  if (!options.output_dir) throw new Error(usage);
  return options;
}

export const isSameJson = (left, right) => isDeepStrictEqual(left, right);

const ambiguityMeaning = (items) => items
  .map(({ field, blocking, kind }) => ({ field, blocking, kind }))
  .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

export function isSameSemantic(record, actual) {
  const expected = record.kind === 'QUANTITY_CHANGE' ? record.gold_quantity : record.gold_structure;
  if (record.kind === 'QUANTITY_CHANGE') return isDeepStrictEqual({
    interpretation: actual.interpretation,
    quantity: actual.quantity,
    expected_version: actual.expected_version,
    ambiguities: ambiguityMeaning(actual.ambiguities),
  }, {
    interpretation: expected.interpretation,
    quantity: expected.quantity,
    expected_version: expected.expected_version,
    ambiguities: ambiguityMeaning(expected.ambiguities),
  });
  const meaning = (value) => ({
    interpretation: value.interpretation,
    location: value.location,
    task_family: value.task_family,
    quantity: value.quantity,
    deadline: value.deadline,
    safety: value.safety,
    notes: value.notes,
    steps: value.steps.map(({ sequence, task_code, unsupported_reason }) => ({ sequence, task_code, unsupported_reason })),
    ambiguities: ambiguityMeaning(value.ambiguities),
  });
  return isDeepStrictEqual(meaning(actual), meaning(expected));
}

export function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text) return payload.output_text;
  const content = Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    : [];
  const text = content
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  if (text) return text;
  if (content.some((part) => part?.type === 'refusal')) throw new Error('response_refusal');
  throw new Error(`response_output_missing:${payload?.status || 'unknown'}`);
}

export const buildEvaluationMetrics = ({ datasetVersion, caseCount, parsedJson, validContract, semanticMatch, exactMatch, failureCount, exactMismatchCount }) => ({
  dataset_version: datasetVersion,
  model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
  structure_prompt_version: 'prompt-structure-004',
  quantity_prompt_version: 'prompt-quantity-change-002',
  total_cases: caseCount,
  json_parse_rate: parsedJson / caseCount,
  schema_validity_rate: validContract / caseCount,
  semantic_match_rate: semanticMatch / caseCount,
  exact_match_rate: exactMatch / caseCount,
  failure_count: failureCount,
  exact_mismatch_count: exactMismatchCount,
  release_evidence: 'HUMAN_REVIEW_REQUIRED',
});

export async function parseProviderFailure(response) {
  let error = null;
  try { error = (await response.json()).error; } catch { /* use status only */ }
  return {
    status: `HTTP_${response.status}`,
    code: typeof error?.code === 'string' ? error.code : null,
    message: typeof error?.message === 'string' ? error.message.slice(0, 500) : null,
  };
}

export async function runEvaluation(options, key, fetchImpl = fetch, log = console.log) {
  const records = (await readFile(options.dataset, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const dataset = validateDataset(records);
  if (dataset.datasetVersion === 'transcript-jeolla-v1') {
    const provenancePath = options.dataset.replace(/\.jsonl$/i, '.provenance.json');
    validateDialectProvenance(records, JSON.parse(await readFile(provenancePath, 'utf8')));
  }
  const failures = [];
  const exactMismatches = [];
  let parsedJson = 0;
  let validContract = 0;
  let semanticMatch = 0;
  let exactMatch = 0;

  for (const record of records) {
    const expected = record.kind === 'QUANTITY_CHANGE' ? record.gold_quantity : record.gold_structure;
    const request = record.kind === 'QUANTITY_CHANGE'
      ? buildQuantityChangeRequest(record.transcript, record.gold_quantity.expected_version)
      : buildStructureRequest(record.transcript);
    try {
      const response = await requestOpenAi({
        url: RESPONSES_URL,
        key,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        fetchImpl,
      });
      const payload = requireCompletedResponse(await response.json());
      let outputText;
      try { outputText = extractResponseText(payload); } catch (error) {
        failures.push({ id: record.id, stage: 'response_output', reason: error.message });
        continue;
      }
      let output;
      try { output = JSON.parse(outputText); } catch {
        failures.push({ id: record.id, stage: 'json_parse' });
        continue;
      }
      if (record.kind !== 'QUANTITY_CHANGE' && Array.isArray(output?.steps) && output.steps.every((step, index) => step?.sequence === index + 1)) {
        output = normalizeStructure(record.transcript, output);
      }
      parsedJson += 1;
      try {
        if (record.kind === 'QUANTITY_CHANGE') validateQuantityChange(output, record.id);
        else validateStructure(output, record.id);
      } catch (error) {
        failures.push({ id: record.id, stage: 'schema_validation', reason: error.message.slice(0, 500), actual: output });
        continue;
      }
      validContract += 1;
      if (isSameSemantic(record, output)) semanticMatch += 1;
      else failures.push({ id: record.id, stage: 'semantic_match', expected, actual: output });
      if (isSameJson(output, expected)) exactMatch += 1;
      else exactMismatches.push({ id: record.id, stage: 'exact_match', expected, actual: output });
    } catch (error) {
      if (error instanceof OpenAiTransportError) {
        failures.push({
          id: record.id,
          stage: error.type,
          status: error.status === null ? null : `HTTP_${error.status}`,
          code: error.code,
        });
      } else failures.push({ id: record.id, stage: 'request_error' });
    }
  }

  const metrics = buildEvaluationMetrics({
    datasetVersion: dataset.datasetVersion,
    caseCount: dataset.caseCount,
    parsedJson,
    validContract,
    semanticMatch,
    exactMatch,
    failureCount: failures.length,
    exactMismatchCount: exactMismatches.length,
  });
  await writeFile(resolve(options.output_dir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  await writeFile(resolve(options.output_dir, 'failures.jsonl'), failures.length ? `${failures.map(JSON.stringify).join('\n')}\n` : '', 'utf8');
  await writeFile(resolve(options.output_dir, 'exact-mismatches.jsonl'), exactMismatches.length ? `${exactMismatches.map(JSON.stringify).join('\n')}\n` : '', 'utf8');
  log(JSON.stringify({ ...metrics, output_dir: options.output_dir, first_failure: failures[0] || null }));
  if (failures.length) process.exitCode = 1;
  return { metrics, failures };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(usage);
  const key = requireOpenAiKey();
  options.output_dir = await resolveOutputDirectory(options.output_dir);
  await runEvaluation(options, key);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
