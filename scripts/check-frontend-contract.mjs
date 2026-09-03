import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, contracts, routes, model, mock, ownerScreens, workerScreens, openapi, structureSchema, vercel] = await Promise.all([
  readFile(new URL('../src/webapp/api.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/contracts.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/WebApp.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/model.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/mock-api.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/OwnerScreens.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/WorkerScreens.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../docs/openapi.yaml', import.meta.url), 'utf8'),
  readFile(new URL('../docs/schemas/structure-v1.schema.json', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
]);

for (const endpoint of [
  '/api/v1/owner/session', '/api/v1/work-sessions/drafts/from-audio',
  '/supplement', '/confirm', '/quantity-changes/from-audio',
  '/quantity-changes/confirm', '/worker-links', '/assignment', '/api/v1/brief',
  '/api/v1/work-teams/today', '/api/v1/work-team-invites/',
]) assert.ok(api.includes(endpoint), `Missing API endpoint: ${endpoint}`);
assert.ok(api.includes('retryOwnerSession') && api.includes('ownerRequest'), 'Owner API must retry once after session expiry');

for (const field of ['video_url', 'captions_text', 'AI_GENERATED_PREGENERATED', 'PUBLISHED', 'SUPERSEDED', 'LocalizedWorkerContext', 'WorkerBadgeCode']) {
  assert.ok(contracts.includes(field), `Missing canonical field: ${field}`);
}
for (const code of ['ONION_HARVEST', 'ONION_TRIMMING', 'ONION_SORTING', 'ONION_TRANSPORT', 'STRAWBERRY_HARVEST', 'STRAWBERRY_SORTING', 'STRAWBERRY_INSPECTION', 'STRAWBERRY_PACKING']) {
  assert.ok(contracts.includes(code), `Missing canonical task code: ${code}`);
  assert.ok(openapi.includes(code) && structureSchema.includes(code), `Contract documents missing task code: ${code}`);
  assert.ok(mock.includes(code), `Mock data missing task code: ${code}`);
}
for (const retired of ['ONION_COLLECT', 'BAGGING', 'LOADING', 'WAREHOUSE_TRANSPORT', 'STACKING']) {
  assert.ok(!contracts.includes(`'${retired}'`) && !mock.includes(`'${retired}'`) && !openapi.includes(retired) && !structureSchema.includes(retired), `Retired task code must not ship: ${retired}`);
}
assert.ok(contracts.includes("'ONION' | 'STRAWBERRY'"), 'Both P0 task families must ship');
JSON.parse(structureSchema);
assert.deepEqual(JSON.parse(vercel).rewrites, [{ source: '/(.*)', destination: '/index.html' }], 'SPA routes need Vercel fallback');

assert.ok(!routes.includes('/demo') && !routes.includes('/preview'), 'Mock routes must not ship');
assert.ok(routes.includes("role: '/start'") && routes.includes("'worker-entry': '/worker'"), 'Role selection routes must ship');
assert.ok(!routes.includes('owner-login'), 'Login route must not ship');
assert.ok(!model.includes('workerText'), 'Worker dummy data must not ship');
assert.ok(workerScreens.includes('>{t.understood}</ActionButton>') && !ownerScreens.includes('>{t.understood}</ActionButton>'), 'Acknowledgement belongs only to personal WorkerLink UI');
for (const value of ['READY', 'PUBLISHED', 'AI_TRANSLATION', 'TEXT_TTS', 'DEMO_FALLBACK', 'quantity-change-v1']) {
  assert.ok(mock.includes(value), `Mock contract value missing: ${value}`);
}
assert.ok(!mock.includes('OFFICIAL_GUIDE'), 'Mock data must not invent official-guide provenance');
assert.ok(!mock.includes('title_ko:') || mock.includes('workerSteps'), 'Worker fixtures must be localized before delivery');
console.log('Frontend contract check passed.');
