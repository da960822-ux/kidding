import { validateSafety, validateStructureContract } from './contracts.mjs';

const HIGH_RULES = [
  ['VEHICLE_OPERATION', /운전|몰고|차량\s*(운행|이동)|트럭\s*운전|자동차\s*운전/i],
  ['ROTATING_BLADE', /회전\s*날|회전날|칼날|회전\s*칼/i],
  ['PESTICIDE_OR_CHEMICAL', /농약|제초제|살충제|화학\s*물질|약제/i],
  ['WORK_AT_HEIGHT', /고소\s*작업|높은\s*곳|사다리|지붕|나무에?\s*올라/i],
  ['POWERED_MACHINERY', /동력\s*기계|경운기|트랙터|트렉터|예초기|기계로/i],
  ['OTHER_HIGH_RISK', /용접|폭발물|전기\s*작업/i],
];

const textContent = (structure) => [
  structure.summary_ko,
  structure.notes,
  structure.location.raw_text,
  structure.location.canonical_name,
  ...structure.safety,
  ...structure.steps.flatMap(({ title_ko, description_ko }) => [title_ko, description_ko]),
].filter((value) => typeof value === 'string').join('\n');

export function preflightSafety(structure) {
  validateStructureContract(structure);
  const content = textContent(structure);
  const reasons = HIGH_RULES
    .filter(([, pattern]) => pattern.test(content))
    .map(([reason]) => reason);
  if (reasons.length) {
    return validateSafety({
      level: 'HIGH',
      reasons,
      schema_version: '1',
      contract_version: 'safety-policy-v1',
    });
  }
  if (structure.ambiguities.some(({ kind }) => kind === 'SAFETY')) {
    return validateSafety({
      level: 'UNKNOWN',
      reasons: ['INSUFFICIENT_CONTEXT'],
      schema_version: '1',
      contract_version: 'safety-policy-v1',
    });
  }
  return validateSafety({
    level: 'LOW',
    reasons: [],
    schema_version: '1',
    contract_version: 'safety-policy-v1',
  });
}

export const hasBlockingAmbiguity = (structure) => structure.ambiguities.some(({ blocking }) => blocking);
