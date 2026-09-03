import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const TASK_CODES = [
  'ONION_HARVEST',
  'ONION_COLLECT',
  'BAGGING',
  'LOADING',
  'WAREHOUSE_TRANSPORT',
  'STACKING',
];

const GUIDE_PHRASE_HEADERS = ['phrase_key', 'category', 'canonical_ko', 'phrase_type'];
const GUIDE_TRANSLATION_HEADERS = ['phrase_key', 'language_code', 'translated_text', 'source_name', 'source_page', 'source_url', 'license', 'verified'];
const VISUAL_HEADERS = ['id', 'task_code', 'asset_type', 'public_path', 'provenance', 'generator_provider', 'prompt_version', 'generated_at', 'reviewer', 'review_status', 'safety_level', 'purpose', 'captions_text'];
const TTS_KEYS = ['id', 'language_code', 'text', 'text_sha256', 'model', 'voice', 'response_format', 'status', 'audio_sha256', 'recorded_at', 'contract_version'];
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const fail = (message) => { throw new Error(message); };

function parseCsv(source) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (quoted) fail('invalid CSV quote');
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

export function readCsv(path) {
  const rows = parseCsv(readFileSync(path, 'utf8').trimEnd());
  const [headers, ...values] = rows;
  if (!headers) fail('CSV requires a header');
  return values.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function validateHeaders(path, headers) {
  const [actual] = parseCsv(readFileSync(path, 'utf8').trimEnd());
  if (JSON.stringify(actual) !== JSON.stringify(headers)) fail(`${path}: invalid CSV headers`);
}

export function validateGuideRow(row) {
  const official = row.source === 'OFFICIAL_GUIDE';
  const verified = row.verified === true || row.verified === 'true';
  const evidence = ['source_name', 'source_page', 'source_url', 'license'].every((key) => text(row[key]));
  if (official && (!verified || !evidence)) fail('OFFICIAL_GUIDE requires verified source evidence');
  if (verified && !evidence) fail('verified guide row requires source evidence');
  if (text(row.language_code) && !['vi', 'ne'].includes(row.language_code)) fail('guide row has invalid language');
  return row;
}

export function validateVisualRow(row) {
  if (!TASK_CODES.includes(row.task_code)) fail('visual row has invalid task code');
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(row.review_status)) fail('visual row has invalid review status');
  if (row.review_status === 'APPROVED') {
    const complete = ['id', 'task_code', 'asset_type', 'public_path', 'provenance', 'prompt_version', 'generated_at', 'reviewer', 'review_status', 'safety_level', 'purpose', 'captions_text']
      .every((key) => text(row[key]));
    if (!complete || row.provenance !== 'AI_GENERATED_PREGENERATED' || row.safety_level !== 'LOW') {
      fail('APPROVED visual requires complete human-reviewed LOW AI_GENERATED_PREGENERATED evidence');
    }
  }
  return row;
}

function validateTtsRows(rows) {
  if (rows.length !== 2 || JSON.stringify(rows.map(({ language_code }) => language_code)) !== JSON.stringify(['vi', 'ne'])) {
    fail('TTS manifest requires pending vi and ne checks');
  }
  for (const row of rows) {
    if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...TTS_KEYS].sort())) fail('TTS row has invalid fields');
    if (row.status !== 'PENDING' || row.model !== 'gpt-4o-mini-tts' || row.voice !== 'alloy' || row.response_format !== 'mp3' || row.contract_version !== 'tts-v1') {
      fail('TTS row is not a gpt-4o-mini-tts pending template');
    }
    if (row.text !== null || row.text_sha256 !== null || row.audio_sha256 !== null || row.recorded_at !== null) {
      fail('pending TTS row cannot claim a smoke result');
    }
  }
  return rows;
}

function validateGuideTranslations(rows, phraseRows) {
  const phraseKeys = new Set(phraseRows.map(({ phrase_key }) => phrase_key));
  const translations = new Set();
  for (const row of rows) {
    validateGuideRow(row);
    if (!phraseKeys.has(row.phrase_key)) fail('guide translation has unknown phrase_key');
    const key = `${row.phrase_key}:${row.language_code}`;
    if (translations.has(key)) fail('duplicate guide translation');
    translations.add(key);
  }
}

export function validateManifests(root) {
  const directory = root instanceof URL ? fileURLToPath(root) : root;
  const phrasePath = join(directory, 'guide_phrases.csv');
  const translationPath = join(directory, 'guide_translations.csv');
  const visualPath = join(directory, 'visual_assets.csv');
  const ttsPath = join(directory, 'tts-smoke-v1.jsonl');
  validateHeaders(phrasePath, GUIDE_PHRASE_HEADERS);
  validateHeaders(translationPath, GUIDE_TRANSLATION_HEADERS);
  validateHeaders(visualPath, VISUAL_HEADERS);
  const phraseRows = readCsv(phrasePath);
  const translationRows = readCsv(translationPath);
  const visualRows = readCsv(visualPath);
  validateGuideTranslations(translationRows, phraseRows);
  if (visualRows.length !== TASK_CODES.length || JSON.stringify(visualRows.map(({ task_code }) => task_code)) !== JSON.stringify(TASK_CODES)) {
    fail('visual manifest requires six canonical onion task codes');
  }
  for (const row of visualRows) validateVisualRow(row);
  const ttsRows = readFileSync(ttsPath, 'utf8').trim().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); } catch { fail(`TTS line ${index + 1}: invalid JSON`); }
  });
  validateTtsRows(ttsRows);
  return {
    guidePhraseCount: phraseRows.length,
    guideTranslationCount: translationRows.length,
    visualPendingCount: visualRows.filter(({ review_status }) => review_status === 'PENDING').length,
    ttsPendingCount: ttsRows.filter(({ status }) => status === 'PENDING').length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error('usage: node ai/scripts/validate-manifests.mjs <manifest-directory>');
  console.log(validateManifests(root));
}
