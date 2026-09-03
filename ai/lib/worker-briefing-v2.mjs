import { createHash } from 'node:crypto';

const LANGUAGES = new Set(['vi', 'ne']);
const FORBIDDEN = new Set(['transcript', 'raw_audio', 'risk_assessment', 'token_hash', 'owner_id', 'farm_id', 'member_id', 'worker_id', 'display_name']);
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
    ? { ...work.quantity, unit: await translate({ languageCode, text: work.quantity.unit, segment: 'QUANTITY' }) }
    : work.quantity;
  return { task_family: work.task_family, location_display: locationDisplay, quantity, deadline, notes };
}

export async function buildWorkerPackagesV2(work, languages, services) {
  assertIdentityFree(work);
  if (!Array.isArray(languages) || new Set(languages).size !== languages.length) throw new TypeError('INVALID_LANGUAGES');
  const entries = await Promise.all(languages.map(async (languageCode) => {
    assertLanguage(languageCode);
    const video = [];
    const localized = await Promise.all(work.steps.map(async (step) => {
      const title = await services.translate({ languageCode, text: step.title_ko, segment: 'ACTION' });
      const candidate = await (services.guideLookup?.({ languageCode, canonical_ko: step.description_ko }) ?? null);
      const guide = candidate && candidate.language_code === languageCode && typeof candidate.translated_text === 'string'
        && candidate.translated_text.trim() && Number.isInteger(candidate.source_page) && typeof candidate.source_url === 'string'
        && typeof candidate.license === 'string' ? candidate : null;
      const description = guide?.translated_text ?? await services.translate({ languageCode, text: step.description_ko, segment: 'ACTION' });
      const asset = services.matchVisualAsset(step.task_code);
      if (asset) video.push({ step_sequence: step.sequence, asset_id: asset.id, task_code: step.task_code, video_url: asset.public_path, provenance: 'AI_GENERATED_PREGENERATED', review_status: 'APPROVED', safety_level: 'LOW', captions_text: asset.captions_text });
      return { sequence: step.sequence, task_code: step.task_code, title, description, delivery_mode: asset ? 'VIDEO' : 'TEXT_TTS', guide };
    }));
    const steps = localized.map(({ sequence, task_code, title, description, delivery_mode }) => ({ sequence, task_code, title, description, delivery_mode }));
    const source = localized.map((step) => sourceDetail(step.sequence, 'ACTION', step.guide));
    const texts = steps.map((step) => `${step.title} ${step.description}`);
    const textHash = hash(texts.join('\n'));
    const speech = await services.synthesize({ languageCode, text: texts.join('\n') }).catch(() => ({ status: 'FALLBACK', audio_url: null }));
    const ttsStatus = speech.status === 'READY' ? 'READY' : 'FALLBACK';
    const briefing = {
      session_id: work.session_id,
      version: work.version,
      contract_version: 'worker-briefing-v2',
      ontology_version: 'ontology-v2',
      language_code: languageCode,
      context: await localizeContext(work, languageCode, services.translate),
      badges: ttsStatus === 'FALLBACK' ? ['TEXT_TTS_FALLBACK'] : [],
      steps: steps.map((step) => ttsStatus === 'FALLBACK' && step.delivery_mode === 'TEXT_TTS' ? { ...step, delivery_mode: 'TEXT' } : step),
      source_detail: source,
      tts: { status: ttsStatus, text_hash: textHash, audio_url: speech.audio_url ?? null },
      video
    };
    return [languageCode, { cache_key: hash(JSON.stringify(briefing)), briefing, tts_transport: { status: ttsStatus, text_hash: textHash, audio_url: speech.audio_url ?? null, audio_bytes_base64: speech.audio_bytes_base64 ?? null } }];
  }));
  return Object.fromEntries(entries);
}
