import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAssetManifest, matchVisualAsset } from '../lib/visual-match.mjs';

const header = 'id,task_code,asset_type,content_type,public_path,provenance,generator_provider,prompt_version,generated_at,reviewer,review_status,safety_level,purpose,captions_text,reviewed_at,checksum_md5,is_current';
const approved = 'onion-harvest-1,ONION_HARVEST,VIDEO,video/mp4,/videos/onion.mp4,AI_GENERATED_PREGENERATED,,,,reviewer,APPROVED,LOW,WORK,onion caption,2026-09-03T00:00:00Z,d41d8cd98f00b204e9800998ecf8427e,true';

test('parseAssetManifest accepts one current approved low video per v2 code', () => {
  const assets = parseAssetManifest(`${header}\n${approved}\n`);
  assert.equal(assets.length, 1);
  assert.equal(matchVisualAsset(assets, 'ONION_HARVEST').id, 'onion-harvest-1');
});

test('matchVisualAsset returns null for rejected or high-risk rows', () => {
  const rejected = parseAssetManifest(`${header}\n${approved.replace('APPROVED', 'REJECTED')}\n`);
  const high = parseAssetManifest(`${header}\n${approved.replace(',LOW,', ',HIGH,')}\n`);
  assert.equal(matchVisualAsset(rejected, 'ONION_HARVEST'), null);
  assert.equal(matchVisualAsset(high, 'ONION_HARVEST'), null);
});

test('matchVisualAsset accepts Postgres boolean is_current values', () => {
  const asset = parseAssetManifest(`${header}\n${approved}\n`)[0];
  assert.equal(matchVisualAsset([{ ...asset, is_current: true }], 'ONION_HARVEST').id, 'onion-harvest-1');
});

test('matchVisualAsset rejects duplicate eligible assets rather than choosing first', () => {
  const assets = parseAssetManifest(`${header}\n${approved}\n${approved.replace('onion-harvest-1', 'onion-harvest-2')}\n`);
  assert.throws(() => matchVisualAsset(assets, 'ONION_HARVEST'), /DUPLICATE_CURRENT_APPROVED_LOW_VIDEO/);
});

test('manifest validator rejects duplicate current approved low assets for one task code', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const directory = await mkdtemp(join(tmpdir(), 'batmeori-manifest-'));
  const file = join(directory, 'assets.csv');
  await writeFile(file, `${header}\n${approved}\n${approved.replace('onion-harvest-1', 'onion-harvest-2')}\n`);
  const result = spawnSync(process.execPath, ['ai/scripts/validate-manifests.mjs', file], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DUPLICATE_CURRENT_APPROVED_LOW_VIDEO/);
});
