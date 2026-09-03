import { expect, test } from '@playwright/test';

test('worker desktop keeps task focus and uses spacious fact rows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/w/demo-vi-token');

  await expect(page.getByRole('heading', { name: 'Công việc mới nhất' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menu công việc' })).toHaveCount(0);
  await expect(page.getByText('Địa điểm', { exact: true })).toHaveCSS('line-height', '32px');
});
