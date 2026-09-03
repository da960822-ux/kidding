import test from 'node:test';
import assert from 'node:assert/strict';

import { regenerateQuantityPackages } from '../lib/owner-runtime.mjs';

test('regenerateQuantityPackages rebuilds both language packages from a changed quantity', async () => {
  const work = { contract_version: 'structure-v2', version: 1, quantity: { value: 20, unit: '망' } };
  const packages = await regenerateQuantityPackages(work, { value: 15, unit: '망' }, async (next, languages) => ({ next, languages }));
  assert.equal(packages.next.version, 2);
  assert.deepEqual(packages.languages, ['vi', 'ne']);
  assert.equal(packages.next.quantity.value, 15);
});
