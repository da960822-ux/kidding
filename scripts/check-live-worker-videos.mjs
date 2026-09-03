import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const workerUrl = process.env.LIVE_WORKER_URL;
const expectedCount = Number(process.env.LIVE_EXPECTED_VIDEO_COUNT);
if (!workerUrl || !Number.isInteger(expectedCount) || expectedCount < 1) {
  throw new Error('LIVE_WORKER_URL and positive LIVE_EXPECTED_VIDEO_COUNT are required');
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(workerUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Xem từng bước' }).click();

  const results = [];
  for (let index = 0; index < expectedCount; index += 1) {
    const video = page.locator('video');
    await video.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const element = document.querySelector('video');
      return Boolean(element && (element.error || element.readyState >= HTMLMediaElement.HAVE_METADATA));
    });
    const result = await video.evaluate(async (element) => {
      if (element.error) throw new Error(`VIDEO_LOAD_FAILED_${element.error.code}`);
      element.muted = true;
      await element.play();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        duration: element.duration,
        width: element.videoWidth,
        height: element.videoHeight,
        paused: element.paused,
      };
    });
    assert.ok(Number.isFinite(result.duration) && result.duration > 0, result);
    assert.ok(result.width > 0 && result.height > 0, result);
    assert.equal(result.paused, false, result);
    results.push(result);
    if (index + 1 < expectedCount) await page.getByRole('button', { name: 'Tiếp theo' }).click();
  }
  console.log(JSON.stringify({ live_video_browser: 'PASS', videos: results }));
} finally {
  await browser.close();
}
