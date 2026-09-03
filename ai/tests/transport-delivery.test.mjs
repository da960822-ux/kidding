import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerPackagesV2 } from '../lib/worker-briefing-v2.mjs';

test('transport keeps its action and speech but excludes only its video', async () => {
  const work = {
    session_id: 'delivery-test', version: 1, task_family: 'ONION',
    location: { canonical_name: 'Storage' }, quantity: 'UNSPECIFIED', safety: [],
    steps: ['ONION_HARVEST', 'ONION_TRANSPORT'].map((task_code, index) => ({
      sequence: index + 1, task_code, title_ko: task_code, description_ko: `Do ${task_code}`,
    })),
  };
  const services = {
    translate: async ({ text }) => text,
    synthesize: async () => ({ status: 'READY', audio_url: null }),
    matchVisualAsset: (code) => ({ id: code, public_path: `/videos/${code}.mp4`, captions_text: code }),
  };
  const { vi } = await buildWorkerPackagesV2(work, ['vi'], services);
  assert.deepEqual(vi.briefing.steps.map((step) => [step.task_code, step.delivery_mode]), [
    ['ONION_HARVEST', 'VIDEO'], ['ONION_TRANSPORT', 'TEXT_TTS'],
  ]);
  assert.deepEqual(vi.briefing.video.map((video) => video.task_code), ['ONION_HARVEST']);
  assert.match(vi.tts_transport.text, /Do ONION_TRANSPORT/);
  assert.equal(work.steps.length, 2);
  const fallback = await buildWorkerPackagesV2(work, ['vi'], {
    ...services, synthesize: async () => { throw new Error('Speech unavailable'); },
  });
  assert.deepEqual(fallback.vi.briefing.steps.map((step) => step.delivery_mode), ['VIDEO', 'TEXT']);
});
