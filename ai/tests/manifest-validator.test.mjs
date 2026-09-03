import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('manifest validator treats --allow-empty as a flag, not an input path', () => {
  const result = spawnSync(process.execPath, ['ai/scripts/validate-manifests.mjs', '--allow-empty'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
