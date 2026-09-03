import test from 'node:test';
import assert from 'node:assert/strict';

import { readLegacyV1 } from '../lib/contracts.mjs';

test('readLegacyV1 preserves legacy structure without mapping it to v2', () => {
  const legacy = { contract_version: 'structure-v1', steps: [{ task_code: 'ONION_COLLECT' }] };
  assert.deepEqual(readLegacyV1(legacy), legacy);
});
