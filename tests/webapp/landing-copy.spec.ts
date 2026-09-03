import { expect, test } from '@playwright/test';

test('Korean landing uses natural two-crop copy and keeps its hero readable on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');

  await expect(page.locator('#service').getByText('농사의 시작은 소통입니다', { exact: true })).toBeVisible();
  await expect(page.locator('#service').getByText('전라도 사투리로 말한 작업 지시를 AI가 이해해 베트남어와 네팔어로 정확히 전달합니다. 농장주와 근로자를 잇는 쉬운 방법, 밭머리.', { exact: true })).toBeVisible();
  await expect(page.locator('#how').getByText('양파나 딸기 작업, 수량, 장소를 말해주세요.', { exact: true })).toBeVisible();
  await expect(page.locator('#service').getByText('일이 통합니다', { exact: true })).toHaveCSS('white-space', 'normal');
  await expect(page.locator('#service').getByText(/전라도 사투리로 말한 작업 지시/)).toHaveCSS('word-break', 'keep-all');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
