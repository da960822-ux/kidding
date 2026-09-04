// Fresh real AI packages in the current UI; intercepted read responses only.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const out = new URL('./', import.meta.url);
const browser = await chromium.launch();
const observations = [];
try {
  for (const language of ['vi', 'ne']) for (const width of [390, 1100]) {
    const { briefing } = JSON.parse(await readFile(new URL(`case-3-${language}.json`, out), 'utf8'));
    briefing.tts.audio_url = `/evaluation-${language}.mp3`;
    const page = await browser.newPage({ viewport: { width, height: 932 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const NativeAudio = window.Audio;
      window.Audio = function (url) { const audio = new NativeAudio(url); window.__audio = audio; return audio; };
    });
    await page.route('**/api/**', (route) => route.fulfill({ json: briefing }));
    await page.route(`**/evaluation-${language}.mp3`, async (route) => route.fulfill({ contentType: 'audio/mpeg', body: await readFile(new URL(`case-3-${language}.mp3`, out)) }));
    await page.goto(`http://127.0.0.1:4187/w/evaluation-${language}`);
    await expect(page.getByText(briefing.context.notes, { exact: true })).toBeVisible();
    const start = page.getByRole('button', { name: language === 'vi' ? 'Bắt đầu bước 1' : 'चरण १ सुरु गर्नुहोस्', exact: true });
    const noteBounds = await page.getByText(briefing.context.notes, { exact: true }).boundingBox();
    const startBounds = await start.boundingBox();
    expect(noteBounds.y).toBeLessThan(startBounds.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: fileURLToPath(new URL(`${language}-${width}-first.png`, out)), fullPage: true });
    await page.locator('details > summary').click();
    await page.getByRole('button', { name: language === 'vi' ? 'Nghe toàn bộ hướng dẫn' : 'पूरा निर्देशन सुन्नुहोस्', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__audio?.currentTime ?? 0)).toBeGreaterThan(0);
    const duration = await page.evaluate(() => window.__audio.duration);
    await start.click();
    await expect(page.getByText(briefing.context.notes, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__audio.paused)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: fileURLToPath(new URL(`${language}-${width}-step.png`, out)), fullPage: true });
    expect(errors).toEqual([]);
    observations.push({ language, width, notes_before_start: true, notes_visible_step: true, actual_mp3_playback: true, duration_seconds: duration, audio_stopped_on_navigation: true, errors });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(new URL('browser-checks.json', out), JSON.stringify(observations, null, 2));
}
console.log(JSON.stringify(observations));
