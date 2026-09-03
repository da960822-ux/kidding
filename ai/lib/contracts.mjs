import {
  validateQuantityChange as validateDatasetQuantityChange,
  validateStructure as validateDatasetStructure,
} from '../scripts/validate-transcript-dataset.mjs';

export class AiRuntimeError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'AiRuntimeError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const failSchema = () => { throw new AiRuntimeError('SCHEMA_INVALID', 422); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameKeys = (value, expected) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
const text = (value) => typeof value === 'string' && value.length > 0;
const positiveInteger = (value) => Number.isInteger(value) && value >= 1;
const nullableText = (value) => value === null || typeof value === 'string';
export const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export function validateStructureContract(value) {
  try {
    validateDatasetStructure(value, 'runtime');
    if (!value.steps.every((step, index) => step.sequence === index + 1)) failSchema();
    const hasUnsupportedStep = value.steps.some(({ task_code: taskCode }) => taskCode === null);
    if ((value.interpretation === 'UNSUPPORTED') !== hasUnsupportedStep) failSchema();
  } catch (error) {
    if (error instanceof AiRuntimeError) throw error;
    throw new AiRuntimeError('SCHEMA_INVALID', 422);
  }
  return value;
}

export function validateQuantityChangeContract(value) {
  try {
    validateDatasetQuantityChange(value, 'runtime');
  } catch {
    throw new AiRuntimeError('SCHEMA_INVALID', 422);
  }
  return value;
}

export function validateStt(value) {
  if (!sameKeys(value, ['transcript', 'language_code', 'confidence', 'schema_version', 'contract_version'])
    || !text(value.transcript)
    || value.language_code !== 'ko'
    || (value.confidence !== null && (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1))
    || value.schema_version !== '1'
    || value.contract_version !== 'stt-v1') failSchema();
  return value;
}

const SEGMENTS = new Set(['ACTION', 'QUANTITY', 'ORDER', 'SAFETY', 'LOCATION', 'OTHER']);
const LANGUAGES = new Set(['vi', 'ne']);

export function validateTranslation(value) {
  if (!sameKeys(value, ['segment', 'language_code', 'text', 'source', 'guide_lookup', 'phrase_key', 'verified', 'source_page', 'source_url', 'license', 'schema_version', 'contract_version'])
    || !SEGMENTS.has(value.segment)
    || !LANGUAGES.has(value.language_code)
    || !text(value.text)
    || value.schema_version !== '1'
    || value.contract_version !== 'translation-v1') failSchema();

  const official = value.source === 'OFFICIAL_GUIDE'
    && value.guide_lookup === 'HIT'
    && text(value.phrase_key)
    && value.verified === true
    && positiveInteger(value.source_page)
    && isHttpUrl(value.source_url)
    && text(value.license);
  const ai = value.source === 'AI_TRANSLATION'
    && value.guide_lookup === 'MISS'
    && value.phrase_key === null
    && value.verified === false
    && value.source_page === null
    && value.source_url === null
    && value.license === null;
  const deterministic = value.source === 'DETERMINISTIC'
    && value.guide_lookup === 'NOT_APPLICABLE'
    && value.phrase_key === null
    && value.verified === false
    && value.source_page === null
    && value.source_url === null
    && value.license === null;
  if ((!official && !ai && !deterministic) || (value.segment === 'SAFETY' && !official)) failSchema();
  return value;
}

const RISK_REASONS = new Set([
  'VEHICLE_OPERATION',
  'ROTATING_BLADE',
  'PESTICIDE_OR_CHEMICAL',
  'WORK_AT_HEIGHT',
  'POWERED_MACHINERY',
  'INSUFFICIENT_CONTEXT',
  'OTHER_HIGH_RISK',
]);

export function validateSafety(value) {
  if (!sameKeys(value, ['level', 'reasons', 'schema_version', 'contract_version'])
    || !['LOW', 'HIGH', 'UNKNOWN'].includes(value.level)
    || !Array.isArray(value.reasons)
    || new Set(value.reasons).size !== value.reasons.length
    || value.reasons.some((reason) => !RISK_REASONS.has(reason))
    || value.schema_version !== '1'
    || value.contract_version !== 'safety-policy-v1'
    || (value.level === 'LOW' && value.reasons.length !== 0)
    || (value.level !== 'LOW' && value.reasons.length === 0)) failSchema();
  return value;
}

export const isNullableText = nullableText;
