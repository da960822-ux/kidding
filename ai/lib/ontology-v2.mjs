export const ONTOLOGY_VERSION = 'ontology-v2';

export const TASK_CODES_BY_FAMILY = Object.freeze({
  ONION: Object.freeze(['ONION_HARVEST', 'ONION_TRIMMING', 'ONION_SORTING', 'ONION_TRANSPORT']),
  STRAWBERRY: Object.freeze(['STRAWBERRY_HARVEST', 'STRAWBERRY_SORTING', 'STRAWBERRY_INSPECTION', 'STRAWBERRY_PACKING'])
});

export function isTaskCodeForFamily(taskFamily, taskCode) {
  return TASK_CODES_BY_FAMILY[taskFamily]?.includes(taskCode) ?? false;
}
