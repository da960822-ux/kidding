import { readFileSync } from 'node:fs';

const reference = JSON.parse(readFileSync(new URL('../references/structure-parsing-v1.json', import.meta.url), 'utf8'));
const locationRules = reference.field_rules.location;
const actionComplement = new Set(reference.field_rules.action_complements);
const quantityUnits = new Set(reference.field_rules.quantity_units);

const stripParticle = (value) => {
  if (typeof value !== 'string') return null;
  const particle = [...locationRules.trailing_particles].sort((a, b) => b.length - a.length).find((item) => value.endsWith(item));
  return (particle ? value.slice(0, -particle.length) : value).trim() || null;
};

const actionEvidence = (transcript) => reference.task_semantics
  .map((task) => ({ task, index: Math.min(...task.evidence_stems.map((stem) => transcript.indexOf(stem)).filter((index) => index >= 0)) }))
  .filter(({ index }) => Number.isFinite(index))
  .sort((left, right) => left.index - right.index);

const namedLocation = (transcript, current) => {
  const normalized = stripParticle(current?.raw_text || current?.canonical_name);
  const source = normalized || transcript;
  if (locationRules.named_head_terms.some((term) => source.includes(term))) {
    const match = source.match(/(?:[가-힣]+밭|밭가|창고(?:\s+(?:안|한쪽))?)/);
    const value = stripParticle(match?.[0] || normalized);
    if (value) return { raw_text: value, kind: 'NAMED', canonical_name: value };
  }
  const explicit = locationRules.named_terms.find((term) => transcript.includes(term));
  if (explicit) return { raw_text: explicit, kind: 'NAMED', canonical_name: explicit };
  return null;
};

const deicticLocation = (transcript) => {
  const form = locationRules.deictic_forms.find((item) => transcript.includes(item));
  return form ? { raw_text: form, kind: 'DEICTIC', canonical_name: null } : null;
};

const ambiguity = (field, blocking, kind) => ({ field, message: `${field} 확인 필요`, blocking, kind });

const normalizeNotes = (transcript, notes) => {
  if (typeof notes !== 'string') return null;
  const value = notes.trim();
  if (!value || actionComplement.has(value)) return null;
  return transcript.includes(`${value} 양파`) ? `${value} 양파` : value;
};

const normalizeSteps = (transcript, steps) => {
  const evidence = actionEvidence(transcript);
  if (!evidence.length) return steps.map((step, index) => ({ ...step, sequence: index + 1 }));
  const selected = [];
  for (const { task } of evidence) {
    if (task.merge_surface_verbs && selected.some(({ task_code: code }) => code === task.task_code)) continue;
    const source = steps.find(({ task_code: code }) => code === task.task_code) || steps[selected.length];
    if (!source) continue;
    selected.push({ ...source, sequence: selected.length + 1, task_code: task.task_code, unsupported_reason: null });
  }
  return selected.length ? selected : steps.map((step, index) => ({ ...step, sequence: index + 1 }));
};

export function normalizeStructure(transcript, structure) {
  const output = structuredClone(structure);
  if (output.interpretation === 'UNSUPPORTED') return output;
  const text = String(transcript).trim();
  output.steps = normalizeSteps(text, output.steps);
  output.notes = normalizeNotes(text, output.notes);

  const named = namedLocation(text, output.location);
  const deictic = named ? null : deicticLocation(text);
  output.location = named || deictic || output.location;

  const recalled = reference.field_rules.recalled_context.markers.some((marker) => text.includes(marker)) && !actionEvidence(text).length;
  const explicitQuantity = [...quantityUnits].some((unit) => text.includes(unit));
  const existingLocation = output.ambiguities.find(({ kind }) => kind === 'LOCATION');
  const existingTask = output.ambiguities.find(({ kind }) => kind === 'TASK');
  let ambiguities = output.ambiguities.filter(({ kind }) => kind !== 'LOCATION');
  if (!explicitQuantity) ambiguities = ambiguities.filter(({ kind }) => kind !== 'QUANTITY');
  if (output.location.kind === 'DEICTIC') ambiguities.push(existingLocation || ambiguity('location', false, 'LOCATION'));
  if (recalled) {
    ambiguities = ambiguities.filter(({ kind }) => kind !== 'TASK');
    ambiguities = ambiguities.filter(({ kind }) => kind !== 'LOCATION');
    ambiguities.push(existingTask || ambiguity('task', true, 'TASK'), existingLocation || ambiguity('location', true, 'LOCATION'));
  }
  output.ambiguities = ambiguities;
  output.interpretation = output.steps.length && !ambiguities.length ? 'READY' : 'AMBIGUOUS';
  return output;
}
