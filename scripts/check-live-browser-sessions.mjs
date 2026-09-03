import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';

const origin = process.env.LIVE_FRONTEND_ORIGIN;
const teamId = process.env.LIVE_TEAM_ID;
const pin = process.env.LIVE_TEAM_PIN;
if (process.env.LIVE_E2E !== '1' || !origin || !teamId || !pin) {
  throw new Error('LIVE_E2E=1, LIVE_FRONTEND_ORIGIN, LIVE_TEAM_ID and LIVE_TEAM_PIN are required');
}

// Real browser cookie acceptance: never extract, inject, or resend Cookie headers.
const browser = await chromium.launch({ headless: true });
try {
  const owner = await browser.newPage();
  await owner.goto(`${origin}/owner/manage/${encodeURIComponent(teamId)}`);
  await owner.getByLabel('PIN', { exact: true }).fill(pin);
  const login = owner.waitForResponse((response) =>
    response.url() === `${origin}/api/v1/owner/team-session` && response.request().method() === 'POST');
  await owner.getByRole('button', { name: '이 팀 열기' }).click();
  assert.equal((await login).status(), 201, 'same-origin owner login');

  const ownerState = await owner.evaluate(async () => {
    const response = await fetch('/api/v1/owner/session');
    const teamResponse = await fetch('/api/v1/work-teams/today', {
      method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    return { ownerStatus: response.status, teamStatus: teamResponse.status, team: await teamResponse.json() };
  });
  assert.equal(ownerState.ownerStatus, 200, 'owner cookie retained by browser');
  assert.ok([200, 201].includes(ownerState.teamStatus), 'authenticated team request');
  assert.equal(new URL(ownerState.team.join_url).origin, origin, 'QR uses the frontend origin');

  const worker = await browser.newPage();
  await worker.goto(ownerState.team.join_url);
  const memberState = await worker.evaluate(async ({ token, key }) => {
    const joined = await fetch(`/api/v1/work-team-invites/${token}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ display_name: 'browser-e2e', language_code: 'ne' }),
    });
    const assignments = await fetch('/api/v1/work-team-members/me/assignments');
    const ownerSession = await fetch('/api/v1/owner/session');
    return { join: joined.status, assignments: assignments.status, owner: ownerSession.status };
  }, { token: new URL(ownerState.team.join_url).pathname.split('/').at(-1), key: randomUUID() });
  assert.equal(memberState.join, 201, 'anonymous member join');
  assert.equal(memberState.assignments, 200, 'member cookie retained by browser');
  assert.equal(memberState.owner, 401, 'worker browser has no owner session');
  console.log(JSON.stringify({ live_browser_sessions: 'PASS', owner_cookie: true, member_cookie: true }));
} finally {
  await browser.close();
}
