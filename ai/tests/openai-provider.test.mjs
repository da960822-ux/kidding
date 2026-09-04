import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOpenAiProvider } from '../lib/openai-provider.mjs';

const transcriptionPrompt = await readFile(new URL('../prompts/prompt-transcription-002.md', import.meta.url), 'utf8');
const transcriptionReviewPrompt = await readFile(new URL('../prompts/prompt-transcription-review-001.md', import.meta.url), 'utf8');

test('quantity sack units use the same canonical terms without a provider request', async () => {
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async () => {
    assert.fail('Exact quantity units must not require a provider request');
  } });
  assert.equal(await provider.translate({ languageCode: 'vi', segment: 'QUANTITY', text: '망' }), 'bao');
  assert.equal(await provider.translate({ languageCode: 'ne', segment: 'QUANTITY', text: '망' }), 'बोरा');
});

test('sentence translation shares sack terminology while retaining source text and glossary priority', async () => {
  const requests = [];
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ output_text: '{"text":"translated"}' }) };
  } });
  const text = '양파 20망을 캐고, 2망씩 옮겨. 던지지 말고 11시까지 끝내.';
  for (const [languageCode, term] of [['vi', 'bao'], ['ne', 'बोरा']]) {
    const glossary = [{ canonical_ko: '망', language_code: languageCode, translated_text: 'reviewed-sack', verified: true }];
    for (const segment of ['ACTION', 'OTHER']) {
      assert.equal(await provider.translate({ languageCode, segment, text, glossary }), 'translated');
      const request = requests.at(-1);
      const system = request.input.find((item) => item.role === 'system').content;
      assert.ok(system.includes(term));
      assert.match(system, /망/);
      assert.match(system, /verified glossary.*precedence/i);
      assert.match(system, /numbers.*units.*conditions.*prohibitions.*notes/i);
      assert.match(system, /Do not summarize or add missing facts/);
      assert.match(system, /requested language.*particles/i);
      assert.equal(JSON.parse(request.input.find((item) => item.role === 'user').content).text, text);
      assert.deepEqual(JSON.parse(request.input.find((item) => item.role === 'user').content).glossary, glossary);
    }
  }
  assert.equal(requests.length, 4);
});

test('other units and non-quantity text still use provider translation', async () => {
  const requests = [];
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ output_text: '{"text":"translated"}' }) };
  } });
  for (const [segment, text] of [['QUANTITY', '상자'], ['QUANTITY', '20망'], ['OTHER', '망']]) {
    assert.equal(await provider.translate({ languageCode: 'vi', segment, text }), 'translated');
  }
  assert.equal(requests.length, 3);
});

test('transcription uses Korean and accepts a high-confidence primary result', async () => {
  const requests = [];
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, transcriptionPrompt, fetchImpl: async (_url, init) => {
    requests.push(init.body);
    return { ok: true, json: async () => ({ text: '양파 스무 망을 수확해.', logprobs: [{ token: '양파', logprob: -0.01 }, { token: ' 스무', logprob: -0.05 }] }) };
  } });

  const result = await provider.transcribe({ audio_base64: 'AQID', filename: 'recording.webm', content_type: 'audio/webm', language_hint: 'en' });

  assert.deepEqual(result, { transcript: '양파 스무 망을 수확해.' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].get('model'), 'gpt-transcribe');
  assert.equal(requests[0].get('language'), 'ko');
  assert.equal(requests[0].get('response_format'), 'json');
  assert.deepEqual(requests[0].getAll('include[]'), ['logprobs']);
  assert.match(requests[0].get('prompt'), /문맥에 맞는 표준 한국어/);
  assert.doesNotMatch(requests[0].get('prompt'), /양파|딸기|망|뿌리|입가|잎과/);
  assert.deepEqual(requests[0].getAll('keywords[]'), []);
});

test('low-confidence transcription is accepted only when independent verification agrees', async () => {
  const requests = [];
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, transcriptionPrompt, fetchImpl: async (_url, init) => {
    requests.push(init.body);
    return requests.length === 1
      ? { ok: true, json: async () => ({ text: '양파 스무 망을 수확해.', logprobs: [{ token: ' 스무', logprob: -1.2 }] }) }
      : { ok: true, json: async () => ({ text: '양파 스무 망을 수확해' }) };
  } });

  assert.deepEqual(await provider.transcribe({ audio_base64: 'AQID' }), { transcript: '양파 스무 망을 수확해.' });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].get('model'), 'gpt-4o-transcribe');
  assert.equal(requests[1].get('response_format'), null);
  assert.deepEqual(requests[1].getAll('include[]'), []);
  assert.equal(requests[1].get('prompt'), transcriptionPrompt.trim());
});

test('low-confidence split UTF-8 tokens trigger verification instead of silently losing an action', async () => {
  let callCount = 0;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, transcriptionReviewPrompt, fetchImpl: async () => {
    callCount += 1;
    if (callCount === 1) return { ok: true, json: async () => ({ text: '두 번 밭 양파 서른두 망 해서 창고로 옮겨.', logprobs: [
      { token: ' 양', logprob: -0.01, bytes: [32, 236, 150, 145] },
      { token: ' �', logprob: -0.67, bytes: [32, 235, 176] },
      { token: '�', logprob: -0.01, bytes: [173] },
    ] }) };
    if (callCount === 2) return { ok: true, json: async () => ({ text: '두 번 밭 양파 서른두 망 캐서 창고로 옮겨.' }) };
    return { ok: true, json: async () => ({ output_text: '{"choice":"UNCLEAR"}' }) };
  } });
  assert.deepEqual(await provider.transcribe({ audio_base64: 'AQID' }), { transcript: '' });
  assert.equal(callCount, 3);
});

test('low-confidence disagreement uses contextual candidate selection without hardcoded correction', async () => {
  let callCount = 0;
  let reviewRequest;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, transcriptionReviewPrompt, fetchImpl: async (_url, init) => {
    callCount += 1;
    if (callCount === 1) return { ok: true, json: async () => ({ text: '입가 뿌리를 다듬어.', logprobs: [{ token: '입가', logprob: -1.2 }] }) };
    if (callCount === 2) return { ok: true, json: async () => ({ text: '잎과 뿌리를 다듬어.' }) };
    reviewRequest = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: '{"choice":"B"}' }) };
  } });

  assert.deepEqual(await provider.transcribe({ audio_base64: 'AQID' }), { transcript: '잎과 뿌리를 다듬어.' });
  assert.equal(callCount, 3);
  assert.equal(reviewRequest.model, 'gpt-4o-mini');
  assert.match(reviewRequest.input[0].content, /<candidate-a>입가 뿌리를 다듬어.<\/candidate-a>/);
  assert.doesNotMatch(transcriptionReviewPrompt, /양파|딸기|망|뿌리|입가|잎과/);
});

test('uncertain contextual review still rejects the transcript', async () => {
  let callCount = 0;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, transcriptionReviewPrompt, fetchImpl: async () => {
    callCount += 1;
    if (callCount === 1) return { ok: true, json: async () => ({ text: '열 망을 옮겨.', logprobs: [{ token: '열', logprob: -1.2 }] }) };
    if (callCount === 2) return { ok: true, json: async () => ({ text: '스무 망을 옮겨.' }) };
    return { ok: true, json: async () => ({ output_text: '{"choice":"UNCLEAR"}' }) };
  } });

  assert.deepEqual(await provider.transcribe({ audio_base64: 'AQID' }), { transcript: '' });
});

test('transcription preserves an empty provider transcript for unclear-audio handling', async () => {
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async () => ({
    ok: true,
    json: async () => ({ text: '' }),
  }) });

  assert.deepEqual(await provider.transcribe({ audio_base64: 'AQID' }), { transcript: '' });
});

test('structure requests adapt the contract schema and read REST response output', async () => {
  let request;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: '{"interpretation":"READY"}' }] }] }) };
  } });
  const result = await provider.interpretStructureV2({
    prompt: 'prompt', transcript: '양파 수확',
    schema: { type: 'object', allOf: [{ if: {}, then: {} }], properties: { interpretation: { enum: ['READY', 'AMBIGUOUS'] }, version: { const: '2' } } },
  });

  assert.deepEqual(result, { interpretation: 'READY' });
  assert.equal(request.text.format.schema.allOf, undefined);
  assert.equal(request.text.format.schema.properties.interpretation.type, 'string');
  assert.equal(request.text.format.schema.properties.version.type, 'string');
});

test('synthesize returns a deterministic transport contract with bytes, hash, and no public URL', async () => {
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test-model', OPENAI_TTS_VOICE: 'test-voice' }, fetchImpl: async (_url, init) => {
    assert.match(init.body, /gpt-4o-mini-tts/);
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  } });
  const result = await provider.synthesize({ text: 'vi:양파 수확', languageCode: 'vi' });
  assert.deepEqual(result, { status: 'READY', text_hash: 'b0f5459d9cf4c6f2fcd26420e98adbf3cc3d448891685b1c6e59dfc0c6ed7eb1', audio_url: null, audio_bytes_base64: 'AQID' });
});

test('quantity parsing sends the versioned prompt rule for an explicit Korean target', async () => {
  let request;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'test' }, fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ interpretation: 'READY', quantity: { value: 12, unit: '망' }, expected_version: 4, ambiguities: [], schema_version: '1', contract_version: 'quantity-change-v1' }) }) };
  } });
  await provider.interpretQuantityChange({ prompt: '`열두 망으로 맞춰` is a READY quantity change.', transcript: '열두 망으로 맞춰', expected_version: 4, schema: { type: 'object' } });
  assert.match(request.input[0].content, /`열두 망으로 맞춰` is a READY quantity change/);
  assert.match(request.input[0].content, /<owner-transcript>열두 망으로 맞춰<\/owner-transcript>/);
});
