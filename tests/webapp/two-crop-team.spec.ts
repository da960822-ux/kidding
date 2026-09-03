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
  await page.getByRole('button', { name: /STRAWBERRY/ }).click();
  await expect(page.getByText(/STRAWBERRY/)).toBeVisible();
  const oldTts = await page.getByText(/TTS: FALLBACK/).textContent();
  await page.evaluate(() => {
    const sessions = JSON.parse(localStorage.getItem('batmeori-demo-sessions')!);
    const strawberry = sessions.find((session: { session_id: string }) => session.session_id === 'work-demo-strawberry');
    strawberry.current_version = 2; strawberry.version.version = 2; strawberry.version.state.quantity = { value: 15, unit: '망' };
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify(sessions));
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: /v2 · STRAWBERRY/ })).toBeVisible();
  await expect(page.getByText(/15 망/)).toBeVisible();
  await expect(page.getByText(/TTS: FALLBACK/).textContent()).not.toBe(oldTts);
});

test('storyboard refresh announces and visualizes a newer version', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('batmeori-demo-session', JSON.stringify(value)), ownerSession);
  await page.goto('/owner/work/work-demo-01/review');
  await expect(page.getByText('v1', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('batmeori-demo-session')!);
    session.current_version = 2; session.version.version = 2; session.version.state.quantity = { value: 15, unit: '망' };
    localStorage.setItem('batmeori-demo-session', JSON.stringify(session));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('status')).toContainText('작업 변경 반영');
  await expect(page.getByText('v1에서 v2 · 20망에서 15망')).toBeVisible();
});

test('owner can select each published work for a team member', async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem('batmeori-demo-session', JSON.stringify(value.session));
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify(value.sessions));
    localStorage.setItem('batmeori-demo-today-team', JSON.stringify(value.team));
  }, { session: ownerSession, sessions: [ownerSession, strawberrySession], team: { ...team, members: [{ ...team.members[0], assignment_session_ids: ['work-demo-01', 'work-demo-strawberry'] }] } });
  await page.goto('/owner/team');
  const select = page.getByLabel('Nguyễn 작업 선택');
  await expect(select).toContainText('양파 수확 · v1');
  await expect(select).toContainText('딸기 수확 · v1');
});

test('legacy worker briefing is read-only', async ({ page }) => {
  await page.goto('/w/demo-legacy-token');
  await expect(page.getByRole('heading', { name: '기존 작업 표시' })).toBeVisible();
  await expect(page.getByText('v1 · 읽기 전용')).toBeVisible();
});
