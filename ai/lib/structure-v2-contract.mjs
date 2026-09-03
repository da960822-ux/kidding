import { ONTOLOGY_VERSION, isTaskCodeForFamily } from './ontology-v2.mjs';

const hasKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && keys.every((key) => key in value) && Object.keys(value).every((key) => keys.includes(key));
const nonEmpty = (value) => typeof value === 'string' && value.length > 0;
const nullableString = (value) => value === null || typeof value === 'string';

function validQuantity(value) {
  return value === null || value === 'UNSPECIFIED' || (hasKeys(value, ['value', 'unit']) && Number.isInteger(value.value) && value.value >= 1 && nonEmpty(value.unit));
}

function validAmbiguity(value) {
  return hasKeys(value, ['field', 'message', 'blocking', 'kind']) && nonEmpty(value.field) && nonEmpty(value.message) && typeof value.blocking === 'boolean' && ['SAFETY', 'TASK', 'LOCATION', 'QUANTITY', 'TIME', 'OTHER'].includes(value.kind);
}

function validStep(step, family, interpretation) {
  if (!hasKeys(step, ['sequence', 'task_code', 'title_ko', 'description_ko', 'unsupported_reason']) || !Number.isInteger(step.sequence) || step.sequence < 1 || !nonEmpty(step.title_ko) || !nonEmpty(step.description_ko)) return false;
  if (step.task_code === null) return interpretation === 'UNSUPPORTED' && nonEmpty(step.unsupported_reason);
  return isTaskCodeForFamily(family, step.task_code) && step.unsupported_reason === null;
}

export function validateStructureV2(value) {
  const required = ['interpretation', 'summary_ko', 'location', 'task_family', 'quantity', 'deadline', 'safety', 'notes', 'steps', 'ambiguities', 'schema_version', 'contract_version', 'ontology_version'];
  if (!hasKeys(value, required)) return { ok: false, code: 'INVALID_STRUCTURE' };
  if (value.contract_version !== 'structure-v2' || value.ontology_version !== ONTOLOGY_VERSION || value.schema_version !== '2') return { ok: false, code: 'INVALID_CONTRACT_VERSION' };
  if (!['READY', 'AMBIGUOUS', 'UNSUPPORTED'].includes(value.interpretation) || !nonEmpty(value.summary_ko) || !['ONION', 'STRAWBERRY'].includes(value.task_family) || !validQuantity(value.quantity) || !nullableString(value.deadline) || !nullableString(value.notes) || !Array.isArray(value.safety) || value.safety.some((item) => !nonEmpty(item))) return { ok: false, code: 'INVALID_STRUCTURE' };
  if (!hasKeys(value.location, ['raw_text', 'kind', 'canonical_name']) || !nullableString(value.location.raw_text) || !['DEICTIC', 'NAMED', 'UNSPECIFIED'].includes(value.location.kind) || !nullableString(value.location.canonical_name)) return { ok: false, code: 'INVALID_LOCATION' };
  if (!Array.isArray(value.steps)) return { ok: false, code: 'INVALID_STEP' };
  if (value.steps.some((step) => !validStep(step, value.task_family, value.interpretation))) return { ok: false, code: 'INVALID_STEP' };
  if (!Array.isArray(value.ambiguities) || value.ambiguities.some((item) => !validAmbiguity(item)) || (value.interpretation === 'AMBIGUOUS' && value.ambiguities.length === 0)) return { ok: false, code: 'INVALID_AMBIGUITY' };
  if (value.steps.length === 0 && (value.interpretation !== 'AMBIGUOUS' || !value.ambiguities.some((item) => item.blocking && item.kind === 'TASK'))) return { ok: false, code: 'NO_EXECUTABLE_STEP' };
  return { ok: true };
}
