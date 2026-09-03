import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  buildEvaluationMetrics,
  extractResponseText,
  isSameSemantic,
  isSameJson,
  parseProviderFailure,
  runEvaluation,
} from '../scripts/run-openai-eval.mjs';
import { buildSttRequest, requireOpenAiKey, resolveOutputDirectory, summarizeSttResults } from '../scripts/run-stt-smoke.mjs';
import { buildTtsRequest, buildTtsSmokeResult, summarizeTtsResult } from '../scripts/run-tts-smoke.mjs';

test('buildSttRequest uses OpenAI transcription endpoint and model', () => {
  const sttRequest = buildSttRequest(new Blob(['synthetic audio']), 'fixture.wav');

  assert.equal(sttRequest.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(sttRequest.body.get('model'), 'gpt-4o-transcribe');
  assert.equal(sttRequest.body.get('file').name, 'fixture.wav');
});

test('buildTtsRequest uses OpenAI speech endpoint and requested TTS defaults', () => {
  const ttsRequest = buildTtsRequest('양파를 수확합니다.', 'alloy');

  assert.equal(ttsRequest.url, 'https://api.openai.com/v1/audio/speech');
  assert.equal(ttsRequest.body.model, 'gpt-4o-mini-tts');
  assert.equal(ttsRequest.body.voice, 'alloy');
  assert.equal(ttsRequest.body.response_format, 'mp3');
});

test('buildTtsRequest rejects input longer than provider limit', () => {
  assert.throws(() => buildTtsRequest('x'.repeat(4097), 'alloy'), /4096/);
});

test('requireOpenAiKey rejects absent key without exposing a value', () => {
  assert.throws(() => requireOpenAiKey({}), /OPENAI_API_KEY/);
});

test('resolveOutputDirectory rejects an outside junction that points into the workspace', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'batmeori-provider-test-'));
  const junction = join(temporary, 'workspace-link');
  try {
    await symlink(resolve('ai'), junction, 'junction');
    await assert.rejects(resolveOutputDirectory(junction), /outside the Git workspace/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('buildTtsSmokeResult matches documented tts-smoke-v1 fields', () => {
  const result = buildTtsSmokeResult({
    id: 'tts-smoke-001',
    language: 'vi',
    text: 'Thu hoạch hành.',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    responseFormat: 'mp3',
    status: 'OK',
    audioSha256: 'audio-hash',
    recordedAt: '2026-09-03T00:00:00.000Z',
  });

  assert.deepEqual(Object.keys(result).sort(), ['audio_sha256', 'contract_version', 'id', 'language_code', 'model', 'recorded_at', 'response_format', 'status', 'text', 'text_sha256', 'voice']);
  assert.equal(result.id, 'tts-smoke-001');
  assert.equal(result.recorded_at, '2026-09-03T00:00:00.000Z');
  assert.equal(result.text, 'Thu hoạch hành.');
});

test('evaluation metrics separate schema, semantic, and exact-text results', () => {
  const metrics = buildEvaluationMetrics({ datasetVersion: 'transcript-jeolla-v1', caseCount: 30, parsedJson: 27, validContract: 26, semanticMatch: 24, exactMatch: 22, failureCount: 6, exactMismatchCount: 8 });

  assert.equal(metrics.dataset_version, 'transcript-jeolla-v1');
  assert.equal(metrics.json_parse_rate, 0.9);
  assert.equal(metrics.schema_validity_rate, 26 / 30);
  assert.equal(metrics.semantic_match_rate, 0.8);
  assert.equal(metrics.failure_count, 6);
  assert.equal(metrics.exact_mismatch_count, 8);
  assert.equal(metrics.structure_prompt_version, 'prompt-structure-004');
  assert.equal(metrics.quantity_prompt_version, 'prompt-quantity-change-002');
});

test('semantic comparison ignores prose but preserves contract meaning', () => {
  const record = {
    kind: 'STRUCTURE',
    gold_structure: {
      interpretation: 'READY', task_family: 'ONION',
      location: { raw_text: '앞밭', kind: 'NAMED', canonical_name: '앞밭' },
      quantity: { value: 10, unit: '망' }, deadline: null, safety: [], notes: null,
      steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 캔다.', unsupported_reason: null }],
      ambiguities: [], summary_ko: '양파를 캔다.', schema_version: '1', contract_version: 'structure-v1',
    },
  };
  const proseChanged = structuredClone(record.gold_structure);
  proseChanged.summary_ko = '앞밭에서 양파 열 망을 수확합니다.';
  proseChanged.steps[0].title_ko = '양파 캐기';
  proseChanged.steps[0].description_ko = '앞밭의 양파를 캡니다.';

  assert.equal(isSameSemantic(record, proseChanged), true);
  proseChanged.quantity.value = 11;
  assert.equal(isSameSemantic(record, proseChanged), false);
});

test('parseProviderFailure retains a bounded OpenAI error summary without a response body dump', async () => {
  const failure = await parseProviderFailure(new Response(JSON.stringify({
    error: { code: 'invalid_json_schema', message: 'Schema uses an unsupported keyword.' },
  }), { status: 400 }));

  assert.deepEqual(failure, {
    status: 'HTTP_400',
    code: 'invalid_json_schema',
    message: 'Schema uses an unsupported keyword.',
  });
});

test('extractResponseText reads the raw REST Responses API output shape', () => {
  const payload = {
    status: 'completed',
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: '{"contract_version":"structure-v1"}' }],
    }],
  };

  assert.equal(extractResponseText(payload), '{"contract_version":"structure-v1"}');
});

test('extractResponseText accepts an SDK-style output_text convenience field', () => {
  assert.equal(extractResponseText({ output_text: '{"ok":true}' }), '{"ok":true}');
});

test('extractResponseText reports refusal and missing output separately', () => {
  assert.throws(() => extractResponseText({
    status: 'completed',
    output: [{ content: [{ type: 'refusal', refusal: 'No.' }] }],
  }), /response_refusal/);
  assert.throws(() => extractResponseText({ status: 'incomplete', output: [] }), /response_output_missing:incomplete/);
});

test('JSON equality does not depend on object key order', () => {
  assert.equal(isSameJson({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }), true);
  assert.equal(isSameJson({ a: 1 }, { a: 2 }), false);
});

test('STT and TTS summaries make CLI results visible without secrets', () => {
  const stt = summarizeSttResults([
    { id: 'a', status: 'OK', matched_expected_transcript: true },
    { id: 'b', status: 'EMPTY_TRANSCRIPT', matched_expected_transcript: false },
  ], 'C:\\Temp\\stt');
  const tts = summarizeTtsResult({ id: 'vi-001', status: 'OK' }, 'C:\\Temp\\tts');

  assert.deepEqual(stt, {
    total_cases: 2,
    pass_count: 1,
    failure_count: 1,
    output_dir: 'C:\\Temp\\stt',
    first_failure: { id: 'b', status: 'EMPTY_TRANSCRIPT', matched_expected_transcript: false },
  });
  assert.deepEqual(tts, { id: 'vi-001', status: 'OK', output_dir: 'C:\\Temp\\tts' });
});

test('evaluation runs all 30 REST responses through parsing, contract validation, and metrics', async () => {
  const dataset = fileURLToPath(new URL('../evals/transcript-v1.jsonl', import.meta.url));
  const records = (await readFile(dataset, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const outputDirectory = await mkdtemp(join(tmpdir(), 'batmeori-eval-e2e-'));
  let call = 0;
  const fakeFetch = async () => {
    const record = records[call++];
    const output = record.kind === 'QUANTITY_CHANGE' ? record.gold_quantity : record.gold_structure;
    return new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
    }), { status: 200 });
  };

  try {
    const { metrics, failures } = await runEvaluation(
      { dataset, output_dir: outputDirectory },
      'test-key',
      fakeFetch,
      () => {},
    );
    assert.equal(call, 30);
    assert.equal(metrics.json_parse_rate, 1);
    assert.equal(metrics.schema_validity_rate, 1);
    assert.equal(metrics.semantic_match_rate, 1);
    assert.equal(metrics.exact_match_rate, 1);
    assert.equal(metrics.exact_mismatch_count, 0);
    assert.equal(metrics.dataset_version, 'transcript-v1');
    assert.deepEqual(failures, []);
    assert.equal(JSON.parse(await readFile(join(outputDirectory, 'metrics.json'), 'utf8')).failure_count, 0);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test('evaluation validates Jeolla provenance and records its dataset version', async () => {
  const dataset = fileURLToPath(new URL('../evals/transcript-jeolla-v1.jsonl', import.meta.url));
  const records = (await readFile(dataset, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const outputDirectory = await mkdtemp(join(tmpdir(), 'batmeori-jeolla-eval-e2e-'));
  let call = 0;
  const fakeFetch = async () => {
    const record = records[call++];
    const output = record.kind === 'QUANTITY_CHANGE' ? record.gold_quantity : record.gold_structure;
    return new Response(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
    }), { status: 200 });
  };

  try {
    const { metrics, failures } = await runEvaluation(
      { dataset, output_dir: outputDirectory },
      'test-key',
      fakeFetch,
      () => {},
    );
    assert.equal(call, 30);
    assert.equal(metrics.dataset_version, 'transcript-jeolla-v1');
    assert.equal(metrics.semantic_match_rate, 1);
    assert.deepEqual(failures, []);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
