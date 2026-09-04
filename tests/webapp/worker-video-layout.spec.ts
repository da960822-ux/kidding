import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: '320-mobile', width: 320, height: 640 },
  { name: '390-mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1024, height: 900 },
]) {
  test(`worker video keeps the full frame at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('https://fixture.invalid/portrait.mp4', () => new Promise(() => {}));
    await page.goto('/start');
    await page.evaluate(async () => {
      const { api } = await import('/src/webapp/api.ts');
      const original = api.getAssignment;
      api.getAssignment = async (...args) => {
        const briefing = await original(...args);
        if (briefing.contract_version !== 'worker-briefing-v2') return briefing;
        return { ...briefing, video: [{
          step_sequence: briefing.steps[0].sequence, asset_id: 'portrait-video', task_code: briefing.steps[0].task_code!,
          video_url: 'https://fixture.invalid/portrait.mp4',
          captions_text: briefing.steps[0].description, provenance: 'AI_GENERATED_PREGENERATED', review_status: 'APPROVED', safety_level: 'LOW',
        }] };
      };
      history.pushState({}, '', '/w/demo-vi-token'); dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.getByRole('button', { name: 'Bắt đầu bước 1' }).click();

    const video = page.locator('main video');
    await expect(video).toBeVisible();
    expect(await video.evaluate((element) => getComputedStyle(element).objectFit)).toBe('contain');
    expect(await video.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(viewport.height * 0.7 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await expect(page.getByRole('button', { name: 'Nghe toàn bộ hướng dẫn', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nghe bước này', exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${viewport.name}.png`), fullPage: true });
  });
}
