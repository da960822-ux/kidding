import { expect, test, type Page } from '@playwright/test';

const teamToken = `team-${'a'.repeat(32)}`;
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
  await page.getByRole('button', { name: '원음 다시 듣기' }).click();
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
  await page.getByLabel('팀 참여 링크 또는 코드').fill(teamToken);
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByLabel('이름 또는 별명').fill('Nguyễn');
  await page.getByRole('button', { name: 'नेपाली' }).click();
  await page.getByRole('button', { name: '오늘 작업팀 들어가기' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('batmeori-demo-today-team')!).members[0].language_code)).toBe('ne');
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

test('remote briefing renders schema v2 DTO', async ({ page }) => {
  await page.goto('/w/demo-vi-token');
  await expect(page.getByText('Công việc mới nhất')).toBeVisible();
  await expect(page.getByText(/TTS: FALLBACK/)).toBeVisible();
});

test('team member sees only explicitly assigned work', async ({ page }) => {
  await seededWorker(page);
  await page.goto('/worker/my');
  await expect(page.getByRole('heading', { name: 'Thu hoạch hành' })).toBeVisible();
  await expect(page.getByLabel('assigned work')).toBeHidden();
  await expect(page.getByText(/STRAWBERRY/)).toBeHidden();
});

test('team member switches both explicitly assigned crops and refreshes regenerated quantity', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem('batmeori-demo-session', JSON.stringify(value.session));
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify([value.session, value.strawberry]));
    localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value.team));
    localStorage.setItem('batmeori-demo-today-team-member', 'member-id');
  }, { session: ownerSession, strawberry: strawberrySession, team: { ...team, members: [{ ...team.members[0], assignment_session_ids: ['work-demo-01', 'work-demo-strawberry'] }] } });
  await page.goto('/worker/my');
  await expect(page.getByLabel('assigned work')).toBeVisible();
  await page.getByRole('button', { name: /Thu hoạch dâu tây/ }).click();
  await expect(page.getByRole('heading', { name: 'Thu hoạch dâu tây' })).toBeVisible();
  const oldTts = await page.getByText(/TTS: FALLBACK/).textContent();
  await page.evaluate(() => {
    const sessions = JSON.parse(localStorage.getItem('batmeori-demo-sessions')!);
    const strawberry = sessions.find((session: { session_id: string }) => session.session_id === 'work-demo-strawberry');
    strawberry.current_version = 2; strawberry.version.version = 2; strawberry.version.state.quantity = { value: 15, unit: '망' };
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify(sessions));
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: /Thu hoạch dâu tây · Ruộng dâu số 2/ })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Có hướng dẫn mới');
  await expect(page.getByText(/15 망/)).toBeVisible();
  await expect.poll(() => page.getByText(/TTS: FALLBACK/).textContent()).not.toBe(oldTts);
});

test('storyboard refresh announces and visualizes a newer version', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-session', JSON.stringify(value)), ownerSession);
  await page.goto('/owner/work/work-demo-01/review');
  await expect(page.getByText('최신 내용', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: '기존 작업 표시' })).toBeVisible();
  await expect(page.getByText('Hướng dẫn cũ · chỉ xem')).toBeVisible();
});
