import assert from 'node:assert/strict';
import test from 'node:test';

import { readCsv } from '../scripts/validate-manifests.mjs';
import { matchVisualAsset } from '../lib/visual-match.mjs';

const manifest = readCsv(new URL('../manifests/visual_assets.csv', import.meta.url));

test('current six pending plans are not publishable matches', () => {
  for (const taskCode of ['ONION_HARVEST', 'ONION_COLLECT', 'BAGGING', 'LOADING', 'WAREHOUSE_TRANSPORT', 'STACKING']) {
    assert.equal(matchVisualAsset(taskCode, manifest), null);
  }
});

test('matches only exact approved low pre-generated assets with required evidence', () => {
  const row = {
    id: 'asset-1',
    task_code: 'BAGGING',
    asset_type: 'video/mp4',
    public_path: '/videos/bagging.mp4',
    provenance: 'AI_GENERATED_PREGENERATED',
    reviewer: 'reviewer-1',
    review_status: 'APPROVED',
    safety_level: 'LOW',
    captions_text: '양파를 담습니다.',
  };
  assert.deepEqual(matchVisualAsset('BAGGING', [row]), row);
  assert.equal(matchVisualAsset('LOADING', [row]), null);
  assert.equal(matchVisualAsset('BAGGING', [{ ...row, safety_level: 'HIGH' }]), null);
  assert.equal(matchVisualAsset('BAGGING', [{ ...row, review_status: 'PENDING' }]), null);
  assert.equal(matchVisualAsset('BAGGING', [{ ...row, public_path: '' }]), null);
  assert.equal(matchVisualAsset('BAGGING', [{ ...row, asset_type: 'image/png' }]), null);
});

test('rejects non-allowlisted task codes', () => {
  assert.throws(() => matchVisualAsset('UNKNOWN', []), /task_code/);
});
