// Render actual AI outputs in the current UI using intercepted read responses.
// No owner mutation, database write, worker link issue, or delivery occurs.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const out = new URL('./', import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, out), 'utf8'));
const browser = await chromium.launch();
const checks = [];
try {
  for (const caseId of [1, 2, 3]) {
    const { draft } = await read(`case-${caseId}-r1.json`);
    const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    await page.addInitScript((id) => sessionStorage.setItem('batmeori-owner-draft-id', id), draft.draft_id);
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      assert.equal(route.request().method(), 'GET');
      const response = path.endsWith('/owner/session')
        ? { authenticated: true, expires_at: '2099-01-01T00:00:00Z', farm: { code: 'evaluation', display_name: '검증용 작업팀' }, team: null }
        : path.endsWith(`/drafts/${draft.draft_id}`) ? draft : { items: [] };
      await route.fulfill({ json: response });
    });
    await page.goto('http://127.0.0.1:4187/owner/draft/interpret');
    await page.getByText(draft.summary_ko, { exact: true }).waitFor();
    await page.screenshot({ path: fileURLToPath(new URL(`case-${caseId}-owner.png`, out)), fullPage: true });
    checks.push({ case: caseId, view: 'owner', notes_visible: draft.state.notes ? await page.getByText(draft.state.notes, { exact: true }).isVisible() : null,
      visible_text: await page.locator('main').innerText() });
    await page.close();
  }
  for (const caseId of [1, 3]) for (const language of ['vi', 'ne']) {
    const { briefing, tts_transport: transport } = await read(`case-${caseId}-${language}.json`);
    const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__spoken = [];
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { value: { cancel() {}, speak(value) { window.__spoken.push(value.text); value.onend?.(); } } });
    });
    await page.route('**/api/**', async (route) => {
      assert.equal(route.request().method(), 'GET');
      await route.fulfill({ json: briefing });
    });
    await page.goto(`http://127.0.0.1:4187/w/evaluation-${caseId}-${language}`);
    await page.getByRole('heading', { name: briefing.steps[0].title, exact: true }).waitFor();
    const row = { case: caseId, language, notes_visible_initially: briefing.context.notes ? await page.getByText(briefing.context.notes, { exact: true }).isVisible() : null };
    await page.screenshot({ path: fileURLToPath(new URL(`case-${caseId}-${language}-initial.png`, out)), fullPage: true });
    await page.locator('details > summary').click();
    row.notes_visible_expanded = briefing.context.notes ? await page.getByText(briefing.context.notes, { exact: true }).isVisible() : null;
    await page.screenshot({ path: fileURLToPath(new URL(`case-${caseId}-${language}-expanded.png`, out)), fullPage: true });
    row.expanded_text = await page.locator('main').innerText();
    const fullLabel = language === 'vi' ? 'Nghe toàn bộ hướng dẫn' : 'पूरा निर्देशन सुन्नुहोस्';
    await page.getByRole('button', { name: fullLabel, exact: true }).click();
    row.browser_full_speech = await page.evaluate(() => window.__spoken.at(-1));
    await page.getByRole('button', { name: language === 'vi' ? 'Bắt đầu bước 1' : 'चरण १ सुरु गर्नुहोस्', exact: true }).click();
    await page.getByRole('button', { name: language === 'vi' ? 'Nghe bước này' : 'यो चरण सुन्नुहोस्', exact: true }).waitFor();
    row.notes_visible_step = briefing.context.notes ? await page.getByText(briefing.context.notes, { exact: true }).isVisible() : null;
    for (let i = 1; i < briefing.steps.length; i++) await page.getByRole('button', { name: language === 'vi' ? 'Tiếp theo' : 'अर्को', exact: true }).click();
    row.last_step_text = await page.locator('main').innerText();
    await page.screenshot({ path: fileURLToPath(new URL(`case-${caseId}-${language}-transport.png`, out)), fullPage: true });
    row.tts_contains_notes = Boolean(briefing.context.notes && transport.text.includes(briefing.context.notes));
    row.tts_contains_deadline = Boolean(briefing.context.deadline && transport.text.includes(briefing.context.deadline));
    row.errors = errors;
    assert.deepEqual(errors, []);
    if (caseId === 3) {
      assert.equal(row.notes_visible_initially, false);
      assert.equal(row.notes_visible_expanded, true);
      assert.equal(row.notes_visible_step, false);
      assert.equal(row.tts_contains_notes, false);
      assert.equal(row.tts_contains_deadline, false);
      assert.equal(row.browser_full_speech.includes(briefing.context.notes), false);
    }
    checks.push(row);
    console.log(JSON.stringify({ case: caseId, language, notes_visible_initially: row.notes_visible_initially, notes_visible_expanded: row.notes_visible_expanded, notes_visible_step: row.notes_visible_step, tts_contains_notes: row.tts_contains_notes }));
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(new URL('browser-checks.json', out), JSON.stringify(checks, null, 2));
}
