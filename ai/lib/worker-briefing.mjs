import { createHash } from 'node:crypto';

import { buildTranslationRequest } from './openai-requests.mjs';
import { AiRuntimeError, validateStructureContract, validateTranslation } from './contracts.mjs';
import { lookupGuide } from './guide-translation.mjs';
import { extractCompletedOutputText } from './owner-runtime.mjs';
import { preflightSafety } from './safety.mjs';
import { matchVisualAsset } from './visual-match.mjs';
import { readCsv } from '../scripts/validate-manifests.mjs';

const LANGUAGES = new Set(['vi', 'ne']);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const phraseRows = readCsv(new URL('../manifests/guide_phrases.csv', import.meta.url));
const phraseByKey = new Map(phraseRows.map((row) => [row.phrase_key, row]));
const DEFAULT_GUIDE_ROWS = readCsv(new URL('../manifests/guide_translations.csv', import.meta.url))
  .map((row) => ({ ...row, canonical_ko: phraseByKey.get(row.phrase_key)?.canonical_ko || '' }));
const DEFAULT_VISUAL_ROWS = readCsv(new URL('../manifests/visual_assets.csv', import.meta.url));

export const loadDefaultGuideRows = () => structuredClone(DEFAULT_GUIDE_ROWS);
export const loadDefaultVisualRows = () => structuredClone(DEFAULT_VISUAL_ROWS);

const deterministic = (segment, languageCode, text) => validateTranslation({
  segment,
  language_code: languageCode,
  text,
  source: 'DETERMINISTIC',
  guide_lookup: 'NOT_APPLICABLE',
  phrase_key: null,
  verified: false,
  source_page: null,
  source_url: null,
  license: null,
  schema_version: '1',
  contract_version: 'translation-v1',
});

const quantityText = (quantity, languageCode) => {
  if (!quantity || quantity === 'UNSPECIFIED') return languageCode === 'vi' ? 'Số lượng: chưa xác định' : 'परिमाण: तोकिएको छैन';
  const unit = quantity.unit === '망' ? (languageCode === 'vi' ? 'bao' : 'बोरा') : quantity.unit;
  return languageCode === 'vi' ? `Số lượng: ${quantity.value} ${unit}` : `परिमाण: ${quantity.value} ${unit}`;
};

const orderText = (sequence, languageCode) => languageCode === 'vi' ? `Bước ${sequence}` : `चरण ${sequence}`;

const safeProviderStatus = (error) => Number.isInteger(error?.status) ? error.status : undefined;

async function translateWithAi(text, segment, languageCode, respond) {
  if (typeof respond !== 'function') throw new AiRuntimeError('PROVIDER_MISSING', 500);
  let payload;
  try {
    payload = await respond(buildTranslationRequest(text, segment, languageCode));
  } catch (error) {
    throw new AiRuntimeError('PROVIDER_ERROR', safeProviderStatus(error));
  }
  let value;
  try {
    value = JSON.parse(extractCompletedOutputText(payload));
    validateTranslation(value);
  } catch (error) {
    if (error instanceof AiRuntimeError) throw error;
    throw new AiRuntimeError('TRANSLATION_INVALID', 502);
  }
  if (value.language_code !== languageCode || value.segment !== segment || value.source !== 'AI_TRANSLATION') {
    throw new AiRuntimeError('TRANSLATION_INVALID', 502);
  }
  return value;
}

async function translateAction(text, languageCode, guideRows, respond) {
  const result = lookupGuide(text, languageCode, 'ACTION', guideRows);
  return result.status === 'HIT' ? result.segment : translateWithAi(text, 'ACTION', languageCode, respond);
}

const blockedResult = (structure, languageCode, blockers) => ({
  language_code: languageCode,
  publishable: false,
  blockers,
  cache_key: hash(JSON.stringify({ language_code: languageCode, structure })),
  summary: null,
  quantity: null,
  location: null,
  safety: [],
  steps: [],
  text: '',
  tts: { status: 'NOT_GENERATED', audio: null },
  contract_version: 'worker-briefing-v1',
});

export async function synthesizeSpeech(text, languageCode, speak) {
  if (!LANGUAGES.has(languageCode)) throw new AiRuntimeError('LANGUAGE_UNSUPPORTED', 422);
  const textSha256 = hash(text);
  try {
    if (typeof speak !== 'function') throw new Error('missing TTS provider');
    const speech = await speak(text, { language: languageCode });
    const audio = speech?.audio;
    if (!(audio instanceof Uint8Array) || !audio.byteLength) throw new Error('empty audio');
    return {
      status: 'OK',
      audio,
      text_sha256: textSha256,
      audio_sha256: hash(audio),
      model: speech.model,
      voice: speech.voice,
      response_format: speech.response_format,
      contract_version: 'tts-v1',
    };
  } catch {
    return {
      status: 'FALLBACK_TEXT',
      audio: null,
      text_sha256: textSha256,
      audio_sha256: null,
      contract_version: 'tts-v1',
    };
  }
}

export async function buildWorkerBriefing(structure, languageCode, {
  respond,
  speak,
  guideRows = DEFAULT_GUIDE_ROWS,
  visualRows = DEFAULT_VISUAL_ROWS,
  guideReviewApproved = false,
} = {}) {
  if (!LANGUAGES.has(languageCode)) throw new AiRuntimeError('LANGUAGE_UNSUPPORTED', 422);
  validateStructureContract(structure);
  const risk = preflightSafety(structure);
  const blockers = [];
  if (structure.ambiguities.some(({ blocking }) => blocking)) blockers.push('BLOCKING_AMBIGUITY');
  if (!structure.steps.length) blockers.push('NO_EXECUTABLE_STEP');
  if (risk.level !== 'LOW') blockers.push(`RISK_${risk.level}`);
  if (blockers.length) return blockedResult(structure, languageCode, blockers);

  const reviewedGuideRows = guideReviewApproved
    ? guideRows
    : guideRows.map((row) => ({ ...row, verified: false }));
  const safety = [];
  for (const sourceText of structure.safety) {
    const result = lookupGuide(sourceText, languageCode, 'SAFETY', reviewedGuideRows);
    if (result.blocked) return blockedResult(structure, languageCode, ['SAFETY_TRANSLATION_MISSING']);
    safety.push(result.segment);
  }

  const quantity = deterministic('QUANTITY', languageCode, quantityText(structure.quantity, languageCode));
  const locationSource = structure.location.canonical_name || structure.location.raw_text;
  const summaryPromise = translateWithAi(structure.summary_ko, 'OTHER', languageCode, respond);
  const locationPromise = locationSource
    ? translateWithAi(locationSource, 'LOCATION', languageCode, respond)
    : Promise.resolve(deterministic('LOCATION', languageCode, languageCode === 'vi' ? 'Địa điểm: chưa xác định' : 'स्थान: तोकिएको छैन'));
  const stepPromises = structure.steps.map(async (step) => {
    const [title, description] = await Promise.all([
      translateAction(step.title_ko, languageCode, reviewedGuideRows, respond),
      translateAction(step.description_ko, languageCode, reviewedGuideRows, respond),
    ]);
    return {
      sequence: step.sequence,
      task_code: step.task_code,
      order: deterministic('ORDER', languageCode, orderText(step.sequence, languageCode)),
      title,
      description,
      visual_asset: step.task_code === null ? null : matchVisualAsset(step.task_code, visualRows),
    };
  });
  let summary;
  let location;
  let steps;
  try {
    [summary, location, steps] = await Promise.all([
      summaryPromise,
      locationPromise,
      Promise.all(stepPromises),
    ]);
  } catch (error) {
    if (error instanceof AiRuntimeError) return blockedResult(structure, languageCode, ['TRANSLATION_FAILED']);
    throw error;
  }

  const text = [
    summary.text,
    location.text,
    quantity.text,
    ...steps.flatMap((step) => [`${step.order.text}: ${step.title.text}`, step.description.text]),
    ...safety.map((segment) => segment.text),
  ].join('\n');
  const tts = await synthesizeSpeech(text, languageCode, speak);

  return {
    language_code: languageCode,
    publishable: true,
    blockers: [],
    cache_key: hash(JSON.stringify({ language_code: languageCode, structure })),
    summary,
    quantity,
    location,
    safety,
    steps,
    text,
    tts,
    contract_version: 'worker-briefing-v1',
  };
}
