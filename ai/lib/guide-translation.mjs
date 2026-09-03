import { isHttpUrl } from './contracts.mjs';

const LANGUAGES = new Set(['vi', 'ne']);
const KINDS = new Set(['ACTION', 'SAFETY']);
const SEGMENTS = new Set(['ACTION', 'QUANTITY', 'ORDER', 'SAFETY', 'LOCATION', 'OTHER']);
const SOURCES = new Set(['OFFICIAL_GUIDE', 'AI_TRANSLATION', 'DETERMINISTIC']);
const LOOKUPS = new Set(['HIT', 'MISS', 'NOT_APPLICABLE']);
const REQUIRED_KEYS = [
  'segment', 'language_code', 'text', 'source', 'guide_lookup', 'phrase_key', 'verified',
  'source_page', 'source_url', 'license', 'schema_version', 'contract_version',
];

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const normalizeKo = (value) => String(value).normalize('NFC').replace(/\s+/g, ' ').trim();
const hasEvidence = (row) => isHttpUrl(row.source_url)
  && nonEmpty(row.source_name)
    && Number.isInteger(Number(row.source_page))
    && Number(row.source_page) > 0
    && nonEmpty(row.license);

const request = (text, languageCode, kind) => ({
  segment: kind,
  language_code: languageCode,
  source_text: text,
  source: 'AI_TRANSLATION',
  guide_lookup: 'MISS',
  phrase_key: null,
  verified: false,
});

export function lookupGuide(text, languageCode, kind, rows) {
  if (!nonEmpty(text)) throw new Error('text is required');
  if (!LANGUAGES.has(languageCode)) throw new Error('language_code must be vi or ne');
  if (!KINDS.has(kind)) throw new Error('segment kind must be ACTION or SAFETY');
  if (!Array.isArray(rows)) throw new Error('guide rows must be an array');

  const match = rows.find((row) => normalizeKo(row.canonical_ko) === normalizeKo(text)
    && row.language_code === languageCode
    && (row.verified === true || row.verified === 'true')
    && hasEvidence(row)
    && nonEmpty(row.translated_text));
  if (match) {
    const segment = {
      segment: kind,
      language_code: languageCode,
      text: match.translated_text,
      source: 'OFFICIAL_GUIDE',
      guide_lookup: 'HIT',
      phrase_key: match.phrase_key,
      verified: true,
      source_page: Number(match.source_page),
      source_url: match.source_url,
      license: match.license,
      schema_version: '1',
      contract_version: 'translation-v1',
    };
    return { status: 'HIT', blocked: false, segment: validateTranslationSegment(segment), request: null };
  }

  return {
    status: 'MISS',
    blocked: kind === 'SAFETY',
    request: kind === 'SAFETY' ? null : request(text, languageCode, kind),
  };
}

export function validateTranslationSegment(segment) {
  if (!segment || typeof segment !== 'object' || Array.isArray(segment)) throw new Error('translation segment must be an object');
  if (JSON.stringify(Object.keys(segment).sort()) !== JSON.stringify([...REQUIRED_KEYS].sort())) {
    throw new Error('translation segment has invalid shape');
  }
  if (!SEGMENTS.has(segment.segment)) throw new Error('translation segment has invalid segment');
  if (!LANGUAGES.has(segment.language_code)) throw new Error('translation segment has invalid language_code');
  if (!nonEmpty(segment.text)) throw new Error('translation segment text is required');
  if (!SOURCES.has(segment.source) || !LOOKUPS.has(segment.guide_lookup)) throw new Error('translation segment has invalid provenance');
  if (segment.verified !== (segment.source === 'OFFICIAL_GUIDE')) throw new Error('translation segment verified flag is invalid');
  if (segment.schema_version !== '1' || segment.contract_version !== 'translation-v1') throw new Error('translation segment version is invalid');

  if (segment.source === 'OFFICIAL_GUIDE') {
    if (segment.guide_lookup !== 'HIT' || !nonEmpty(segment.phrase_key)
      || segment.source_page !== Math.trunc(segment.source_page) || segment.source_page < 1
      || !nonEmpty(segment.source_url) || !nonEmpty(segment.license)) {
      throw new Error('OFFICIAL_GUIDE segment requires verified source evidence');
    }
    if (!isHttpUrl(segment.source_url)) throw new Error('OFFICIAL_GUIDE segment has invalid source_url');
  } else if (segment.phrase_key !== null || segment.source_page !== null || segment.source_url !== null || segment.license !== null) {
    throw new Error('non-official segment cannot contain guide evidence');
  } else if ((segment.source === 'AI_TRANSLATION' && segment.guide_lookup !== 'MISS')
    || (segment.source === 'DETERMINISTIC' && segment.guide_lookup !== 'NOT_APPLICABLE')) {
    throw new Error('translation segment has invalid lookup');
  }
  if (segment.segment === 'SAFETY' && segment.source !== 'OFFICIAL_GUIDE') throw new Error('SAFETY segment requires OFFICIAL_GUIDE');
  return segment;
}
