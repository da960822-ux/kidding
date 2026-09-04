import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../index.mjs';
import { createOpenAiProvider } from '../lib/openai-provider.mjs';

const work = {
  session_id: 'work-1', version: 1, interpretation: 'READY', summary_ko: '양파 수확',
  location: { raw_text: '비닐하우스', kind: 'NAMED', canonical_name: '비닐하우스' },
  task_family: 'ONION', quantity: { value: 20, unit: '망' }, deadline: null, notes: '잎은 남겨 두세요', safety: [],
  steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '잎을 잡고 양파 수확', description_ko: '잎을 잡고 양파 20망을 수확하세요', unsupported_reason: null }],
  ambiguities: [], schema_version: '2', contract_version: 'structure-v2', ontology_version: 'ontology-v2',
};
const guide = (canonical_ko, language_code, translated_text, extra = {}) => ({
  canonical_ko, language_code, translated_text, category: 'WORK_TERM', phrase_type: 'TERM',
  verified: true, source_page: 1, source_url: 'https://example.test/guide.pdf', license: 'test-fixture', ...extra,
});

test('runtime passes relevant verified target-language terms to every worker text field without promoting sentence provenance', async () => {
  const calls = [];
  const runtime = createRuntime({ providers: { translate: async (request) => { calls.push(request); return `${request.languageCode}-translation`; } } });
  const guides = [guide('잎', 'vi', 'leaf-vi'), guide('잎', 'ne', 'leaf-ne'), guide('비닐하우스', 'vi', 'house-vi'), guide('장갑', 'vi', 'irrelevant'), guide('양파', 'vi', 'unverified', { verified: false })];
  const packages = await runtime.buildWorkerPackagesV2({ work, languages: ['vi', 'ne'], guides, assets: [{ id: 'asset-1', task_code: 'ONION_HARVEST', asset_type: 'VIDEO', content_type: 'video/mp4', is_current: true, review_status: 'APPROVED', safety_level: 'LOW', provenance: 'AI_GENERATED_PREGENERATED', public_path: '/asset.mp4', captions_text: '잎을 잡으세요' }] });
  for (const request of calls.filter((request) => request.text.includes('잎'))) {
    assert.deepEqual(request.glossary?.map((entry) => entry.translated_text), [`leaf-${request.languageCode}`]);
  }
  assert.equal(packages.vi.briefing.context.location_display, 'house-vi');
  assert.equal(calls.some((request) => request.text === '잎을 잡으세요'), true);
  assert.equal(packages.vi.briefing.source_detail[0].source, 'AI_TRANSLATION');
  const unit = calls.find((request) => request.text === '망');
  assert.equal(unit.domainContext[0].term, '망');
  assert.equal(unit.domainContext[0].review_status, 'PENDING');
  assert.equal(unit.domainContext[0].verified, false);
  assert.equal('translated_text' in unit.domainContext[0], false);
});

test('database terms take precedence over local candidates while only exact instructions become official', async () => {
  const calls = [];
  const runtime = createRuntime({ providers: { translate: async (request) => { calls.push(request); return 'translated'; } } });
  const guides = [guide('망', 'vi', 'reviewed-bag'), guide('잎', 'vi', 'leaf'), guide('따세요', 'vi', 'exact-instruction', { category: 'WORK_INSTRUCTION', phrase_type: 'INSTRUCTION' })];
  const source = { ...work, steps: [{ ...work.steps[0], description_ko: '따세요' }, { ...work.steps[0], sequence: 2, description_ko: '잎' }] };
  const packages = await runtime.buildWorkerPackagesV2({ work: source, languages: ['vi'], guides });
  assert.equal(packages.vi.briefing.context.quantity.unit, 'reviewed-bag');
  assert.deepEqual(packages.vi.briefing.source_detail.map((entry) => entry.source), ['OFFICIAL_GUIDE', 'AI_TRANSLATION']);
  assert.equal(calls.some((request) => request.text === '망'), false);
});

test('safety requires an exact verified safety instruction, never a matching term or glossary', async () => {
  const runtime = createRuntime({ providers: { translate: async () => 'translated' } });
  const source = { ...work, safety: ['장갑'] };
  await assert.rejects(runtime.buildWorkerPackagesV2({ work: source, languages: ['vi'], guides: [guide('장갑', 'vi', 'gloves')] }), /SAFETY_TRANSLATION_UNVERIFIED/);
  const packages = await runtime.buildWorkerPackagesV2({ work: source, languages: ['vi'], guides: [guide('장갑', 'vi', 'gloves', { category: 'SAFETY', phrase_type: 'INSTRUCTION' })] });
  assert.equal(packages.vi.briefing.source_detail[0].source, 'OFFICIAL_GUIDE');
  assert.equal(packages.vi.briefing.context.safety[0], 'gloves');
});

test('conflicting verified translations are not arbitrarily merged or selected', async () => {
  const runtime = createRuntime({ providers: { translate: async () => 'translated' } });
  await assert.rejects(runtime.buildWorkerPackagesV2({ work, languages: ['vi'], guides: [guide('잎', 'vi', 'leaf'), guide('잎', 'vi', 'different')] }), /INVALID_GUIDE_TRANSLATION_CONFLICT/);
});

test('provider sends segment and glossary as reference data with source preservation rules', async () => {
  let body;
  const provider = createOpenAiProvider({ env: { OPENAI_API_KEY: 'fixture' }, fetchImpl: async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: '{"text":"translated"}' }) };
  } });
  await provider.translate({ languageCode: 'vi', text: '잎을 잡고 양파 20망 수확', segment: 'ACTION', glossary: [guide('잎', 'vi', 'leaf')], domainContext: [{ term: '망', meaning: 'mesh sack', review_status: 'PENDING', verified: false }] });
  const prompt = body.input.map((item) => item.content).join('\n');
  assert.match(prompt, /"segment":"ACTION"/);
  assert.match(prompt, /"translated_text":"leaf"/);
  assert.match(prompt, /mesh sack/);
  assert.match(prompt, /numbers.*units/i);
  assert.match(prompt, /conditions.*prohibitions.*notes/i);
});
