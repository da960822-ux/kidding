import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, contracts, routes, model, mock] = await Promise.all([
  readFile(new URL('../src/webapp/api.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/contracts.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/WebApp.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/model.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/webapp/mock-api.ts', import.meta.url), 'utf8'),
]);

for (const endpoint of [
  '/api/v1/owner/session', '/api/v1/work-sessions/drafts/from-audio',
  '/supplement', '/confirm', '/quantity-changes/from-audio',
  '/quantity-changes/confirm', '/worker-links', '/assignment', '/api/v1/brief',
  '/api/v1/work-teams/today', '/work-team-invites/', '/work-team-members/me/assignments',
]) assert.ok(api.includes(endpoint), `Missing API endpoint: ${endpoint}`);

for (const field of ['video_url', 'captions_text', 'AI_GENERATED_PREGENERATED', 'PUBLISHED', 'SUPERSEDED', 'LocalizedWorkerContext', 'WorkerBadgeCode']) {
  assert.ok(contracts.includes(field), `Missing canonical field: ${field}`);
}

assert.ok(!routes.includes('/demo') && !routes.includes('/preview'), 'Mock routes must not ship');
assert.ok(routes.includes("role: '/start'") && routes.includes("'worker-entry': '/worker'"), 'Role selection routes must ship');
assert.ok(!routes.includes('owner-login'), 'Login route must not ship');
assert.ok(!model.includes('workerText'), 'Worker dummy data must not ship');
for (const value of ['READY', 'PUBLISHED', 'AI_TRANSLATION', 'TEXT_TTS', 'DEMO_FALLBACK', 'quantity-change-v1']) {
  assert.ok(mock.includes(value), `Mock contract value missing: ${value}`);
}
assert.ok(!mock.includes('OFFICIAL_GUIDE'), 'Mock data must not invent official-guide provenance');
assert.ok(!mock.includes('title_ko:') || mock.includes('workerSteps'), 'Worker fixtures must be localized before delivery');
assert.ok(!contracts.includes('NationalityCode') && !mock.includes('nationality'), 'Temporary team must not collect nationality');
console.log('Frontend contract check passed.');
