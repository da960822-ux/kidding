import { readFile } from 'node:fs/promises';
import { TASK_CODES_BY_FAMILY } from './ontology-v2.mjs';

const FAMILIES = new Set(Object.keys(TASK_CODES_BY_FAMILY));
const TASK_CODES = new Set(Object.values(TASK_CODES_BY_FAMILY).flat());
const REVIEW_STATUS = new Set(['PENDING', 'UNVERIFIED']);
const MAX_MATCHES = 8;
const DEFAULT_REFERENCE_URL = new URL('../references/dialect-v2.json', import.meta.url);

function invalid(code) {
  throw new TypeError(`INVALID_DIALECT_REFERENCE_${code}`);
}

function normalized(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
}

export function validateDialectReferenceDocument(document) {
  if (!document || typeof document !== 'object' || document.reference_version !== 'dialect-v2') invalid('VERSION');
  const provenance = document.provenance;
  if (!provenance || typeof provenance !== 'object' || provenance.kind !== 'SELF_AUTHORED_DIALECT_KNOWLEDGE' || provenance.verified !== false || provenance.review_status !== 'PENDING') invalid('PROVENANCE');
  const sourceIds = new Set((provenance.official_sources ?? []).map((source) => source?.source_id).filter(Boolean));
  if (sourceIds.size !== (provenance.official_sources ?? []).length) invalid('SOURCES');
  if (!Array.isArray(document.entries) || !document.entries.length) invalid('ENTRIES');
  const ids = new Set();
  for (const entry of document.entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)) invalid('ENTRY');
    ids.add(entry.id);
    if (!Array.isArray(entry.forms) || !entry.forms.length || entry.forms.some((form) => typeof form !== 'string' || !form.trim())) invalid('FORMS');
    if (entry.task_family !== null && !FAMILIES.has(entry.task_family)) invalid('FAMILY');
    if (entry.task_code !== null && !TASK_CODES.has(entry.task_code)) invalid('TASK_CODE');
    if (entry.task_code !== null && TASK_CODES_BY_FAMILY[entry.task_family]?.includes(entry.task_code) !== true) invalid('TASK_CODE_FAMILY');
    if (!Array.isArray(entry.semantic_candidates) || !entry.semantic_candidates.length || entry.semantic_candidates.some((item) => typeof item !== 'string' || !item.trim())) invalid('SEMANTIC_CANDIDATES');
    if (!Array.isArray(entry.context_prerequisites) || entry.context_prerequisites.some((item) => typeof item !== 'string' || !item.trim())) invalid('PREREQUISITES');
    if (!Array.isArray(entry.counterexamples) || entry.counterexamples.some((item) => typeof item !== 'string' || !item.trim())) invalid('COUNTEREXAMPLES');
    if (entry.review_status !== undefined && !REVIEW_STATUS.has(entry.review_status)) invalid('REVIEW_STATUS');
    if (entry.source_ids !== undefined && (!Array.isArray(entry.source_ids) || entry.source_ids.some((sourceId) => !sourceIds.has(sourceId)))) invalid('MISSING_SOURCE_ID');
  }
  return document;
}

export async function loadDialectReferenceDocument(source = DEFAULT_REFERENCE_URL) {
  let document;
  try {
    document = JSON.parse(await readFile(source, 'utf8'));
  } catch {
    invalid('LOAD');
  }
  return validateDialectReferenceDocument(document);
}

function familyPresent(transcript, family) {
  const compact = normalized(transcript);
  return family === 'ONION' ? compact.includes('양파') : compact.includes('딸기');
}

function selectedEntry(entry, matchedForms) {
  return {
    task_family: entry.task_family,
    task_code: entry.task_code,
    matched_forms: matchedForms,
    semantic_candidates: entry.semantic_candidates,
    context_prerequisites: entry.context_prerequisites,
    counterexamples: entry.counterexamples,
    review_status: entry.review_status ?? 'PENDING',
    evidence_status: entry.evidence_status ?? 'SELF_AUTHORED_CANDIDATE',
    provenance: 'unverified advisory',
  };
}

export function selectDialectContext(transcript, document) {
  if (typeof transcript !== 'string' || !transcript.trim()) return { matches: [] };
  const validated = validateDialectReferenceDocument(document);
  const compact = normalized(transcript);
  const hasOnion = familyPresent(transcript, 'ONION');
  const hasStrawberry = familyPresent(transcript, 'STRAWBERRY');
  const matches = [];
  for (const entry of validated.entries) {
    if (entry.task_family === 'ONION' && hasStrawberry && !hasOnion) continue;
    if (entry.task_family === 'STRAWBERRY' && hasOnion && !hasStrawberry) continue;
    const matchedForms = entry.forms.filter((form) => compact.includes(normalized(form)));
    if (matchedForms.length) matches.push({ entry, matchedForms });
  }
  matches.sort((a, b) => Math.max(...b.matchedForms.map((form) => normalized(form).length)) - Math.max(...a.matchedForms.map((form) => normalized(form).length)));
  return { matches: matches.slice(0, MAX_MATCHES).map(({ entry, matchedForms }) => selectedEntry(entry, matchedForms)) };
}

export function renderDialectContext(context) {
  if (!context?.matches?.length) return '<dialect-context>none selected</dialect-context>';
  return `<dialect-context>\n${JSON.stringify(context)}\n</dialect-context>`;
}
