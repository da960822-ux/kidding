import { expect, test, type Page } from '@playwright/test';

async function openOwnerTeamWithMember(page: Page, displayName: string) {
  await page.goto('/start');
  await page.evaluate(async (name) => {
    const { api } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    await api.confirmDraft(draft.draft_id, 'CONFIRM');
    const team = await api.getTodayTeam();
    await api.joinTodayTeam(team.join_url!.split('/').pop()!, { display_name: name, language_code: 'vi' });
    history.pushState({}, '', '/owner/team'); dispatchEvent(new PopStateEvent('popstate'));
  }, displayName);
  await expect(page.getByText(displayName, { exact: true })).toBeVisible();
  await expect(page.getByLabel(`${displayName} 작업 선택`)).toBeEnabled();
}

test('owner starts without credentials and receives reusable team access after first confirmation', async ({ page }) => {
  test.slow();
  await page.goto('/start');
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await expect(page.getByRole('heading', { name: '평소 말투 그대로 말씀하세요' })).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await page.getByRole('button', { name: '홈', exact: true }).click();
  await expect(page.getByLabel('팀 PIN')).toBeHidden();
  await page.getByText('팀 관리 정보', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '이 팀 다시 열기' })).toBeVisible();
  await expect(page.getByLabel('팀 PIN')).toHaveText(/^\d{6}$/);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('team-access-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('team-access-mobile.png'), fullPage: true });
  const link = await page.getByRole('link', { name: /관리 링크/ }).getAttribute('href');
  const pin = await page.getByLabel('팀 PIN').innerText();
  await page.reload();
  await expect(page.getByLabel('팀 PIN')).toBeHidden();
  await page.getByText('팀 관리 정보', { exact: true }).click();
  await expect(page.getByLabel('팀 PIN')).toHaveText(pin);
  await page.evaluate(() => localStorage.removeItem('batmeori-demo-owner-session'));
  await page.goto(link!);
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible();
  await expect(page.getByLabel('농장 코드')).toHaveCount(0);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByRole('button', { name: '이 팀 열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '오늘 작업팀', exact: true })).toBeVisible();
});

test('expired management link never silently starts another team', async ({ page }) => {
  await page.goto('/owner/manage/expired-team');
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible();
  await page.getByLabel('PIN', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '이 팀 열기', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('batmeori-demo-owner-session'))).toBeNull();
  await expect(page.getByRole('button', { name: '새 팀으로 시작' })).toBeVisible();
});

test('owner can speak a new instruction for one member without selecting an existing team work', async ({ page }) => {
  await openOwnerTeamWithMember(page, 'Lan');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('batmeori-demo-today-team')!).members[0].assignment_session_ids.length);

  await page.getByRole('button', { name: 'Lan 개인 지시 말하기' }).click();
  await expect(page.getByRole('heading', { name: 'Lan님에게 새 개인 지시' })).toBeVisible();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page.getByText('Lan님에게 따로 전달할 내용인지 확인해주세요.')).toBeVisible();
  await page.getByRole('button', { name: 'Lan님에게 배정' }).click();

  await expect(page).toHaveURL(/\/owner\/team$/);
  await expect(page.getByRole('status')).toContainText('Lan님에게 개인 지시를 배정했습니다.');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('batmeori-demo-today-team')!).members[0].assignment_session_ids.length)).toBe(before + 1);
});

test('personal instruction publish is retained when the member assignment fails', async ({ page }) => {
  await openOwnerTeamWithMember(page, 'Mai');
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    api.assignTodayTeamMember = () => Promise.reject(new ApiError(503, 'PROVIDER_UNAVAILABLE', '배정 실패'));
  });

  await page.getByRole('button', { name: 'Mai 개인 지시 말하기' }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: 'Mai님에게 배정' }).click();

  await expect(page).toHaveURL(/\/owner\/team$/);
  await expect(page.getByRole('alert')).toContainText('새 개인 지시는 저장했지만 Mai님에게 배정하지 못했습니다.');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('batmeori-demo-sessions')!).length)).toBe(2);
  await expect(page.getByLabel('Mai 작업 선택').locator('option')).toHaveCount(3);
});

test('background refresh failure keeps the cached work list assignable without duplicate alerts', async ({ page }) => {
  await openOwnerTeamWithMember(page, 'Lan');
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    api.listSessions = () => Promise.reject(new ApiError(503, 'PROVIDER_UNAVAILABLE', '요청을 처리하지 못했습니다. 다시 시도해주세요.'));
    api.getTodayTeam = () => Promise.reject(new ApiError(503, 'PROVIDER_UNAVAILABLE', '요청을 처리하지 못했습니다. 다시 시도해주세요.'));
    dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('기존 목록으로 계속 배정할 수 있습니다.');
  await expect(page.getByLabel('Lan 작업 선택')).toBeEnabled();
  await expect(page.getByRole('button', { name: '이 작업 배정' })).toBeEnabled();
});

test('initial work-list failure keeps the current known work assignable', async ({ page }) => {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await expect(page.getByText('작업 확정 완료', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    const team = await api.getTodayTeam();
    await api.joinTodayTeam(team.join_url!.split('/').pop()!, { display_name: 'Min', language_code: 'vi' });
    api.listSessions = () => Promise.reject(new ApiError(503, 'PROVIDER_UNAVAILABLE', '요청을 처리하지 못했습니다. 다시 시도해주세요.'));
    history.pushState({}, '', '/owner/team'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('Min', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Min 작업 선택')).toBeEnabled();
  await expect(page.getByRole('button', { name: '이 작업 배정' })).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('기존 목록으로 계속 배정할 수 있습니다.');
});

test('timeout before commit retries the same assignment before roster reconciliation', async ({ page }) => {
  await openOwnerTeamWithMember(page, 'Mai');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const assign = api.assignTodayTeamMember;
    (window as typeof window & { assignmentCalls?: number }).assignmentCalls = 0;
    api.assignTodayTeamMember = async (...args) => {
      const state = window as typeof window & { assignmentCalls?: number };
      state.assignmentCalls = (state.assignmentCalls ?? 0) + 1;
      if (state.assignmentCalls === 1) {
        window.setTimeout(() => { void assign(...args); }, 400);
        throw new DOMException('Response timed out before commit', 'TimeoutError');
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      return assign(...args);
    };
  });
  await page.getByRole('button', { name: '이 작업 배정' }).click();
  await expect(page.getByRole('status')).toContainText('배정했습니다.');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { assignmentCalls?: number }).assignmentCalls)).toBe(2);
  await expect(page.getByRole('button', { name: '배정됨' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('assignment 4xx is not retried or cleared by roster polling', async ({ page }) => {
  await openOwnerTeamWithMember(page, 'An');
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    (window as typeof window & { assignmentCalls?: number }).assignmentCalls = 0;
    api.assignTodayTeamMember = async () => {
      const state = window as typeof window & { assignmentCalls?: number };
      state.assignmentCalls = (state.assignmentCalls ?? 0) + 1;
      throw new ApiError(422, 'SCHEMA_INVALID', '배정할 수 없는 작업입니다.');
    };
  });
  await page.getByRole('button', { name: '이 작업 배정' }).click();
  await expect(page.getByRole('alert')).toContainText('배정할 수 없는 작업입니다.');
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await page.waitForTimeout(500);
  await expect(page.getByRole('alert')).toContainText('배정할 수 없는 작업입니다.');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { assignmentCalls?: number }).assignmentCalls)).toBe(1);
});

test('assignment failure waits for both retries and the final roster check', async ({ page }) => {
  await openOwnerTeamWithMember(page, 'Hoa');
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    const getTeam = api.getTodayTeam;
    const state = window as typeof window & { assignmentCalls?: number; releaseRoster?: () => void; rosterWaiting?: boolean };
    state.assignmentCalls = 0;
    api.assignTodayTeamMember = async () => {
      state.assignmentCalls = (state.assignmentCalls ?? 0) + 1;
      throw new ApiError(503, 'PROVIDER_UNAVAILABLE', '응답을 확인할 수 없습니다.');
    };
    api.getTodayTeam = async () => {
      const snapshot = await getTeam();
      state.rosterWaiting = true;
      await new Promise<void>((resolve) => { state.releaseRoster = resolve; });
      return snapshot;
    };
  });
  await page.getByRole('button', { name: '이 작업 배정' }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { assignmentCalls?: number }).assignmentCalls)).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { rosterWaiting?: boolean }).rosterWaiting)).toBe(true);
  await expect(page.getByRole('status')).toContainText('배정 결과를 확인하고 있어요');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => (window as typeof window & { releaseRoster?: () => void }).releaseRoster?.());
  await expect(page.getByRole('alert')).toContainText('배정 결과를 확인하지 못했어요');
});

test('assignment blocks team mutations and a delayed roster poll cannot undo success', async ({ page }) => {
  await openOwnerTeamWithMember(page, 'Linh');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const assign = api.assignTodayTeamMember; const getTeam = api.getTodayTeam;
    const state = window as typeof window & { releaseAssignment?: () => void; releaseTeamPoll?: () => void; pollFinished?: boolean };
    api.getTodayTeam = async () => {
      const snapshot = await getTeam();
      await new Promise<void>((resolve) => { state.releaseTeamPoll = resolve; });
      state.pollFinished = true;
      return snapshot;
    };
    api.assignTodayTeamMember = async (...args) => {
      dispatchEvent(new Event('focus'));
      await new Promise<void>((resolve) => { state.releaseAssignment = resolve; });
      return assign(...args);
    };
  });
  await page.getByRole('button', { name: '이 작업 배정' }).click();
  await expect(page.getByRole('button', { name: '배정 중…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '새 QR 발급' })).toBeDisabled();
  await page.evaluate(() => (window as typeof window & { releaseAssignment?: () => void }).releaseAssignment?.());
  await expect(page.getByRole('status')).toContainText('배정했습니다.');
  await page.evaluate(() => (window as typeof window & { releaseTeamPoll?: () => void }).releaseTeamPoll?.());
  await page.waitForTimeout(100);
  await expect(page.getByRole('button', { name: '배정됨' })).toBeEnabled();
});

test('worker must explicitly acknowledge each assigned version, including unselected work', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    const first = (await api.confirmDraft(draft.draft_id, 'CONFIRM')).work_session;
    const second = { ...first, session_id: 'work-second' };
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify([first, second]));
    const team = await api.getTodayTeam();
    const member = await api.joinTodayTeam(team.join_url!.split('/').pop()!, { display_name: 'Lan', language_code: 'vi' });
    await api.assignTodayTeamMember(member.member_id, first.session_id);
    await api.assignTodayTeamMember(member.member_id, second.session_id);
    history.pushState({}, '', '/worker/my'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('status')).toContainText('2 hướng dẫn chưa xác nhận');
  await page.getByRole('button', { name: 'Tôi đã hiểu hướng dẫn', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 hướng dẫn chưa xác nhận');
  await page.getByRole('button', { name: /Thu hoạch hành · Ruộng hành số 1/ }).nth(1).click();
  await page.getByRole('button', { name: 'Tôi đã hiểu hướng dẫn', exact: true }).click();
  await expect(page.getByText('Đã xác nhận hướng dẫn', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.confirmQuantityChange('work-demo-01', { value: 15, unit: '망' }, 1);
    dispatchEvent(new Event('focus'));
  });
  await expect(page.getByRole('status')).toContainText('1 hướng dẫn chưa xác nhận');
  await page.goto('/owner/team');
  await expect(page.getByText('변경 확인 필요', { exact: true })).toBeVisible();
  await expect(page.getByText('확인함', { exact: true })).toBeVisible();
});

test('starting a new team preserves the old team behind its saved management link', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await page.getByRole('button', { name: '홈', exact: true }).click();
  await page.getByText('팀 관리 정보', { exact: true }).click();
  const link = await page.getByRole('link', { name: /관리 링크/ }).getAttribute('href');
  const pin = await page.getByLabel('팀 PIN').innerText();
  await page.getByRole('button', { name: '새 팀 시작', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('관리 링크와 PIN이 필요합니다');
  await page.getByRole('button', { name: '관리 정보 보관 후 새 팀 시작' }).click();
  await expect(page.getByRole('heading', { name: '평소 말투 그대로 말씀하세요' })).toBeVisible();
  await page.goto(link!);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByRole('button', { name: '이 팀 열기', exact: true }).click();
  await expect(page.getByRole('img', { name: '오늘 작업팀 참여 QR 코드' })).toBeVisible();
  await expect(page.getByLabel('팀 PIN')).toHaveCount(0);
  await page.getByRole('button', { name: '홈', exact: true }).click();
  await page.getByText('팀 관리 정보', { exact: true }).click();
  await expect(page.getByLabel('팀 PIN')).toHaveText(pin);
});

test('pending team has no QR and active team survives midnight with the same expiry', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-04T14:55:00Z') });
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '오늘 작업팀', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '첫 작업을 확정하면 팀 QR이 열려요' })).toBeVisible();
  await expect(page.getByRole('img', { name: '오늘 작업팀 참여 QR 코드' })).toHaveCount(0);
  await page.getByRole('button', { name: '작업 말하기', exact: true }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await page.getByRole('button', { name: '팀 QR로 배정' }).click();
  await page.getByRole('button', { name: '오늘 작업팀 열기' }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('batmeori-demo-today-team')!));
  expect(new Date(before.expires_at).getTime() - Date.parse('2026-09-04T14:55:00Z')).toBeGreaterThanOrEqual(24 * 3600000);
  await page.clock.fastForward('00:10:00');
  await page.reload();
  await expect(page.getByText(before.join_url, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('batmeori-demo-today-team')!).expires_at)).toBe(before.expires_at);
});

test('slow assignment reads survive polling and stale acknowledgement requires reconfirmation', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    const work = (await api.confirmDraft(draft.draft_id, 'CONFIRM')).work_session;
    const team = await api.getTodayTeam();
    const member = await api.joinTodayTeam(team.join_url!.split('/').pop()!, { display_name: 'Lan', language_code: 'vi' });
    await api.assignTodayTeamMember(member.member_id, work.session_id);
    const read = api.getMyTeamAssignments; let firstRead = true;
    api.getMyTeamAssignments = async () => { if (firstRead) { firstRead = false; await new Promise((resolve) => setTimeout(resolve, 5500)); } return read(); };
    const ack = api.acknowledgeAssignment; let firstAck = true;
    api.acknowledgeAssignment = async (id: string, version: number) => { if (firstAck) { firstAck = false; await api.confirmQuantityChange(id, { value: 15, unit: '망' }, version); } return ack(id, version); };
    history.pushState({}, '', '/worker/my'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Thu hoạch hành' })).toBeVisible({ timeout: 9000 });
  await page.getByRole('button', { name: 'Tôi đã hiểu hướng dẫn', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Hướng dẫn đã thay đổi');
  await expect(page.getByText('15 bao', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tôi đã hiểu hướng dẫn', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Tôi đã hiểu hướng dẫn', exact: true }).click();
  await expect(page.getByText('Đã xác nhận hướng dẫn', { exact: true })).toBeVisible();
});

test('two worker tabs keep separate assignments and confirmations', async ({ context, page }) => {
  await page.goto('/start');
  const teamUrl = await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    await api.confirmDraft(draft.draft_id, 'CONFIRM');
    return (await api.getTodayTeam()).join_url!;
  });
  const first = await context.newPage(); const second = await context.newPage();
  for (const [worker, name] of [[first, 'Lan'], [second, 'Mai']] as const) {
    await worker.goto(teamUrl);
    await worker.getByLabel('Tên hoặc biệt danh').fill(name);
    await worker.getByRole('button', { name: 'Tham gia nhóm hôm nay' }).click();
    await expect(worker.getByText('Hãy chờ chủ nông trại gửi hướng dẫn.')).toBeVisible();
  }
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const team = await api.getTodayTeam();
    await api.assignTodayTeamMember(team.members.find((member: { display_name: string }) => member.display_name === 'Lan')!.member_id, 'work-demo-01');
  });
  await first.evaluate(() => dispatchEvent(new Event('focus')));
  await second.evaluate(() => dispatchEvent(new Event('focus')));
  await expect(first.getByRole('heading', { name: 'Thu hoạch hành' })).toBeVisible();
  await expect(second.getByText('Hãy chờ chủ nông trại gửi hướng dẫn.')).toBeVisible();
  await first.getByRole('button', { name: 'Tôi đã hiểu hướng dẫn', exact: true }).click();
  await expect(first.getByText('Đã xác nhận hướng dẫn', { exact: true })).toBeVisible();
  const members = await page.evaluate(async () => (await (await import('/src/webapp/api.ts')).api.getTodayTeam()).members);
  expect(members.find((member) => member.display_name === 'Lan')?.assignment_receipts?.[0].acknowledged_version).toBe(1);
  expect(members.find((member) => member.display_name === 'Mai')?.assignment_receipts).toEqual([]);
});
