export async function regenerateQuantityPackages(work, quantity, buildPackages) {
  if (work?.contract_version !== 'structure-v2' || !Number.isInteger(work.version) || !quantity?.value || !quantity.unit) throw new TypeError('INVALID_QUANTITY_REGENERATION');
  const next = { ...work, version: work.version + 1, quantity };
  return buildPackages(next, ['vi', 'ne']);
}
