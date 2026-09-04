import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { buildWorkerPackagesV2 } from '../lib/worker-briefing-v2.mjs';

const work = {
  session_id: 'session-1', version: 1, contract_version: 'structure-v2', ontology_version: 'ontology-v2',
  summary_ko: '양파 20망을 수확합니다.', task_family: 'ONION', location: { raw_text: null, kind: 'UNSPECIFIED', canonical_name: null },
  quantity: { value: 20, unit: '망' }, safety: [],
  steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null }]
};

const services = {
  translate: async ({ languageCode }) => `${languageCode}-localized`,
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
  assert.match(packages.vi.briefing.steps[0].title, /^vi-/);
  assert.match(packages.ne.briefing.steps[0].title, /^ne-/);
  assert.equal(packages.vi.briefing.steps[0].delivery_mode, 'VIDEO');
  assert.deepEqual(Object.keys(packages.vi.briefing).sort(), ['badges', 'context', 'contract_version', 'language_code', 'ontology_version', 'session_id', 'source_detail', 'steps', 'tts', 'version', 'video']);
  assert.equal(packages.vi.tts_transport.status, 'READY');
  assert.equal(packages.vi.briefing.tts.text_hash.length, 64);
  assert.equal('audio_bytes_base64' in packages.vi.briefing, false);
});

test('quantity regeneration changes briefing text and content cache key', async () => {
  const first = await buildWorkerPackagesV2(work, ['vi'], services);
  const changed = await buildWorkerPackagesV2({ ...work, version: 2, quantity: { value: 15, unit: '망' }, summary_ko: '양파 15망을 수확합니다.' }, ['vi'], services);
  assert.notEqual(first.vi.cache_key, changed.vi.cache_key);
  assert.notEqual(first.vi.briefing.context.quantity.value, changed.vi.briefing.context.quantity.value);
  assert.notEqual(first.vi.briefing.tts.text_hash, changed.vi.briefing.tts.text_hash);
});

test('full audio includes common context, safety, source-order steps, and final notes in both languages', async () => {
  const source = {
    ...work, location: { raw_text: 'Field 1', kind: 'NAMED', canonical_name: 'Field 1' },
    quantity: { value: 20, unit: 'bags' }, deadline: 'Before 11', notes: 'Do not throw onions.', safety: ['Wear gloves.'],
    steps: [
      { sequence: 2, task_code: 'ONION_TRIMMING', title_ko: 'Trim', description_ko: 'Trim onions.' },
      { sequence: 1, task_code: 'ONION_HARVEST', title_ko: 'Harvest', description_ko: 'Harvest onions.' },
    ],
  };
  const packages = await buildWorkerPackagesV2(source, ['vi', 'ne'], {
    ...services,
    translate: async ({ languageCode, text }) => `${languageCode}:${text}`,
    guideLookup: async ({ languageCode, segment }) => segment === 'SAFETY'
      ? { language_code: languageCode, verified: true, translated_text: `${languageCode}:Wear gloves.`, source_page: 2, source_url: 'https://guide.example/2', license: 'CC-BY' }
      : null,
  });
  for (const language of ['vi', 'ne']) {
    assert.equal(packages[language].tts_transport.text, [
      `${language}:Field 1`, `20 ${language}:bags`, `${language}:Before 11`, `${language}:Wear gloves.`,
      `${language}:Trim ${language}:Trim onions.`, `${language}:Harvest ${language}:Harvest onions.`, `${language}:Do not throw onions.`,
    ].join('\n'));
  }
});

test('full audio omits unspecified quantity and absent deadline or notes', async () => {
  for (const quantity of [null, 'UNSPECIFIED']) {
    const packages = await buildWorkerPackagesV2({ ...work, quantity, deadline: null, notes: null }, ['vi'], services);
    assert.equal(packages.vi.tts_transport.text, 'vi-localized\nvi-localized vi-localized');
  }
});

test('packages localize context, including the quantity unit, per language', async () => {
  const localizedWork = {
    ...work,
    location: { raw_text: '1번 밭', kind: 'NAMED', canonical_name: '1번 밭' },
    deadline: '오전 11시',
    notes: '상한 것은 분리',
  };
  const packages = await buildWorkerPackagesV2(localizedWork, ['vi', 'ne'], services);
  assert.match(packages.vi.briefing.context.location_display, /^vi-/);
  assert.match(packages.ne.briefing.context.location_display, /^ne-/);
  assert.match(packages.vi.briefing.context.quantity.unit, /^vi-/);
  assert.match(packages.ne.briefing.context.quantity.unit, /^ne-/);
  assert.match(packages.vi.briefing.context.deadline, /^vi-/);
  assert.match(packages.ne.briefing.context.notes, /^ne-/);
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
    return `${languageCode}-localized`;
  } };
  const packages = await buildWorkerPackagesV2(twoSteps, ['vi'], delayed);
  assert.deepEqual(packages.vi.briefing.source_detail.map((detail) => detail.step_sequence), [1, 2]);
});

test('buildWorkerPackagesV2 uses a verified Node guide lookup when available', async () => {
  const packages = await buildWorkerPackagesV2(work, ['vi'], {
    ...services,
    guideLookup: async ({ languageCode, canonical_ko }) => canonical_ko === '양파를 수확한다.'
      ? { language_code: languageCode, verified: true, translated_text: 'Thu hoạch hành theo hướng dẫn.', source_page: 7, source_url: 'https://guide.example/7', license: 'CC-BY' }
      : null,
  });
  assert.equal(packages.vi.briefing.steps[0].description, 'Thu hoạch hành theo hướng dẫn.');
  assert.deepEqual(packages.vi.briefing.source_detail[0], {
    step_sequence: 1, segment: 'ACTION', source: 'OFFICIAL_GUIDE', guide_lookup: 'HIT', verified: true,
    source_page: 7, source_url: 'https://guide.example/7', license: 'CC-BY',
  });
});

test('worker packages preserve every step, localize safety and captions, and hash complete TTS text', async () => {
  const source = {
    ...work,
    safety: ['장갑을 착용한다.'],
    steps: [
      { sequence: 2, task_code: 'ONION_TRIMMING', title_ko: '양파 손질', description_ko: '양파를 손질한다.', unsupported_reason: null },
      { sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확한다.', unsupported_reason: null },
    ],
  };
  const packages = await buildWorkerPackagesV2(source, ['vi'], {
    ...services,
    translate: async ({ languageCode, text }) => `${languageCode}-${text === '장갑을 착용한다.' ? 'safety' : 'localized'}`,
    guideLookup: async ({ languageCode, canonical_ko, segment }) => segment === 'SAFETY' && canonical_ko === '장갑을 착용한다.'
      ? { language_code: languageCode, verified: true, translated_text: 'Đeo găng tay.', source_page: 2, source_url: 'https://guide.example/2', license: 'CC-BY' }
      : null,
  });
  const { briefing, tts_transport: transport } = packages.vi;
  assert.deepEqual(briefing.steps.map((step) => step.sequence), [2, 1]);
  assert.equal(briefing.steps.length, source.steps.length);
  assert.deepEqual(briefing.video.map((entry) => entry.step_sequence), [2, 1]);
  assert.deepEqual(briefing.context.safety, ['Đeo găng tay.']);
  assert.deepEqual(briefing.source_detail.map((detail) => [detail.segment, detail.step_sequence]), [['SAFETY', null], ['ACTION', 2], ['ACTION', 1]]);
  assert.match(briefing.video[0].captions_text, /^vi-/);
  assert.equal(/\p{Script=Hangul}/u.test(JSON.stringify(briefing.context)), false);
  assert.equal(transport.text, ['vi-localized', '20 vi-localized', 'Đeo găng tay.', ...briefing.steps.map((step) => `${step.title} ${step.description}`)].join('\n'));
  assert.equal(briefing.tts.text_hash, createHash('sha256').update(transport.text).digest('hex'));
  for (const field of ['transcript', 'raw_audio', 'risk_assessment', 'owner_id', 'farm_id', 'member_id', 'worker_id', 'token', 'cache_key', 'audio_bytes_base64']) assert.equal(JSON.stringify(briefing).includes(field), false, `${field} must not reach worker DTO`);
});

test('worker packages reject safety without verified provenance and Korean translation leakage', async () => {
  await assert.rejects(
    buildWorkerPackagesV2({ ...work, safety: ['장갑을 착용한다.'] }, ['vi'], services),
    { message: 'SAFETY_TRANSLATION_UNVERIFIED' },
  );
  await assert.rejects(
    buildWorkerPackagesV2(work, ['vi'], { ...services, translate: async ({ text }) => text }),
    { message: 'LOCALE_LEAK' },
  );
});
