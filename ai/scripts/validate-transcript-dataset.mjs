import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TASK_CODES = new Set(['ONION_HARVEST', 'ONION_COLLECT', 'BAGGING', 'LOADING', 'WAREHOUSE_TRANSPORT', 'STACKING']);
const STRUCTURE_KINDS = new Set(['STRUCTURE', 'AMBIGUOUS']);
const AMBIGUITY_KINDS = new Set(['SAFETY', 'TASK', 'LOCATION', 'QUANTITY', 'TIME', 'OTHER']);
const DATASET_VERSIONS = new Set(['transcript-v1', 'transcript-jeolla-v1']);
const keys = (value) => Object.keys(value).sort();
const sameKeys = (value, expected) => JSON.stringify(keys(value)) === JSON.stringify([...expected].sort());
const fail = (id, message) => { throw new Error(`${id}: ${message}`); };
const object = (value, id, expected) => {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !sameKeys(value, expected)) fail(id, 'invalid object shape');
};
const text = (value, id) => {
  if (typeof value !== 'string' || !value) fail(id, 'expected non-empty text');
};
const integer = (value, id) => {
  if (!Number.isInteger(value) || value < 1) fail(id, 'expected positive integer');
};
const nullableText = (value, id) => {
  if (value !== null && typeof value !== 'string') fail(id, 'expected text or null');
};
const quantity = (value, id, allowUnspecified) => {
  if (allowUnspecified && (value === null || value === 'UNSPECIFIED')) return;
  object(value, id, ['value', 'unit']);
  integer(value.value, id);
  text(value.unit, id);
};

function validateAmbiguities(ambiguities, id, allowedKinds = AMBIGUITY_KINDS) {
  if (!Array.isArray(ambiguities)) fail(id, 'ambiguities must be an array');
  for (const ambiguity of ambiguities) {
    object(ambiguity, id, ['field', 'message', 'blocking', 'kind']);
    text(ambiguity.field, id);
    text(ambiguity.message, id);
    if (typeof ambiguity.blocking !== 'boolean' || !allowedKinds.has(ambiguity.kind)) fail(id, 'invalid ambiguity');
  }
}

export function validateStructure(structure, id) {
  object(structure, id, ['interpretation', 'summary_ko', 'location', 'task_family', 'quantity', 'deadline', 'safety', 'notes', 'steps', 'ambiguities', 'schema_version', 'contract_version']);
  if (!['READY', 'AMBIGUOUS', 'UNSUPPORTED'].includes(structure.interpretation)) fail(id, 'invalid structure interpretation');
  text(structure.summary_ko, id);
  object(structure.location, id, ['raw_text', 'kind', 'canonical_name']);
  nullableText(structure.location.raw_text, id);
  nullableText(structure.location.canonical_name, id);
  if (!['DEICTIC', 'NAMED', 'UNSPECIFIED'].includes(structure.location.kind) || structure.task_family !== 'ONION') fail(id, 'invalid onion structure');
  quantity(structure.quantity, id, true);
  nullableText(structure.deadline, id);
  nullableText(structure.notes, id);
  if (!Array.isArray(structure.safety) || structure.safety.some((item) => typeof item !== 'string' || !item)) fail(id, 'invalid safety');
  if (!Array.isArray(structure.steps)) fail(id, 'steps must be an array');
  for (const step of structure.steps) {
    object(step, id, ['sequence', 'task_code', 'title_ko', 'description_ko', 'unsupported_reason']);
    integer(step.sequence, id);
    text(step.title_ko, id);
    text(step.description_ko, id);
    nullableText(step.unsupported_reason, id);
    if (step.task_code !== null && !TASK_CODES.has(step.task_code)) fail(id, 'invalid task code');
    if ((step.task_code === null) !== (typeof step.unsupported_reason === 'string' && step.unsupported_reason.length > 0)) fail(id, 'invalid unsupported step');
  }
  if ((structure.interpretation === 'UNSUPPORTED') !== structure.steps.some(({ task_code: taskCode }) => taskCode === null)) {
    fail(id, 'unsupported interpretation needs unsupported step');
  }
  validateAmbiguities(structure.ambiguities, id);
  if (structure.schema_version !== '1' || structure.contract_version !== 'structure-v1') fail(id, 'invalid structure version');
  if (structure.location.kind === 'DEICTIC' && (
    structure.interpretation !== 'AMBIGUOUS'
    || structure.location.raw_text === null
    || structure.location.canonical_name !== null
    || !structure.ambiguities.some(({ kind, blocking }) => kind === 'LOCATION' && !blocking)
  )) fail(id, 'deictic location needs non-blocking location ambiguity');
  if (structure.interpretation === 'AMBIGUOUS' && !structure.ambiguities.length) fail(id, 'ambiguous structure needs ambiguity');
  if (structure.interpretation === 'READY' && !structure.steps.length) fail(id, 'ready structure needs step');
  if (!structure.steps.length && (structure.interpretation === 'READY' || !structure.ambiguities.some(({ blocking, kind }) => blocking && kind === 'TASK'))) fail(id, 'empty steps need blocking task ambiguity');
}

export function validateQuantityChange(change, id) {
  object(change, id, ['interpretation', 'quantity', 'expected_version', 'ambiguities', 'schema_version', 'contract_version']);
  if (!['READY', 'AMBIGUOUS'].includes(change.interpretation)) fail(id, 'invalid quantity interpretation');
  integer(change.expected_version, id);
  validateAmbiguities(change.ambiguities, id, new Set(['QUANTITY']));
  if (change.schema_version !== '1' || change.contract_version !== 'quantity-change-v1') fail(id, 'invalid quantity version');
  if (change.interpretation === 'READY') {
    quantity(change.quantity, id, false);
    if (change.ambiguities.length) fail(id, 'ready quantity change cannot have ambiguities');
  } else if (change.quantity !== null || change.ambiguities.length !== 1 || !change.ambiguities[0].blocking) {
    fail(id, 'ambiguous quantity change needs one blocking ambiguity');
  }
}

export function validateDataset(records) {
  if (!Array.isArray(records) || records.length !== 30) throw new Error('dataset must contain exactly 30 cases');
  const datasetVersion = records[0]?.dataset_version;
  if (!DATASET_VERSIONS.has(datasetVersion)) throw new Error('invalid dataset version');
  let quantityChangeCount = 0;
  let ambiguousCount = 0;
  const ids = new Set();

  for (const record of records) {
    object(record, 'record', ['id', 'dataset_version', 'kind', 'transcript', 'gold_structure', 'gold_quantity']);
    text(record.id, 'record');
    if (ids.has(record.id)) fail(record.id, 'duplicate id');
    ids.add(record.id);
    if (record.dataset_version !== datasetVersion) fail(record.id, 'mixed dataset versions');
    text(record.transcript, record.id);
    if (record.kind === 'QUANTITY_CHANGE') {
      if (record.gold_structure !== null || record.gold_quantity === null) fail(record.id, 'quantity change needs only gold_quantity');
      validateQuantityChange(record.gold_quantity, record.id);
      quantityChangeCount += 1;
    } else if (STRUCTURE_KINDS.has(record.kind)) {
      if (record.gold_quantity !== null || record.gold_structure === null) fail(record.id, 'structure record needs only gold_structure');
      validateStructure(record.gold_structure, record.id);
      if (record.kind === 'AMBIGUOUS' && record.gold_structure.interpretation !== 'AMBIGUOUS') fail(record.id, 'ambiguous kind needs AMBIGUOUS gold structure');
      if (record.kind === 'STRUCTURE' && record.gold_structure.interpretation !== 'READY') fail(record.id, 'structure kind needs READY gold structure');
      if (record.kind === 'AMBIGUOUS') ambiguousCount += 1;
    } else {
      fail(record.id, 'invalid kind');
    }
  }

  if (quantityChangeCount < 5) throw new Error('dataset must contain at least 5 QUANTITY_CHANGE cases');
  if (ambiguousCount < 5) throw new Error('dataset must contain at least 5 AMBIGUOUS cases');
  return { datasetVersion, caseCount: records.length, quantityChangeCount, ambiguousCount };
}

export function validateDialectProvenance(records, provenance) {
  object(provenance, 'provenance', ['dataset_version', 'region', 'synthetic', 'review_status', 'reviewer', 'reviewed_at', 'limitations', 'sources', 'guide_forms', 'cases']);
  if (provenance.dataset_version !== 'transcript-jeolla-v1' || provenance.region !== 'JEOLLA' || provenance.synthetic !== true) fail('provenance', 'invalid dialect dataset identity');
  if (!['PENDING', 'VERIFIED'].includes(provenance.review_status)) fail('provenance', 'invalid review status');
  nullableText(provenance.reviewer, 'provenance');
  nullableText(provenance.reviewed_at, 'provenance');
  if (provenance.review_status === 'VERIFIED' && (!provenance.reviewer || !provenance.reviewed_at)) fail('provenance', 'verified review needs reviewer and reviewed_at');
  if (!Array.isArray(provenance.limitations) || !provenance.limitations.length || provenance.limitations.some((item) => typeof item !== 'string' || !item)) fail('provenance', 'limitations required');
  if (!Array.isArray(provenance.sources) || !provenance.sources.length) fail('provenance', 'sources required');
  const sourceIds = new Set();
  for (const source of provenance.sources) {
    object(source, 'source', ['id', 'title', 'url', 'pages', 'publisher', 'license', 'usage_note']);
    text(source.id, 'source');
    text(source.title, 'source');
    text(source.url, 'source');
    text(source.pages, 'source');
    text(source.publisher, 'source');
    text(source.license, 'source');
    text(source.usage_note, 'source');
    sourceIds.add(source.id);
  }
  if (!Array.isArray(provenance.guide_forms) || !provenance.guide_forms.length) fail('provenance', 'guide forms required');
  const guideForms = new Map();
  for (const form of provenance.guide_forms) {
    object(form, 'guide form', ['form', 'source_id', 'printed_page', 'pdf_page', 'standard_meaning', 'dataset_rule']);
    text(form.form, 'guide form');
    text(form.source_id, 'guide form');
    integer(form.printed_page, 'guide form');
    integer(form.pdf_page, 'guide form');
    text(form.standard_meaning, 'guide form');
    text(form.dataset_rule, 'guide form');
    if (!sourceIds.has(form.source_id) || guideForms.has(form.form)) fail(form.form, 'invalid guide form');
    guideForms.set(form.form, form);
  }
  if (!Array.isArray(provenance.cases) || provenance.cases.length !== records.length) fail('provenance', 'must cover every dataset case');
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const caseIds = new Set();
  for (const item of provenance.cases) {
    object(item, 'provenance case', ['id', 'markers']);
    if (caseIds.has(item.id) || !recordsById.has(item.id)) fail(item.id, 'invalid provenance case id');
    caseIds.add(item.id);
    if (!Array.isArray(item.markers) || !item.markers.length) fail(item.id, 'dialect marker required');
    for (const marker of item.markers) {
      object(marker, item.id, ['form', 'source_id', 'printed_page', 'pdf_page']);
      text(marker.form, item.id);
      text(marker.source_id, item.id);
      integer(marker.printed_page, item.id);
      integer(marker.pdf_page, item.id);
      const guideForm = guideForms.get(marker.form);
      if (!guideForm || marker.source_id !== guideForm.source_id || marker.printed_page !== guideForm.printed_page || marker.pdf_page !== guideForm.pdf_page || !recordsById.get(item.id).transcript.includes(marker.form)) fail(item.id, 'invalid dialect marker provenance');
    }
  }
  if (caseIds.size !== recordsById.size) fail('provenance', 'must cover every dataset case');
  return { caseCount: records.length, reviewStatus: provenance.review_status };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) throw new Error('usage: node ai/scripts/validate-transcript-dataset.mjs <dataset.jsonl>');
  const source = readFileSync(path, 'utf8').trim();
  const records = source ? source.split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`line ${index + 1}: invalid JSON`); }
  }) : [];
  const result = validateDataset(records);
  if (result.datasetVersion === 'transcript-jeolla-v1') {
    const provenance = JSON.parse(readFileSync(path.replace(/\.jsonl$/i, '.provenance.json'), 'utf8'));
    console.log({ ...result, provenance: validateDialectProvenance(records, provenance) });
  } else console.log(result);
}
