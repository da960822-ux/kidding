import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { video_excluded_task_codes: videoExcludedTaskCodes } = JSON.parse(readFileSync(new URL('../references/delivery-policy-v2.json', import.meta.url), 'utf8'));

const LANGUAGES = new Set(['vi', 'ne']);
const FORBIDDEN = new Set(['transcript', 'raw_audio', 'risk_assessment', 'token', 'token_hash', 'cache_key', 'owner_id', 'farm_id', 'member_id', 'worker_id', 'display_name']);
const hash = (value) => createHash('sha256').update(value).digest('hex');

function assertLanguage(languageCode) {
  if (!LANGUAGES.has(languageCode)) throw new TypeError('INVALID_LANGUAGE');
}

function assertIdentityFree(value) {
  if (value && typeof value === 'object') for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) throw new TypeError('IDENTITY_FIELD_FORBIDDEN');
    assertIdentityFree(nested);
  }
}

function localized(value) {
  if (typeof value !== 'string' || !value.trim() || /\p{Script=Hangul}/u.test(value)) throw new TypeError('LOCALE_LEAK');
  return value;
}

export function guideFor(languageCode, candidate) {
  return candidate && candidate.language_code === languageCode && candidate.verified === true && typeof candidate.translated_text === 'string'
    && candidate.translated_text.trim() && Number.isInteger(candidate.source_page) && candidate.source_page > 0 && typeof candidate.source_url === 'string'
    && /^https?:\/\//.test(candidate.source_url) && typeof candidate.license === 'string' && candidate.license.trim() ? candidate : null;
}

function sourceDetail(stepSequence, segment, guide) {
  if (guide) return { step_sequence: stepSequence, segment, source: 'OFFICIAL_GUIDE', guide_lookup: 'HIT', verified: true, source_page: guide.source_page, source_url: guide.source_url, license: guide.license };
  return { step_sequence: stepSequence, segment, source: 'AI_TRANSLATION', guide_lookup: 'MISS', verified: false, source_page: null, source_url: null, license: null };
}

async function localizeContext(work, languageCode, translate) {
  const location = work.location?.canonical_name ?? work.location?.raw_text ?? 'UNSPECIFIED';
  const [locationDisplay, deadline, notes] = await Promise.all([
    translate({ languageCode, text: location, segment: 'LOCATION' }),
    work.deadline === null || work.deadline === undefined ? null : translate({ languageCode, text: work.deadline, segment: 'OTHER' }),
    work.notes === null || work.notes === undefined ? null : translate({ languageCode, text: work.notes, segment: 'OTHER' }),
  ]);
  const quantity = work.quantity && typeof work.quantity === 'object'
    ? { ...work.quantity, unit: localized(await translate({ languageCode, text: work.quantity.unit, segment: 'QUANTITY' })) }
    : work.quantity === 'UNSPECIFIED' ? null : work.quantity;
  return {
    task_family: work.task_family,
    location_display: localized(locationDisplay),
    quantity,
    deadline: deadline === null ? null : localized(deadline),
    notes: notes === null ? null : localized(notes),
    safety: [],
  };
}

export async function buildWorkerPackagesV2(work, languages, services) {
  assertIdentityFree(work);
  if (!Array.isArray(languages) || new Set(languages).size !== languages.length) throw new TypeError('INVALID_LANGUAGES');
  const entries = await Promise.all(languages.map(async (languageCode) => {
    assertLanguage(languageCode);
    const context = await localizeContext(work, languageCode, services.translate);
    const safety = await Promise.all((work.safety ?? []).map(async (notice) => {
      const guide = guideFor(languageCode, await (services.guideLookup?.({ languageCode, canonical_ko: notice, segment: 'SAFETY' }) ?? null));
      if (!guide) throw new TypeError('SAFETY_TRANSLATION_UNVERIFIED');
      return { text: localized(guide.translated_text), guide };
    }));
    context.safety = safety.map((notice) => notice.text);
    const localizedSteps = await Promise.all(work.steps.map(async (step) => {
      const title = localized(await services.translate({ languageCode, text: step.title_ko, segment: 'ACTION' }));
      const candidate = await (services.guideLookup?.({ languageCode, canonical_ko: step.description_ko }) ?? null);
      const guide = guideFor(languageCode, candidate);
      const description = localized(guide?.translated_text ?? await services.translate({ languageCode, text: step.description_ko, segment: 'ACTION' }));
      const asset = videoExcludedTaskCodes.includes(step.task_code) ? null : services.matchVisualAsset(step.task_code);
      const video = asset ? { step_sequence: step.sequence, asset_id: asset.id, task_code: step.task_code, video_url: asset.public_path, provenance: 'AI_GENERATED_PREGENERATED', review_status: 'APPROVED', safety_level: 'LOW', captions_text: localized(await services.translate({ languageCode, text: asset.captions_text, segment: 'ACTION' })) } : null;
      return { sequence: step.sequence, task_code: step.task_code, title, description, delivery_mode: asset ? 'VIDEO' : 'TEXT_TTS', guide, video };
    }));
    const steps = localizedSteps.map(({ sequence, task_code, title, description, delivery_mode }) => ({ sequence, task_code, title, description, delivery_mode }));
    const video = localizedSteps.flatMap((step) => step.video ? [step.video] : []);
    const source = [
      ...safety.map((notice) => sourceDetail(null, 'SAFETY', notice.guide)),
      ...localizedSteps.map((step) => sourceDetail(step.sequence, 'ACTION', step.guide)),
    ];
    const text = [
      context.location_display,
      context.quantity && typeof context.quantity === 'object' ? `${context.quantity.value} ${context.quantity.unit}` : null,
      context.deadline,
      ...context.safety,
      ...steps.map((step) => `${step.title} ${step.description}`),
      context.notes,
    ].filter((part) => typeof part === 'string' && part.trim()).join('\n');
    const textHash = hash(text);
    const speech = await services.synthesize({ languageCode, text }).catch(() => ({ status: 'FALLBACK', audio_url: null }));
    const ttsStatus = speech.status === 'READY' ? 'READY' : 'FALLBACK';
    const briefing = {
      session_id: work.session_id,
      version: work.version,
      contract_version: 'worker-briefing-v2',
      ontology_version: 'ontology-v2',
      language_code: languageCode,
      context,
      badges: ttsStatus === 'FALLBACK' ? ['TEXT_TTS_FALLBACK'] : [],
      steps: steps.map((step) => ttsStatus === 'FALLBACK' && step.delivery_mode === 'TEXT_TTS' ? { ...step, delivery_mode: 'TEXT' } : step),
      source_detail: source,
      tts: { status: ttsStatus, text_hash: textHash, audio_url: speech.audio_url ?? null },
      video
    };
    assertIdentityFree(briefing);
    return [languageCode, { cache_key: hash(JSON.stringify(briefing)), briefing, tts_transport: { status: ttsStatus, text, text_hash: textHash, audio_url: speech.audio_url ?? null, audio_bytes_base64: speech.audio_bytes_base64 ?? null } }];
  }));
  return Object.fromEntries(entries);
}
