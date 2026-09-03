export function readLegacyV1(value) {
  if (value?.contract_version !== 'structure-v1') throw new TypeError('LEGACY_V1_REQUIRED');
  return value;
}
