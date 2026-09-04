import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerPackagesV2 } from '../lib/worker-briefing-v2.mjs';
import { matchVisualAsset } from '../lib/visual-match.mjs';

test('trimming and transport each receive their own approved video while preserving all speech', async () => {
  const work = {
    session_id: 'delivery-test', version: 1, task_family: 'ONION',
    location: { canonical_name: 'Storage' }, quantity: 'UNSPECIFIED', safety: [],
    steps: ['ONION_TRIMMING', 'ONION_TRANSPORT'].map((task_code, index) => ({
      sequence: index + 1, task_code, title_ko: task_code, description_ko: `Do ${task_code}`,
    })),
  };
  const assets = work.steps.map(({ task_code }) => ({
    id: task_code, task_code, asset_type: 'VIDEO', content_type: 'video/mp4',
    public_path: `/videos/${task_code}.mp4`, captions_text: task_code,
    provenance: 'AI_GENERATED_PREGENERATED', review_status: 'APPROVED', safety_level: 'LOW', is_current: true,
  }));
  const services = {
    translate: async ({ text }) => text,
    synthesize: async () => ({ status: 'READY', audio_url: null }),
    matchVisualAsset: (code) => matchVisualAsset(assets, code),
  };
  for (const { briefing, tts_transport } of Object.values(await buildWorkerPackagesV2(work, ['vi', 'ne'], services))) {
    assert.deepEqual(briefing.steps.map((step) => [step.task_code, step.delivery_mode]), [
      ['ONION_TRIMMING', 'VIDEO'], ['ONION_TRANSPORT', 'VIDEO'],
    ]);
    assert.deepEqual(briefing.video.map(({ step_sequence, asset_id, video_url }) => [step_sequence, asset_id, video_url]), [
      [1, 'ONION_TRIMMING', '/videos/ONION_TRIMMING.mp4'], [2, 'ONION_TRANSPORT', '/videos/ONION_TRANSPORT.mp4'],
    ]);
    assert.match(tts_transport.text, /Do ONION_TRANSPORT/);
  }
  assert.equal(work.steps.length, 2);
  for (const change of [{ review_status: 'PENDING' }, { safety_level: 'HIGH' }, { is_current: false }]) {
    const unavailable = await buildWorkerPackagesV2(work, ['vi'], {
      ...services, matchVisualAsset: (code) => matchVisualAsset(assets.map((asset) => asset.task_code === 'ONION_TRANSPORT' ? { ...asset, ...change } : asset), code),
    });
    assert.deepEqual(unavailable.vi.briefing.video.map((video) => video.task_code), ['ONION_TRIMMING']);
    assert.equal(unavailable.vi.briefing.steps[1].delivery_mode, 'TEXT_TTS');
    assert.match(unavailable.vi.tts_transport.text, /Do ONION_TRANSPORT/);
  }
  const fallback = await buildWorkerPackagesV2(work, ['vi'], {
    ...services, matchVisualAsset: (code) => matchVisualAsset(assets.slice(0, 1), code),
    synthesize: async () => { throw new Error('Speech unavailable'); },
  });
  assert.deepEqual(fallback.vi.briefing.steps.map((step) => step.delivery_mode), ['VIDEO', 'TEXT']);
});
