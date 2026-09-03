import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkerBriefing, loadDefaultGuideRows, loadDefaultVisualRows, synthesizeSpeech } from '../lib/worker-briefing.mjs';

const baseStructure = () => ({
  interpretation: 'READY',
  summary_ko: '아랫밭 양파 20망을 캐서 모은다.',
  location: { raw_text: '아랫밭', kind: 'NAMED', canonical_name: '아랫밭' },
  task_family: 'ONION',
  quantity: { value: 20, unit: '망' },
  deadline: null,
  safety: [],
  notes: null,
  steps: [
    { sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 캔다.', unsupported_reason: null },
    { sequence: 2, task_code: 'ONION_COLLECT', title_ko: '양파 모으기', description_ko: '캔 양파를 한데 모은다.', unsupported_reason: null },
  ],
  ambiguities: [],
  schema_version: '1',
  contract_version: 'structure-v1',
});

const fakeRespond = async (request) => {
  const content = request.input.at(-1).content;
  const language = content.includes('"language_code":"vi"') ? 'vi' : 'ne';
  const segment = content.match(/"segment":"([A-Z]+)"/)[1];
  const source = JSON.parse(content.match(/<untrusted_source_text>\n(.+)\n<\/untrusted_source_text>/s)[1]);
  return {
    status: 'completed',
    output_text: JSON.stringify({
      segment,
      language_code: language,
      text: `${language}:${source}`,
      source: 'AI_TRANSLATION',
      guide_lookup: 'MISS',
      phrase_key: null,
      verified: false,
      source_page: null,
      source_url: null,
      license: null,
      schema_version: '1',
      contract_version: 'translation-v1',
    }),
  };
};

test('builds only the worker language requested by FE and returns TTS bytes', async () => {
  let speechText;
  const result = await buildWorkerBriefing(baseStructure(), 'vi', {
    respond: fakeRespond,
    speak: async (text) => {
      speechText = text;
      return { audio: new Uint8Array([1, 2, 3]), model: 'gpt-4o-mini-tts', voice: 'alloy', response_format: 'mp3' };
    },
    guideRows: [],
    visualRows: [],
  });

  assert.equal(result.language_code, 'vi');
  assert.equal(result.steps.length, 2);
  assert.match(result.steps[0].title.text, /^vi:/);
  assert.equal(result.quantity.source, 'DETERMINISTIC');
  assert.match(result.quantity.text, /20 bao/);
  assert.match(result.location.text, /^vi:/);
  assert.equal(result.steps[0].visual_asset, null);
  assert.equal(result.tts.status, 'OK');
  assert.deepEqual([...result.tts.audio], [1, 2, 3]);
  assert.equal(result.text, speechText);
  assert.match(result.cache_key, /^[a-f0-9]{64}$/);
});

test('Nepali request is independent and gets a different cache key', async () => {
  const structure = baseStructure();
  const deps = { respond: fakeRespond, speak: async () => { throw new Error('down'); }, guideRows: [], visualRows: [] };
  const vi = await buildWorkerBriefing(structure, 'vi', deps);
  const ne = await buildWorkerBriefing(structure, 'ne', deps);

  assert.match(ne.steps[0].title.text, /^ne:/);
  assert.match(ne.quantity.text, /20 बोरा/);
  assert.notEqual(vi.cache_key, ne.cache_key);
  assert.equal(ne.tts.status, 'FALLBACK_TEXT');
  assert.ok(ne.text.length > 0);
  assert.equal(ne.tts.audio, null);
});

test('rejects an invalid language before calling providers', async () => {
  let called = false;
  await assert.rejects(buildWorkerBriefing(baseStructure(), 'en', {
    respond: async () => { called = true; },
    speak: async () => { called = true; },
    guideRows: [],
    visualRows: [],
  }), /LANGUAGE_UNSUPPORTED/);
  assert.equal(called, false);
});

test('blocks unverified safety translation without using AI fallback', async () => {
  const structure = baseStructure();
  structure.safety = ['작업 전 스트레칭을 하세요'];
  let called = false;
  const result = await buildWorkerBriefing(structure, 'vi', {
    respond: async () => { called = true; },
    speak: async () => { called = true; },
    guideRows: [{
      canonical_ko: '작업 전 스트레칭을 하세요', language_code: 'vi', translated_text: 'Khởi động.',
      verified: 'false', source_name: 'guide', source_page: '8', source_url: 'https://example.test/guide', license: 'test',
    }],
    visualRows: [],
  });

  assert.equal(result.publishable, false);
  assert.deepEqual(result.blockers, ['SAFETY_TRANSLATION_MISSING']);
  assert.equal(called, false);
});

test('loads the checked-in guide and visual manifests by default', () => {
  assert.equal(loadDefaultGuideRows().length, 100);
  assert.equal(loadDefaultVisualRows().length, 6);
  assert.ok(loadDefaultGuideRows().every(({ verified }) => ['true', 'false'].includes(verified)));
});

test('requires an explicit human-review approval before using checked-in safety rows', async () => {
  const structure = baseStructure();
  structure.safety = ['작업 전 스트레칭을 하세요'];
  const result = await buildWorkerBriefing(structure, 'vi', {
    respond: fakeRespond,
    speak: async () => ({ audio: new Uint8Array([1]) }),
  });

  assert.equal(result.publishable, false);
  assert.deepEqual(result.blockers, ['SAFETY_TRANSLATION_MISSING']);
});

test('runs independent LLM translations in parallel', async () => {
  let active = 0;
  let maxActive = 0;
  const respond = async (request) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await fakeRespond(request);
    active -= 1;
    return result;
  };

  await buildWorkerBriefing(baseStructure(), 'vi', {
    respond,
    speak: async () => ({ audio: new Uint8Array([1]), model: 'gpt-4o-mini-tts', voice: 'alloy', response_format: 'mp3' }),
    guideRows: [],
    visualRows: [],
  });

  assert.ok(maxActive > 1);
});

test('returns a blocked bundle when general translation fails', async () => {
  let spoke = false;
  const result = await buildWorkerBriefing(baseStructure(), 'vi', {
    respond: async () => { throw new Error('provider text must not escape'); },
    speak: async () => { spoke = true; },
    guideRows: [],
    visualRows: [],
  });

  assert.equal(result.publishable, false);
  assert.deepEqual(result.blockers, ['TRANSLATION_FAILED']);
  assert.equal(spoke, false);
});

test('synthesizeSpeech is reusable and preserves text on TTS failure', async () => {
  const ok = await synthesizeSpeech('Thu hoạch hành.', 'vi', async () => ({
    audio: new Uint8Array([7]), model: 'gpt-4o-mini-tts', voice: 'alloy', response_format: 'mp3',
  }));
  const fallback = await synthesizeSpeech('प्याज काट्नुहोस्।', 'ne', async () => { throw new Error('down'); });

  assert.equal(ok.status, 'OK');
  assert.equal(fallback.status, 'FALLBACK_TEXT');
  assert.equal(fallback.audio, null);
  assert.match(fallback.text_sha256, /^[a-f0-9]{64}$/);
});
