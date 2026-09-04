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
