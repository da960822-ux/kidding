// Real UI/API/provider integration. Only the microphone source is synthetic;
// MediaRecorder, uploads, authentication, translation, media and polling are real.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const origin = process.env.LIVE_FRONTEND_ORIGIN;
const changeAudio = process.env.LIVE_CHANGE_AUDIO || 'evals/audio/workflow/quantity-ten.wav';
assert(process.env.LIVE_E2E === '1' && origin, 'LIVE_E2E=1 and LIVE_FRONTEND_ORIGIN required (paid providers)');
const output = resolve(process.env.LIVE_REPORT_DIR || `tmp/full-workflow-${Date.now()}`);
await mkdir(output, { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true });
const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const owner = await ownerContext.newPage();
const api = async (page, path) => page.evaluate(async (path) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}, path);
const responseFor = (page, suffix) => page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(suffix), { timeout: 180_000 });
async function result(response, expected) {
  const body = await response.json();
  assert.equal(response.status(), expected, `${new URL(response.url()).pathname}: ${body.code || 'UNEXPECTED_STATUS'}`);
  return body;
}
async function stage(name, run) {
  const started = Date.now();
  try { await run(); results.push({ name, status: 'PASS', duration_ms: Date.now() - started }); }
  catch (error) { results.push({ name, status: 'FAIL', error: safeError(error), duration_ms: Date.now() - started }); throw error; }
  finally { console.log(JSON.stringify(results.at(-1))); await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2)); }
}
async function record(page, file, submitLabel, endpoint) {
  const bytes = await readFile(file);
  await page.evaluate(async (base64) => {
    const context = new AudioContext();
    const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const buffer = await context.decodeAudioData(data.buffer);
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (!constraints.audio) return original(constraints);
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(destination);
      await context.resume(); source.start(context.currentTime + 0.25);
      window.__fixtureEnded = false;
      source.onended = () => { window.__fixtureEnded = true; void context.close(); };
      return destination.stream;
    };
  }, bytes.toString('base64'));
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await page.waitForFunction(() => window.__fixtureEnded === true);
  await page.getByRole('button', { name: '녹음 중지', exact: true }).click();
  await expect(page.getByLabel('내 녹음 다시 듣기')).toBeVisible();
  const pending = responseFor(page, endpoint);
  await page.getByRole('button', { name: submitLabel, exact: true }).click();
  return result(await pending, 200);
}
async function amount(page, quantity) {
  await page.bringToFront();
  await expect(page.locator('main')).toContainText(new RegExp(`(?<![0-9])${quantity}(?:\\s|망)`), { timeout: 20_000 });
}
let draft, work, access, team, remote, current, storyboard, home;
const workers = [], briefs = [], packages = {};
const runSuffix = Date.now().toString(36);
function safeError(error) {
  let message = String(error.message);
  for (const secret of [access?.pin, access?.management_url, team?.join_url, process.env.LIVE_RESUME_PIN]) if (secret) message = message.split(secret).join('[REDACTED]');
  return message.replace(/(\/(?:team|w)\/)[^\s"'<>\\]+/g, '$1[REDACTED]');
}
try {
  if (process.env.LIVE_RESUME_TEAM_ID) {
    await stage('resume-existing-v1-test-team', async () => {
      await owner.goto(`${origin}/owner/manage/${process.env.LIVE_RESUME_TEAM_ID}`);
      await owner.getByLabel('PIN', { exact: true }).fill(process.env.LIVE_RESUME_PIN);
      const login = responseFor(owner, '/owner/team-session');
      await owner.getByRole('button', { name: '이 팀 열기', exact: true }).click();
      access = (await result(await login, 201)).team;
      work = await api(owner, `/api/v1/work-sessions/${process.env.LIVE_RESUME_SESSION_ID}`);
      assert.equal(work.current_version, 1); assert.equal(work.version.state.quantity.value, 15);
      await owner.goto(`${origin}/owner/work/${work.session_id}/review`);
    });
  } else {
  await stage('record-STT-structure', async () => {
    await owner.goto(`${origin}/owner/new`);
    await expect(owner.getByRole('button', { name: '녹음 시작', exact: true })).toBeVisible({ timeout: 30_000 });
    draft = await record(owner, 'evals/audio/01-clear-work-instruction.wav', '음성 제출', '/drafts/from-audio');
    assert.deepEqual(draft.state.steps.map(s => s.task_code), ['ONION_HARVEST', 'ONION_TRANSPORT']);
    assert.equal(draft.state.quantity.value, 20);
    assert.match(draft.state.location_display, /창고.*앞.*밭/);
    await expect(owner.getByRole('heading', { name: '제가 이렇게 이해했어요' })).toBeVisible();
    assert.equal((await api(owner, '/api/v1/work-sessions')).items.length, 0);
  });
  await stage('owner-corrects-before-publish', async () => {
    await owner.getByRole('button', { name: '수량 다시 말하기' }).click();
    const updated = await record(owner, 'evals/audio/02-quantity-change.wav', '수량 다시 확인', '/supplement');
    assert.equal(updated.state.quantity.value, 15);
    assert.deepEqual(updated.state.steps.map(s => s.task_code), draft.state.steps.map(s => s.task_code));
    draft = updated;
    await expect(owner.getByText('15망', { exact: true })).toBeVisible();
    assert.equal((await api(owner, '/api/v1/work-sessions')).items.length, 0);
  });
  await stage('owner-confirms-and-publishes-v1', async () => {
    if (await owner.getByLabel('그대로 전달하는 이유').count()) await owner.getByLabel('그대로 전달하는 이유').selectOption('IN_PERSON_BRIEFING');
    const pending = responseFor(owner, '/confirm');
    await owner.getByRole('button', { name: /^(확정하기|이대로 전달|현장에서 장소를 알려주고 전달)$/ }).click();
    const published = await result(await pending, 201);
    work = published.work_session; assert.equal(work.current_version, 1);
    await expect(owner.getByLabel('팀 PIN')).toBeVisible({ timeout: 15_000 });
    access = (await api(owner, '/api/v1/owner/session')).team;
    assert.equal(access.status, 'ACTIVE');
    assert.equal(work.version.state.quantity.value, 15);
  });
  }
  await stage('vi-ne-storyboards-video-and-TTS', async () => {
    for (const language of ['vi', 'ne']) {
      const pack = await api(owner, `/api/v1/brief?session_id=${work.session_id}&language_code=${language}`);
      packages[language] = pack;
      assert.equal(pack.version, 1); assert.equal(pack.language_code, language);
      assert.equal(pack.context.quantity.value, 15);
      assert.deepEqual(pack.steps.map(s => s.sequence), [1, 2]);
      assert.doesNotMatch(JSON.stringify(pack.steps) + JSON.stringify(pack.context), /[가-힣]/);
      assert.equal(pack.video.length, 1); assert.equal(pack.video[0].step_sequence, 1);
      assert.equal(pack.video[0].review_status, 'APPROVED'); assert.equal(pack.video[0].safety_level, 'LOW');
      assert.ok(pack.tts.audio_url, `${language} provider TTS missing`);
      const page = await ownerContext.newPage(); briefs.push(page);
      await page.goto(`${origin}/owner/work/${work.session_id}/brief?lang=${language}`);
      await amount(page, 15);
      await expect(page.locator('video')).toBeVisible();
      await page.locator('video').evaluate(video => video.play());
      await expect.poll(() => page.locator('video').evaluate(video => video.currentTime), { timeout: 20_000 }).toBeGreaterThan(0);
      const audio = await page.evaluate(async url => {
        const audio = new Audio(url); await audio.play();
        return new Promise(resolve => audio.addEventListener('timeupdate', () => { audio.pause(); resolve({ duration: audio.duration, time: audio.currentTime }); }, { once: true }));
      }, pack.tts.audio_url);
      assert.ok(audio.duration > 0 && audio.time > 0);
      await page.getByRole('button', { name: language === 'vi' ? 'Tiếp' : 'अर्को', exact: true }).click();
      await expect(page.locator('video')).toHaveCount(0);
      await expect(page.getByText(language === 'vi' ? 'Không có video đã kiểm duyệt. Hãy đọc hoặc nghe hướng dẫn.' : 'जाँच गरिएको भिडियो छैन। निर्देशन पढ्नुहोस् वा सुन्नुहोस्।', { exact: true })).toBeVisible();
    }
  });
  await stage('remote-link-and-team-QR-access', async () => {
    await owner.bringToFront();
    await expect(owner.getByRole('heading', { name: '작업 전달하기' })).toBeVisible();
    const deliveryChoice = owner.getByRole('button', { name: /언어별 링크 보내기/ });
    if (await deliveryChoice.count()) await deliveryChoice.click();
    const issued = responseFor(owner, '/worker-links');
    await owner.getByRole('button', { name: '베트남어 링크 만들기' }).click();
    const links = await result(await issued, 201);
    const remoteContext = await browser.newContext(); remote = await remoteContext.newPage();
    await remote.goto(links.issued_worker_links[0].url); await amount(remote, 15);
    await owner.goto(`${origin}/owner/team`);
    await expect(owner.getByRole('img', { name: '오늘 작업팀 참여 QR 코드' })).toBeVisible();
    team = await api(owner, '/api/v1/work-teams/today');
    await owner.addScriptTag({ content: await readFile('node_modules/qr-scanner/qr-scanner.umd.min.js', 'utf8') });
    const decoded = await owner.getByRole('img', { name: '오늘 작업팀 참여 QR 코드' }).evaluate(async (svg, workerCode) => {
      const moduleUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      const imageUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      const engine = (await import(moduleUrl)).createWorker();
      try { return (await window.QrScanner.scanImage(imageUrl, { qrEngine: engine, returnDetailedScanResult: true })).data; }
      finally { engine.terminate(); URL.revokeObjectURL(moduleUrl); URL.revokeObjectURL(imageUrl); }
    }, await readFile('node_modules/qr-scanner/qr-scanner-worker.min.js', 'utf8'));
    assert.equal(decoded, team.join_url, 'rendered QR must encode the actual team URL');
    for (const [language, baseName] of [['vi', 'E2E-Lan'], ['ne', 'E2E-Sita']]) {
      const name = `${baseName}-${runSuffix}`;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(); await page.goto(team.join_url);
      await page.getByRole('button', { name: language === 'vi' ? 'Tiếng Việt' : 'नेपाली', exact: true }).click();
      await page.locator('#worker-name').fill(name);
      const pending = responseFor(page, '/join');
      await page.getByRole('button', { name: language === 'vi' ? 'Tham gia nhóm hôm nay' : 'आजको टोलीमा सामेल', exact: true }).click();
      // Join performs a full navigation, so Chrome can evict its response body.
      assert.equal((await pending).status(), 201);
      await page.waitForURL('**/worker/my');
      const member = (await api(owner, '/api/v1/work-teams/today')).members.find(member => member.display_name === name);
      assert.ok(member);
      assert.equal((await api(page, '/api/v1/work-team-members/me/assignments')).assignments.length, 0);
      workers.push({ page, language, name, member });
    }
  });
  await stage('individual-assignment-notification-explicit-ack', async () => {
    for (const worker of workers) {
      await owner.bringToFront();
      const select = owner.getByLabel(`${worker.name} 작업 선택`);
      await expect(select).toBeVisible({ timeout: 20_000 });
      await select.selectOption(work.session_id);
      const row = owner.getByRole('listitem').filter({ has: select });
      await row.getByRole('button', { name: '이 작업 배정' }).click();
      await amount(worker.page, 15);
      const ack = worker.page.getByRole('button', { name: worker.language === 'vi' ? 'Tôi đã hiểu hướng dẫn' : 'मैले निर्देशन बुझें', exact: true });
      await expect(ack).toBeVisible();
      await expect(row.getByText('미확인', { exact: true })).toBeVisible({ timeout: 15_000 });
      const pending = responseFor(worker.page, '/acknowledgement'); await ack.click();
      assert.equal((await result(await pending, 200)).acknowledged_version, 1);
      await owner.bringToFront(); await expect(row.getByText('확인함', { exact: true })).toBeVisible({ timeout: 20_000 });
      if (worker === workers[0]) assert.equal((await api(workers[1].page, '/api/v1/work-team-members/me/assignments')).assignments.length, 0, 'unassigned worker must not receive another worker\'s task');
    }
  });
  await stage('open-boards-before-quantity-change', async () => {
    current = await ownerContext.newPage(); storyboard = await ownerContext.newPage(); home = await ownerContext.newPage();
    for (const [page, path] of [[current, `/owner/work/${work.session_id}`], [storyboard, `/owner/work/${work.session_id}/review`], [home, '/owner/home']]) {
      await page.goto(origin + path); await amount(page, 15);
    }
  });
  await stage('quantity-preview-does-not-publish', async () => {
    const editor = await ownerContext.newPage(); await editor.goto(`${origin}/owner/work/${work.session_id}/change`);
    const preview = await record(editor, changeAudio, '변경 내용 확인', '/quantity-changes/from-audio');
    assert.equal(preview.quantity.value, 10); assert.equal(preview.expected_version, 1);
    assert.equal((await api(owner, `/api/v1/work-sessions/${work.session_id}`)).current_version, 1);
    const pending = responseFor(editor, '/quantity-changes/confirm');
    await editor.getByRole('button', { name: '이 수량으로 변경' }).click();
    assert.equal((await result(await pending, 201)).current_version, 2);
  });
  await stage('all-open-boards-latest-version-and-reack', async () => {
    // Each assertion checks existing pages without reload/navigation or cache injection.
    for (const page of [remote, ...briefs, ...workers.map(w => w.page), current, home]) await amount(page, 10);
    await storyboard.bringToFront(); await expect(storyboard.getByRole('status')).toContainText('작업 변경 반영', { timeout: 20_000 });
    await amount(owner, 10); await expect(owner.getByText('변경 확인 필요', { exact: true })).toHaveCount(2, { timeout: 20_000 });
    for (const worker of workers) {
      const state = await api(worker.page, '/api/v1/work-team-members/me/assignments');
      assert.equal(state.assignments[0].version, 2); assert.equal(state.receipts[0].acknowledged_version, 1);
      assert.equal(state.assignments[0].context.quantity.value, 10);
      assert.notEqual(state.assignments[0].tts.text_hash, packages[worker.language].tts.text_hash);
      assert.ok(state.assignments[0].tts.audio_url);
      const pending = responseFor(worker.page, '/acknowledgement');
      await worker.page.getByRole('button', { name: worker.language === 'vi' ? 'Tôi đã hiểu hướng dẫn' : 'मैले निर्देशन बुझें', exact: true }).click();
      assert.equal((await result(await pending, 200)).acknowledged_version, 2);
      await worker.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await worker.page.screenshot({ path: `${output}/worker-${worker.language}-confirmed-v2.png`, fullPage: true });
    }
    await owner.bringToFront(); await expect(owner.getByText('확인함', { exact: true })).toHaveCount(2, { timeout: 20_000 });
    const latestTeam = await api(owner, '/api/v1/work-teams/today');
    assert.equal(latestTeam.join_url, team.join_url); assert.equal(latestTeam.expires_at, team.expires_at);
    assert.equal((await api(owner, '/api/v1/owner/session')).team.pin, access.pin);
  });
  console.log(JSON.stringify({ live_workflow: 'PASS', session_id: work.session_id, output }));
} catch (error) {
  // Never persist PIN, cookies, invite tokens or response bodies in screenshots.
  console.error(safeError(error)); process.exitCode = 1;
} finally {
  await writeFile(`${output}/inputs.json`, JSON.stringify({ synthetic: true, provider: 'Windows System.Speech', voice: 'Microsoft Heami Desktop', change_transcript: '열다섯 망 말고 열 망으로 해.', change_sha256: createHash('sha256').update(await readFile(changeAudio)).digest('hex'), origin, session_id: work?.session_id, team_id: access?.team_id }, null, 2));
  await browser.close();
}
