// Optional local regression: node scripts/test-clean-install.mjs <PGlite package directory>
// Install PGlite outside this repository; no remote database is accessed.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

assert.ok(process.argv[2], 'Pass the directory containing @electric-sql/pglite/package.json');
const runtime = resolve(process.argv[2]);
const { PGlite } = await import(pathToFileURL(resolve(runtime, 'dist/index.js')));
const { pgcrypto } = await import(pathToFileURL(resolve(runtime, 'dist/contrib/pgcrypto.js')));
const root = fileURLToPath(new URL('../', import.meta.url));
const migrations = resolve(root, 'supabase/migrations');
const files = readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort();
const bootstrap = readFileSync(resolve(root, 'supabase/clean-install-bootstrap.sql'), 'utf8');
const signature = 'public.publish_quantity_change(uuid,uuid,integer,jsonb,jsonb)';
const setup = `create role anon; create role authenticated; create role service_role;
  create schema extensions; create extension pgcrypto with schema extensions;`;

// Prove the historical failure from a clean schema, without editing any migration.
const broken = new PGlite({ extensions: { pgcrypto } });
try {
  await broken.exec(setup);
  for (const file of files.filter((name) => name < '202609030009')) {
    await broken.exec(readFileSync(resolve(migrations, file), 'utf8'));
  }
  const migration009 = files.find((name) => name.startsWith('202609030009'));
  assert.ok(migration009);
  await assert.rejects(
    broken.exec(readFileSync(resolve(migrations, migration009), 'utf8')),
    /function public\.publish_quantity_change\(uuid, uuid, integer, jsonb, jsonb\) does not exist/,
  );
  console.log('PASS: historical 009 failure reproduced');
} finally {
  await broken.close();
}

const clean = new PGlite({ extensions: { pgcrypto } });
try {
  await clean.exec(setup);
  await clean.exec(bootstrap);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const { rows } = await clean.query('select has_function_privilege($1, $2, $3) as allowed', [role, signature, 'EXECUTE']);
    assert.equal(rows[0].allowed, false, `${role} cannot execute the stub`);
  }
  await assert.rejects(clean.exec(`select ${signature.split('(')[0]}(null,null,null,null,null)`), /clean_install_bootstrap_stub_not_callable/);
  await assert.rejects(clean.exec(bootstrap), /clean_install_bootstrap_requires_empty_database/);
  await clean.exec('rollback');

  for (const file of files) {
    await clean.exec(readFileSync(resolve(migrations, file), 'utf8'));
    console.log(`PASS: ${file}`);
  }
  await clean.exec(readFileSync(resolve(root, 'supabase/tests/provision_farm_owner.sql'), 'utf8'));
  console.log('PASS: farm provisioning, PIN rotation, stable owner identity, rollback');
  await clean.exec(readFileSync(resolve(root, 'supabase/tests/temporary_team_access.sql'), 'utf8'));
  console.log('PASS: temporary team activation, fixed expiry, PIN isolation and version acknowledgements');
  const { rows } = await clean.query('select to_regprocedure($1) as leftover', [signature]);
  assert.equal(rows[0].leftover, null, 'Final cleanup removes the historical overload');
  await assert.rejects(clean.exec(bootstrap), /clean_install_bootstrap_requires_empty_database/);
  await clean.exec('rollback');
  console.log('PASS: permissions, duplicate/existing DB guards, complete replay, no leftover stub');
} finally {
  await clean.close();
}
