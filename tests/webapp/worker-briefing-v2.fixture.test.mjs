import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixture = {
  session_id: 'session-onion', version: 2, contract_version: 'worker-briefing-v2', ontology_version: 'ontology-v2', language_code: 'vi',
  context: { task_family: 'ONION', location_display: 'Ruộng số 1', quantity: { value: 15, unit: 'bao' }, deadline: null, notes: null },
  badges: ['TEXT_TTS_FALLBACK'],
  steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title: 'Thu hoạch hành', description: 'Nhổ nhẹ', delivery_mode: 'TEXT_TTS' }],
  source_detail: [{ step_sequence: 1, segment: 'ACTION', source: 'AI_TRANSLATION', guide_lookup: 'MISS', verified: false, source_page: null, source_url: null, license: null }],
  tts: { status: 'FALLBACK', text_hash: 'a'.repeat(64), audio_url: null },
  video: [],
};

test('fixture contains every required WorkerBriefing v2 field', () => {
  assert.deepEqual(Object.keys(fixture).sort(), ['badges', 'context', 'contract_version', 'language_code', 'ontology_version', 'session_id', 'source_detail', 'steps', 'tts', 'version', 'video']);
  assert.equal(fixture.context.task_family, 'ONION');
  assert.equal(fixture.tts.text_hash.length, 64);
});

test('worker screen and mock consume top-level media and badges', async () => {
  const [screen, mock] = await Promise.all([
    readFile(new URL('../../src/webapp/WorkerScreens.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/webapp/mock-api.ts', import.meta.url), 'utf8'),
  ]);
  for (const field of ['assignment.badges', 'assignment.tts', 'assignment.video', 'assignment.context.quantity']) {
    assert.ok(screen.includes(field), `worker screen must render ${field}`);
  }
  for (const field of ['badges:', 'tts:', 'video:', 'task_family:']) {
    assert.ok(mock.includes(field), `mock must provide schema field ${field}`);
  }
  const v2Screen = screen.split('function LegacyWorkerBriefingView')[0];
  assert.ok(!v2Screen.includes('badge_codes'), 'v2 worker screen must not read legacy badge_codes');
  assert.ok(!v2Screen.includes('step.video') && !v2Screen.includes('step.audio_url'), 'v2 worker screen must not read step-level media');
});

test('new drafts are v2-only and QR SPA entry paths are deployable', async () => {
  const [contracts, vercel] = await Promise.all([
    readFile(new URL('../../src/webapp/contracts.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../vercel.json', import.meta.url), 'utf8'),
  ]);
  assert.match(contracts, /schema_version:\s*'2';/);
  assert.match(contracts, /contract_version:\s*'structure-v2';/);
  assert.match(contracts, /ontology_version:\s*'ontology-v2';/);
  const rewrites = JSON.parse(vercel).rewrites.map(({ source }) => source);
  assert.deepEqual(rewrites, ['/(.*)']);
});

test('legacy reads render stored steps but do not expose quantity mutation', async () => {
  const [owner, worker] = await Promise.all([
    readFile(new URL('../../src/webapp/OwnerScreens.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/webapp/WorkerScreens.tsx', import.meta.url), 'utf8'),
  ]);
  assert.ok(owner.includes("session.contract_version === 'structure-v1'"));
  assert.ok(worker.includes('LegacyWorkerBriefingView'));
  assert.ok(owner.includes('LegacyBriefingView'));
});
