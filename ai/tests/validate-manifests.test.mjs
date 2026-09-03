import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  TASK_CODES,
  readCsv,
  validateGuideRow,
  validateManifests,
  validateVisualRow,
} from '../scripts/validate-manifests.mjs';

const manifests = new URL('../manifests/', import.meta.url);
const visualRows = readCsv(new URL('visual_assets.csv', manifests));

test('keeps one pending visual production plan for each canonical onion task', () => {
  assert.equal(visualRows.length, 6);
  assert.deepEqual(visualRows.map(({ task_code }) => task_code), TASK_CODES);
  assert.ok(visualRows.every(({ review_status }) => review_status === 'PENDING'));
  assert.ok(visualRows.every(({ public_path, reviewer }) => !public_path && !reviewer));
});

test('rejects an OFFICIAL_GUIDE claim without verified source evidence', () => {
  const unverifiedOfficialRow = {
    phrase_key: 'WORK_001',
    language_code: 'vi',
    translated_text: 'pending',
    source_name: '',
    source_page: '',
    source_url: '',
    license: '',
    verified: 'false',
    source: 'OFFICIAL_GUIDE',
  };

  assert.throws(() => validateGuideRow(unverifiedOfficialRow), /OFFICIAL_GUIDE/);
});

test('rejects an incomplete approved visual asset', () => {
  assert.throws(() => validateVisualRow({
    ...visualRows[0],
    review_status: 'APPROVED',
    safety_level: 'HIGH',
  }), /APPROVED/);
});

test('rejects duplicate guide translations before import', () => {
  const directory = mkdtempSync(join(tmpdir(), 'batmeori-manifests-'));
  try {
    cpSync(new URL('../manifests', import.meta.url), directory, { recursive: true });
    const firstTranslation = readFileSync(new URL('guide_translations.csv', manifests), 'utf8').split(/\r?\n/)[1];
    appendFileSync(join(directory, 'guide_translations.csv'), `${firstTranslation}\n`);

    assert.throws(() => validateManifests(directory), /duplicate guide translation/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects guide translations without a declared phrase', () => {
  const directory = mkdtempSync(join(tmpdir(), 'batmeori-manifests-'));
  try {
    cpSync(new URL('../manifests', import.meta.url), directory, { recursive: true });
    const translationPath = join(directory, 'guide_translations.csv');
    writeFileSync(translationPath, readFileSync(translationPath, 'utf8').replace('TERM_001,vi,', 'UNKNOWN_999,vi,'));

    assert.throws(() => validateManifests(directory), /unknown phrase_key/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts populated guide rows and pending visual/TTS evidence', () => {
  const result = validateManifests(new URL('../manifests', import.meta.url));
  const ttsRows = readFileSync(new URL('tts-smoke-v1.jsonl', manifests), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));

  assert.deepEqual(result, {
    guidePhraseCount: 51,
    guideTranslationCount: 100,
    visualPendingCount: 6,
    ttsPendingCount: 2,
  });
  assert.deepEqual(ttsRows.map(({ language_code }) => language_code), ['vi', 'ne']);
  assert.ok(ttsRows.every(({ status, model, audio_sha256, recorded_at }) => (
    status === 'PENDING'
    && model === 'gpt-4o-mini-tts'
    && audio_sha256 === null
    && recorded_at === null
  )));
});

test('accepts a CLI filesystem path', () => {
  assert.deepEqual(validateManifests('ai/manifests'), {
    guidePhraseCount: 51,
    guideTranslationCount: 100,
    visualPendingCount: 6,
    ttsPendingCount: 2,
  });
});
