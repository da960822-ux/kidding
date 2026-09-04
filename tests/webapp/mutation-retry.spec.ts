import { expect, test } from '@playwright/test';

// Run with VITE_USE_MOCK_API=false; these routes exercise the real API wrapper.
test('uncertain confirmation retries keep the same key and input; a new action gets a new key', async ({ page }) => {
  const requests: { key: string | undefined; body: string | null }[] = [];
  await page.route('**/api/v1/work-sessions/retry/quantity-changes/confirm', async (route) => {
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
    if (requests.length === 1) return route.abort('failed');
    await route.fulfill({ json: { session_id: 'retry', current_version: 2 } });
  });
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api, isMockApi } = await import('/src/webapp/api.ts');
    if (isMockApi) throw new Error('Run mutation-retry with real API configuration');
    await api.confirmQuantityChange('retry', { value: 15, unit: '망' }, 1).catch(() => undefined);
    await api.confirmQuantityChange('retry', { value: 15, unit: '망' }, 1);
    await api.confirmQuantityChange('retry', { value: 15, unit: '망' }, 2);
  });
  expect(requests[0].key).toBeTruthy();
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2].key).not.toBe(requests[1].key);
});

test('uncertain team assignment retries keep the same key and input; success resets the key', async ({ page }) => {
  const requests: { key: string | undefined; body: string | null }[] = [];
  await page.route('**/api/v1/work-teams/today/members/member-1/assignments', async (route) => {
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
    if (requests.length === 1) return route.abort('failed');
    await route.fulfill({ status: 201, json: { member_id: 'member-1', work_session_id: 'session-1', assigned_at: '2026-09-04T00:00:00Z' } });
  });
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api, isMockApi } = await import('/src/webapp/api.ts');
    if (isMockApi) throw new Error('Run mutation-retry with real API configuration');
    await api.assignTodayTeamMember('member-1', 'session-1').catch(() => undefined);
    await api.assignTodayTeamMember('member-1', 'session-1');
    await api.assignTodayTeamMember('member-1', 'session-1');
  });
  expect(requests[0].key).toBeTruthy();
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2].body).toBe(requests[1].body);
  expect(requests[2].key).not.toBe(requests[1].key);
});
