import { expect, test, type Page } from '@playwright/test';

const teamToken = `team-${'a'.repeat(32)}`;
const ownerAuth = { authenticated: true, expires_at: new Date(Date.now() + 60 * 60_000).toISOString(), farm: { code: 'farm-demo', display_name: '밭머리 데모 농장' }, team: { team_id: 'team-id', status: 'ACTIVE', expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), management_url: 'http://127.0.0.1:4186/owner/manage/team-id', pin: '123456' } };
const team = {
  team_id: 'team-id', work_date: '2026-09-03', status: 'ACTIVE', join_url: `http://127.0.0.1:5173/team/${teamToken}`, expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(), members: [{ member_id: 'member-id', display_name: 'Nguyễn', language_code: 'vi', joined_at: '2026-09-03T00:00:00.000Z', assignment_session_ids: ['work-demo-01'] }],
};

const ownerSession = {
  session_id: 'work-demo-01', current_version: 1, contract_version: 'structure-v2', ontology_version: 'ontology-v2', lifecycle: 'PUBLISHED',
  version: { version: 1, lifecycle: 'PUBLISHED', state: { task_family: 'ONION', location_display: '1번 밭', quantity: { value: 20, unit: '망' }, deadline: null, safety: [], notes: null, steps: [{ sequence: 1, task_code: 'ONION_HARVEST', title_ko: '양파 수확', description_ko: '양파를 수확합니다.', video: null, audio_url: null, delivery_mode: 'TEXT_TTS', unsupported_reason: null, translations: [] }] } },
};

const strawberrySession = {
  ...ownerSession, session_id: 'work-demo-strawberry',
  version: { ...ownerSession.version, state: { ...ownerSession.version.state, task_family: 'STRAWBERRY', steps: [{ ...ownerSession.version.state.steps[0], task_code: 'STRAWBERRY_HARVEST', title_ko: '딸기 수확', description_ko: '딸기를 수확합니다.' }] } },
};

async function seededWorker(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem('batmeori-demo-session', JSON.stringify(value.session));
    localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value.team));
    localStorage.setItem('batmeori-demo-today-team-member', 'member-id');
  }, { team, session: ownerSession });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-owner-session', JSON.stringify(value)), ownerAuth);
});

test('owner starts without farm credentials and logs out', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/start');
  await page.evaluate(() => localStorage.removeItem('batmeori-demo-owner-session'));
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await expect(page.getByRole('heading', { name: '평소 말투 그대로 말씀하세요' })).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  await expect(page.getByText('farm-demo', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/start$/);
});

test('lost owner authorization requires explicit recovery without creating a team', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/owner/team');
  await expect(page.getByRole('heading', { name: '오늘 작업팀', exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('batmeori-demo-owner-session'); window.dispatchEvent(new Event('batmeori:owner-unauthorized')); });
  await expect(page.getByRole('heading', { name: '팀 관리 다시 열기' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('batmeori-demo-owner-session'))).toBeNull();
  await expect(page.getByRole('button', { name: '새 팀으로 시작' })).toBeVisible();
});

test('explicit new team clears the prior work route', async ({ page }) => {
  await page.goto('/owner/work/work-demo-01');
  await expect(page.getByText('24시간 작업팀').first()).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('batmeori-demo-owner-session'); window.dispatchEvent(new Event('batmeori:owner-unauthorized')); });
  await page.getByRole('button', { name: '새 팀으로 시작' }).click();
  await expect(page).toHaveURL(/\/owner\/new$/);
  await expect(page.getByRole('heading', { name: '평소 말투 그대로 말씀하세요' })).toBeVisible();
});

test('mobile current-work navigation falls back to home until a work is loaded', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/owner/team');
  await page.getByRole('button', { name: '진행 중 작업' }).click();
  await expect(page).toHaveURL(/\/owner\/home$/);
  await expect(page.getByRole('heading', { name: '오늘 어떤 작업을 시킬까요?' })).toBeVisible();
});

test('owner session server failure stays distinct from login and can retry', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(() => {
    localStorage.setItem('batmeori-demo-owner-session', '{broken');
    history.pushState({}, '', '/owner/home');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: '농장 연결을 확인할 수 없어요' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '농장주 로그인' })).toBeHidden();
  await page.evaluate((value) => localStorage.setItem('batmeori-demo-owner-session', JSON.stringify(value)), ownerAuth);
  await page.getByRole('button', { name: '다시 연결' }).click();
  await expect(page.getByRole('heading', { name: '오늘 어떤 작업을 시킬까요?' })).toBeVisible();
});

test('logo returns to the homepage without adding a hash', async ({ page }) => {
  await page.goto('/#faq');
  await page.getByRole('link', { name: '밭머리 홈' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
});

test('language selector shows a bilingual label and supported language self-names', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  const selector = page.getByRole('combobox', { name: '언어 / Language' });
  await expect(selector.locator('option')).toHaveText(['한국어', 'Tiếng Việt', 'नेपाली']);
  await selector.selectOption('vi');
  await expect(selector).toHaveValue('vi');
  await expect.poll(() => page.evaluate(() => document.querySelector('header')!.scrollWidth <= window.innerWidth)).toBe(true);
});

test('review replays the original recording', async ({ page }) => {
  await page.addInitScript(() => {
    const createObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => { if (object instanceof Blob) Object.defineProperty(window, '__lastAudioBlob', { configurable: true, value: object }); return createObjectUrl(object); };
    const stream = { getTracks: () => [{ stop() {} }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
      createAnalyser() { return { fftSize: 32, getByteTimeDomainData(data: Uint8Array) { data.fill(128); } }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    } });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: class {
      state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: ((event: BlobEvent) => void) | null = null; onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.(new BlobEvent('dataavailable', { data: new Blob(['original-audio'], { type: this.mimeType }) })); this.onstop?.(); }
    } });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '녹음 시작' }).click();
  await page.getByRole('button', { name: '그만 말하기' }).click();
  await page.getByRole('button', { name: '음성 제출' }).click();
  await page.getByRole('button', { name: '원음 듣기' }).click();
  await expect.poll(() => page.evaluate(async () => (window as unknown as { __lastAudioBlob?: Blob }).__lastAudioBlob?.text())).toBe('original-audio');
});

test('owner can re-record only quantity before confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    const stream = { getTracks: () => [{ stop() {} }] } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async (constraints: MediaStreamConstraints) => { Object.defineProperty(window, '__audioConstraints', { configurable: true, value: constraints.audio }); return stream; } } });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
      createAnalyser() { return { fftSize: 32, getByteTimeDomainData(data: Uint8Array) { data.fill(128); } }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    } });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: class {
      state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: ((event: BlobEvent) => void) | null = null; onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.(new BlobEvent('dataavailable', { data: new Blob(['quantity-correction'], { type: this.mimeType }) })); this.onstop?.(); }
    } });
  });
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '녹음 시작' }).click();
  await page.getByRole('button', { name: '그만 말하기' }).click();
  await page.getByRole('button', { name: '음성 제출' }).click();
  await page.getByRole('button', { name: '수량 다시 말하기' }).click();
  await page.getByRole('button', { name: '녹음 시작' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __audioConstraints?: MediaTrackConstraints }).__audioConstraints)).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
  await page.getByRole('button', { name: '그만 말하기' }).click();
  await page.getByRole('button', { name: '수량 다시 확인' }).click();
  await expect(page.getByRole('status')).toContainText('수량을 다시 정리했어요');
  await expect(page.getByText('20망', { exact: true }).first()).toBeVisible();
});

test('QR join sends selected language', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value)), { ...team, members: [] });
  await page.goto(`/team/${teamToken}`);
  await page.getByRole('button', { name: 'नेपाली' }).click();
  await expect(page.getByRole('heading', { name: 'तपाईंको नाम लेख्नुहोस्' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('ne');
  await page.getByLabel('नाम वा उपनाम').fill('Nguyễn');
  await page.getByRole('button', { name: 'आजको टोलीमा सामेल' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('batmeori-demo-today-team')!).members[0].language_code)).toBe('ne');
});

test('expired today-team QR asks for a newly issued QR', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value)), { ...team, expires_at: new Date(Date.now() - 1_000).toISOString(), members: [] });
  await page.goto(`/team/${teamToken}`);
  await page.getByLabel('Tên hoặc biệt danh').fill('Nguyễn');
  await page.getByRole('button', { name: 'Tham gia nhóm hôm nay' }).click();
  await expect(page.getByRole('alert')).toContainText('Mã đã hết hạn');
});

test('QR camera opens without native BarcodeDetector', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const FakeMediaStream = class { getTracks() { return []; } getVideoTracks() { return []; } };
    Object.defineProperty(window, 'MediaStream', { configurable: true, value: FakeMediaStream });
    const stream = new FakeMediaStream() as unknown as MediaStream;
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return (this as HTMLMediaElement & { __stream?: MediaStream }).__stream ?? null; }, set(value) { (this as HTMLMediaElement & { __stream?: MediaStream }).__stream = value as MediaStream; } });
    Object.defineProperty(window, '__cameraConstraints', { configurable: true, writable: true, value: null });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async (constraints: MediaStreamConstraints) => { (window as unknown as { __cameraConstraints: MediaStreamConstraints }).__cameraConstraints = constraints; return stream; },
      enumerateDevices: async () => [],
    } });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto('/worker');
  await page.getByRole('button', { name: 'QR 코드 스캔' }).click();
  await expect(page.getByLabel('QR 코드 스캔')).toBeVisible();
  await expect(page.getByRole('button', { name: '카메라 닫기' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cameraConstraints: MediaStreamConstraints }).__cameraConstraints)).toEqual({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  await expect(page.getByRole('alert')).toBeHidden();
});

test('QR camera falls back to another available device', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    const FakeMediaStream = class { getTracks() { return []; } getVideoTracks() { return []; } };
    Object.defineProperty(window, 'MediaStream', { configurable: true, value: FakeMediaStream });
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return (this as HTMLMediaElement & { __stream?: MediaStream }).__stream ?? null; }, set(value) { (this as HTMLMediaElement & { __stream?: MediaStream }).__stream = value as MediaStream; } });
    const stream = new FakeMediaStream() as unknown as MediaStream; const requests: MediaStreamConstraints[] = [];
    Object.defineProperty(window, '__cameraRequests', { configurable: true, value: requests });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async (constraints: MediaStreamConstraints) => { requests.push(constraints); if (requests.length < 3) throw new DOMException('Camera could not start', 'NotReadableError'); return stream; },
      enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'camera-a' }, { kind: 'videoinput', deviceId: 'camera-b' }],
    } });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto('/worker');
  await page.getByRole('button', { name: 'QR 코드 스캔' }).click();
  await expect(page.getByRole('button', { name: '카메라 닫기' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __cameraRequests: MediaStreamConstraints[] }).__cameraRequests)).toEqual([
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    { video: { deviceId: { exact: 'camera-a' } }, audio: false },
    { video: { deviceId: { exact: 'camera-b' } }, audio: false },
  ]);
  await expect(page.getByRole('alert')).toBeHidden();
});

test('QR camera explains denied permission and offers retry', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); },
      enumerateDevices: async () => [],
    } });
  });
  await page.goto('/worker');
  await page.getByRole('button', { name: 'QR 코드 스캔' }).click();
  await expect(page.getByRole('alert')).toHaveText('카메라 권한이 꺼져 있습니다. 주소창의 카메라 권한을 허용해주세요.');
  await expect(page.getByRole('button', { name: '카메라 다시 시도' })).toBeVisible();
});

test('owner QR stays visible when secure polling omits the raw join URL', async ({ page }) => {
  await page.goto('/owner/team');
  await page.getByRole('button', { name: '오늘 작업팀 열기' }).click();
  await expect(page.getByRole('img', { name: '오늘 작업팀 참여 QR 코드' })).toBeVisible();
  await page.waitForTimeout(4500);
  await expect(page.getByRole('img', { name: '오늘 작업팀 참여 QR 코드' })).toBeVisible();
});

test('today-team QR restores after refresh and rotates only on explicit request', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value)), team);
  await page.goto('/owner/team');
  await expect(page.getByText(team.join_url, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(team.join_url, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 QR 발급' }).click();
  await page.getByRole('button', { name: '새 QR 발급 확인' }).click();
  await expect(page.getByRole('status')).toContainText('이전 QR은 사용할 수 없습니다');
  await expect(page.getByText(team.join_url, { exact: true })).toBeHidden();
});

test('confirmed work links to today-team assignment and is selected by default', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value)), team);
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await page.getByRole('button', { name: '오늘 작업팀에 배정' }).click();
  await expect(page.getByLabel('Nguyễn 작업 선택')).toHaveValue('work-demo-01');
});

test('remote briefing renders schema v2 DTO', async ({ page }) => {
  await page.goto('/w/demo-vi-token');
  await expect(page.getByText('Công việc mới nhất')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await expect(page.getByText('Mang ủng chống trượt.')).toHaveCount(0);
  await expect(page.getByText('NỘI DUNG DEMO').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xem từng bước' })).toBeVisible();
  await expect(page.getByText(/TTS:|AI_TRANSLATION|[a-f0-9]{32}/)).toBeHidden();
});

test('Nepali briefing is fully localized, complete, and fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/w/demo-ne-token');
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('ne');
  await expect(page.getByRole('listitem')).toHaveCount(4);
  await expect(page.getByText('नचिप्लिने बुट लगाउनुहोस्।')).toHaveCount(0);
  await expect(page.getByText('डेमो सामग्री').first()).toBeVisible();
  await expect(page.getByText('20 बोरा')).toBeVisible();
  const mainText = await page.locator('main').innerText();
  expect(mainText).not.toMatch(/[가-힣]/);
  expect(mainText).not.toMatch(/Ruộng|Thu hoạch|Mang|Trước|Ghi chú/);
  expect(mainText).not.toMatch(/TTS:|AI_TRANSLATION|[a-f0-9]{32}/);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'चरणहरू हेर्नुहोस्' }).click();
  const next = page.getByRole('button', { name: 'अर्को' });
  await next.click(); await next.click(); await next.click();
  await expect(page.getByRole('button', { name: 'काम सूचीमा फर्कनुहोस्' })).toBeVisible();
});

test('team member sees only explicitly assigned work', async ({ page }) => {
  await seededWorker(page);
  await page.goto('/worker/my');
  await expect(page.getByRole('heading', { name: 'Thu hoạch hành' })).toBeVisible();
  await expect(page.getByLabel('Công việc hôm nay')).toBeHidden();
  await expect(page.getByText(/STRAWBERRY/)).toBeHidden();
});

test('team member switches both explicitly assigned crops even when the previously viewed work has a newer version', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem('batmeori-demo-session', JSON.stringify(value.session));
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify([value.session, value.strawberry]));
    localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value.team));
    localStorage.setItem('batmeori-demo-today-team-member', 'member-id');
  }, { session: ownerSession, strawberry: strawberrySession, team: { ...team, members: [{ ...team.members[0], assignment_session_ids: ['work-demo-01', 'work-demo-strawberry'] }] } });
  await page.goto('/worker/my');
  await expect(page.getByLabel('Công việc hôm nay')).toBeVisible();
  await page.getByRole('button', { name: /Thu hoạch dâu tây/ }).click();
  await expect(page.getByRole('heading', { name: 'Thu hoạch dâu tây' })).toBeVisible();
  await page.evaluate(() => {
    const sessions = JSON.parse(localStorage.getItem('batmeori-demo-sessions')!);
    const strawberry = sessions.find((session: { session_id: string }) => session.session_id === 'work-demo-strawberry');
    strawberry.current_version = 2; strawberry.version.version = 2; strawberry.version.state.quantity = { value: 15, unit: '망' };
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify(sessions));
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: /Thu hoạch dâu tây · Ruộng dâu số 2/ })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Có hướng dẫn mới');
  await expect(page.getByText(/15 bao/)).toBeVisible();
  await expect(page.getByText(/TTS:|AI_TRANSLATION|[a-f0-9]{32}/)).toBeHidden();
  await page.getByRole('button', { name: /Thu hoạch hành · Ruộng hành số 1/ }).click();
  await expect(page.getByRole('heading', { name: 'Thu hoạch hành' })).toBeVisible();
});

test('owner can open every published work from the home list', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem('batmeori-demo-session', JSON.stringify(value.sessions[0]));
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify(value.sessions));
  }, { sessions: [ownerSession, strawberrySession] });
  await page.goto('/owner/home');
  await expect(page.getByText('양파 수확', { exact: true })).toBeVisible();
  await page.getByText('딸기 수확', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '진행 중 작업' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. 딸기 수확' })).toBeVisible();
});

test('storyboard refresh announces and visualizes a newer version', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-session', JSON.stringify(value)), ownerSession);
  await page.goto('/owner/work/work-demo-01/review');
  await expect(page.getByText('작업 확정 완료', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('batmeori-demo-session')!);
    session.current_version = 2; session.version.version = 2; session.version.state.quantity = { value: 15, unit: '망' };
    localStorage.setItem('batmeori-demo-session', JSON.stringify(session));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('status')).toContainText('작업 변경 반영');
  await expect(page.getByText('수량이 20망에서 15망으로 변경됐습니다.')).toBeVisible();
});

test('owner can select each published work for a team member', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem('batmeori-demo-session', JSON.stringify(value.session));
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify(value.sessions));
    localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value.team));
  }, { session: ownerSession, sessions: [ownerSession, strawberrySession], team: { ...team, members: [{ ...team.members[0], assignment_session_ids: ['work-demo-01', 'work-demo-strawberry'] }] } });
  await page.goto('/owner/team');
  const select = page.getByLabel('Nguyễn 작업 선택');
  await expect(select).toContainText('양파 수확 · 1번 밭 · 20망');
  await expect(select).toContainText('딸기 수확 · 1번 밭 · 20망');
});

test('legacy worker briefing is read-only', async ({ page }) => {
  await page.goto('/w/demo-legacy-token');
  await expect(page.getByRole('heading', { name: 'Hướng dẫn công việc cũ' })).toBeVisible();
  await expect(page.getByText('Chỉ xem')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/[가-힣]/);
});
