import { expect, test } from '@playwright/test';

test('the start page opens an existing team through its saved management link and PIN', async ({ page }) => {
  await page.goto('/start');
  const access = await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    await api.confirmDraft(draft.draft_id, 'CONFIRM');
    const team = (await api.getOwnerSession()).team!;
    await api.deleteOwnerSession();
    return { url: team.management_url!, pin: team.pin! };
  });
  await page.getByRole('button', { name: '기존 작업팀 들어가기', exact: true }).click();
  await page.getByLabel('관리 링크', { exact: true }).fill('https://example.com/owner/manage/not-a-team');
  await page.getByRole('button', { name: '관리 링크로 계속', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('batmeori-demo-owner-session'))).toBeNull();
  await page.getByLabel('관리 링크', { exact: true }).fill(access.url);
  await page.getByRole('button', { name: '관리 링크로 계속', exact: true }).click();
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible();
  await page.getByLabel('PIN', { exact: true }).fill(access.pin);
  await page.getByRole('button', { name: '이 팀 열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '오늘 작업팀', exact: true })).toBeVisible();
});

test('logout remains available after starting again in the same page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await expect(page.getByRole('heading', { name: '평소 말투 그대로 말씀하세요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeEnabled();
});

test('returning from existing-team entry still permits a fresh owner start', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: '기존 작업팀 들어가기', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('관리 링크', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('batmeori-demo-owner-session'))).toBeNull();
  await page.goBack();
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await expect(page.getByRole('heading', { name: '평소 말투 그대로 말씀하세요' })).toBeVisible();
});

test('a delayed draft response cannot navigate away from the home the owner selected', async ({ page }) => {
  await page.goto('/owner/new');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const create = api.createDraft;
    api.createDraft = async (...args) => {
      const pending = create(...args);
      await new Promise<void>((resolve) => window.addEventListener('release-draft', () => resolve(), { once: true }));
      const result = await pending;
      window.dispatchEvent(new Event('draft-finished'));
      return result;
    };
  });
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '홈', exact: true }).last().click();
  await expect(page).toHaveURL(/\/owner\/home$/);
  await page.evaluate(async () => {
    const finished = new Promise<void>((resolve) => window.addEventListener('draft-finished', () => resolve(), { once: true }));
    window.dispatchEvent(new Event('release-draft')); await finished;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page).toHaveURL(/\/owner\/home$/);
  expect(await page.evaluate(() => sessionStorage.getItem('batmeori-owner-draft-id'))).toBeNull();
});

test('temporary draft read failure retains its ID and can retry the same draft', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    sessionStorage.setItem('batmeori-owner-draft-id', draft.draft_id);
    const read = api.getDraft; let failed = false;
    api.getDraft = async (...args) => { if (!failed) { failed = true; throw new ApiError(503, 'PROVIDER_UNAVAILABLE', '잠시 후 다시 시도해주세요.'); } return read(...args); };
    history.pushState({}, '', '/owner/draft/interpret'); window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: '다시 연결', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('batmeori-owner-draft-id'))).toBe('draft-demo-01');
  await page.getByRole('button', { name: '다시 연결', exact: true }).click();
  await expect(page.getByRole('button', { name: '확정하기', exact: true })).toBeVisible();
});

test('reauthenticating the same team preserves the recoverable draft', async ({ page }) => {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await expect(page.getByRole('heading', { name: '작업 전달하기', exact: true })).toBeVisible();
  const pin = await page.evaluate(async () => (await (await import('/src/webapp/api.ts')).api.getOwnerSession()).team!.pin!);
  await page.getByRole('button', { name: '홈', exact: true }).last().click();
  await page.getByRole('button', { name: /새 작업 지시하기/ }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page.getByRole('button', { name: '확정하기', exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('batmeori-demo-owner-session'); window.dispatchEvent(new CustomEvent('batmeori:owner-unauthorized')); });
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('batmeori-owner-draft-id'))).toBe('draft-demo-01');
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByRole('button', { name: '이 팀 열기', exact: true }).click();
  await expect(page.getByRole('button', { name: '확정하기', exact: true })).toBeVisible();
});

test('a slow detail read displays loading instead of a failed work', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    const work = (await api.confirmDraft(draft.draft_id, 'CONFIRM')).work_session;
    const read = api.getSession;
    api.getSession = async (...args) => {
      await new Promise<void>((resolve) => window.addEventListener('release-work', () => resolve(), { once: true }));
      return read(...args);
    };
    history.pushState({}, '', `/owner/work/${work.session_id}`); window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('status')).toContainText('작업을 불러오고 있어요');
  await expect(page.getByRole('heading', { name: '작업을 불러오지 못했어요' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('release-work')));
  await expect(page.getByRole('heading', { name: '진행 중 작업', exact: true })).toBeVisible();
});
