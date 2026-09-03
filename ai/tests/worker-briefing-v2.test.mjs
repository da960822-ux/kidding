import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkerPackagesV2 } from '../lib/worker-briefing-v2.mjs';

const work = {
  session_id: 'session-1', version: 1, contract_version: 'structure-v2', ontology_version: 'ontology-v2',
  summary_ko: '양파 20망을 수확합니다.', task_family: 'ONION', location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null },
  quantity: { value: 20, unit: '망' }, safety: [],
  steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null }]
};

const services = {
  translate: async ({ languageCode, text }) => `${languageCode}:${text}`,
  synthesize: async ({ text, languageCode }) => ({ status: 'READY', audio_url: null, text_hash: `${languageCode}:${text}` }),
  matchVisualAsset: () => ({ id: 'onion-harvest-1', public_path: '/videos/onion.mp4', captions_text: 'onion' })
};

test('buildWorkerPackagesV2 returns independent Vietnamese and Nepali packages', async () => {
  const packages = await buildWorkerPackagesV2(work, ['vi', 'ne'], services);
  assert.deepEqual(Object.keys(packages).sort(), ['ne', 'vi']);
  assert.equal(packages.vi.briefing.contract_version, 'worker-briefing-v2');
  assert.equal(packages.vi.briefing.ontology_version, 'ontology-v2');
  assert.equal(packages.vi.briefing.language_code, 'vi');
  assert.equal(packages.vi.briefing.context.task_family, 'ONION');
  assert.match(packages.vi.briefing.steps[0].title, /^vi:/);
  assert.match(packages.ne.briefing.steps[0].title, /^ne:/);
  assert.equal(packages.vi.briefing.steps[0].delivery_mode, 'VIDEO');
  assert.deepEqual(Object.keys(packages.vi.briefing).sort(), ['badges', 'context', 'contract_version', 'language_code', 'ontology_version', 'session_id', 'source_detail', 'steps', 'tts', 'version', 'video']);
  assert.equal(packages.vi.tts_transport.status, 'READY');
  assert.equal('audio_bytes_base64' in packages.vi.briefing, false);
});

test('quantity regeneration changes briefing text and content cache key', async () => {
  const first = await buildWorkerPackagesV2(work, ['vi'], services);
  const changed = await buildWorkerPackagesV2({ ...work, version: 2, quantity: { value: 15, unit: '망' }, summary_ko: '양파 15망을 수확합니다.' }, ['vi'], services);
  assert.notEqual(first.vi.cache_key, changed.vi.cache_key);
  assert.notEqual(first.vi.briefing.context.quantity.value, changed.vi.briefing.context.quantity.value);
});

test('packages localize context, including the quantity unit, per language', async () => {
  const localizedWork = {
    ...work,
    location: { raw_text: '1번 밭', kind: 'NAMED', canonical_name: '1번 밭' },
    deadline: '오전 11시',
    notes: '상한 것은 분리',
  };
  const packages = await buildWorkerPackagesV2(localizedWork, ['vi', 'ne'], services);
  assert.match(packages.vi.briefing.context.location_display, /^vi:/);
  assert.match(packages.ne.briefing.context.location_display, /^ne:/);
  assert.match(packages.vi.briefing.context.quantity.unit, /^vi:/);
  assert.match(packages.ne.briefing.context.quantity.unit, /^ne:/);
  assert.match(packages.vi.briefing.context.deadline, /^vi:/);
  assert.match(packages.ne.briefing.context.notes, /^ne:/);
});

test('buildWorkerPackagesV2 falls back to text when video is not approved', async () => {
  const packages = await buildWorkerPackagesV2(work, ['vi'], { ...services, matchVisualAsset: () => null });
  assert.deepEqual(packages.vi.briefing.video, []);
  assert.equal(packages.vi.briefing.steps[0].delivery_mode, 'TEXT_TTS');
});

test('cache keys never include worker identity', async () => {
  const packages = await buildWorkerPackagesV2(work, ['vi'], services);
  assert.equal(packages.vi.cache_key.includes('worker'), false);
  assert.equal(packages.vi.cache_key.includes('member'), false);
  assert.equal(JSON.stringify(packages.vi.briefing).includes('owner_id'), false);
});

test('buildWorkerPackagesV2 keeps source detail in execution order', async () => {
  const twoSteps = { ...work, steps: [...work.steps, { sequence: 2, task_code: 'ONION_TRIMMING', title_ko: '양파 손질', description_ko: '양파를 손질한다.', unsupported_reason: null }] };
  const delayed = { ...services, translate: async ({ languageCode, text }) => {
    if (text === '양파 수확') await new Promise((resolve) => setTimeout(resolve, 10));
    return `${languageCode}:${text}`;
  } };
  const packages = await buildWorkerPackagesV2(twoSteps, ['vi'], delayed);
  assert.deepEqual(packages.vi.briefing.source_detail.map((detail) => detail.step_sequence), [1, 2]);
});

test('buildWorkerPackagesV2 uses a verified Node guide lookup when available', async () => {
  const packages = await buildWorkerPackagesV2(work, ['vi'], {
    ...services,
    guideLookup: async ({ languageCode, canonical_ko }) => canonical_ko === '양파를 수확한다.'
      ? { language_code: languageCode, translated_text: 'Thu hoạch hành theo hướng dẫn.', source_page: 7, source_url: 'https://guide.example/7', license: 'CC-BY' }
      : null,
  });
  assert.equal(packages.vi.briefing.steps[0].description, 'Thu hoạch hành theo hướng dẫn.');
  assert.deepEqual(packages.vi.briefing.source_detail[0], {
    step_sequence: 1, segment: 'ACTION', source: 'OFFICIAL_GUIDE', guide_lookup: 'HIT', verified: true,
    source_page: 7, source_url: 'https://guide.example/7', license: 'CC-BY',
  });
});
