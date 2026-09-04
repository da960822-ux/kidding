import { expect, test } from '@playwright/test';

test('worker entry does not treat a long page URL or an unrelated pasted URL as a team token', async ({ page }) => {
  await page.goto('/worker?lang=ne&source=long-entry-address');
  await expect(page.getByRole('heading', { name: '작업팀 찾기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'QR 코드 스캔', exact: true })).toBeVisible();
  await expect(page.getByLabel('팀 참여 링크 또는 코드', { exact: true })).toBeVisible();
  await expect(page.locator('#team-link')).toBeVisible();
  await page.locator('#team-link').fill('https://example.com/a-long-unrelated-address');
  await page.locator('main button').last().click();
  await expect(page.locator('#team-link')).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('a changed unselected work is identified and its notice clears after acknowledgement', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.startOwnerSession();
    const draft = await api.createDraft(new Blob(['demo']));
    const first = (await api.confirmDraft(draft.draft_id, 'CONFIRM')).work_session;
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify([first, { ...first, session_id: 'second-work', version: { ...first.version, state: { ...first.version.state, location_display: '2번 밭' } } }]));
    const team = await api.getTodayTeam();
    const member = await api.joinTodayTeam(team.join_url!.split('/').pop()!, { display_name: 'Lan', language_code: 'vi' });
    await api.assignTodayTeamMember(member.member_id, first.session_id);
    await api.assignTodayTeamMember(member.member_id, 'second-work');
    await api.acknowledgeAssignment(first.session_id, 1);
    await api.acknowledgeAssignment('second-work', 1);
    history.pushState({}, '', '/worker/my'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Thu hoạch hành' })).toBeVisible();
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    await api.confirmQuantityChange('second-work', { value: 15, unit: '망' }, 1);
    dispatchEvent(new Event('focus'));
  });
  const notice = page.getByRole('status');
  await expect(notice).toContainText('1 hướng dẫn chưa xác nhận');
  await expect(page.getByText('Có hướng dẫn mới. Hãy xem lại từ bước đầu tiên.', { exact: true })).toBeHidden();
  await notice.getByRole('button').click();
  await expect(page.getByText('15 bao', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tôi đã hiểu hướng dẫn', exact: true }).click();
  await expect(page.getByText('Có hướng dẫn mới. Hãy xem lại từ bước đầu tiên.', { exact: true })).toBeHidden();
  await expect(page.getByRole('status')).toBeHidden();
});

test('step view plays stored full audio without browser speech and stops it on language change and navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    Object.defineProperty(window, '__mediaEvents', { value: [] });
    window.Audio = class {
      onended = null; onerror = null;
      constructor(private url: string) {}
      play() { (window as unknown as { __mediaEvents: string[] }).__mediaEvents.push(`play:${this.url}`); return Promise.resolve(); }
      pause() { (window as unknown as { __mediaEvents: string[] }).__mediaEvents.push('pause'); }
    } as unknown as typeof Audio;
  });
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const read = api.getAssignment;
    api.getAssignment = async (token: string) => {
      const result = await read(token);
      if (result.contract_version !== 'worker-briefing-v2') return result;
      const { context, steps } = result;
      const quantity = typeof context.quantity === 'object' && context.quantity ? `${context.quantity.value} ${context.quantity.unit}` : null;
      const text = [context.location_display, quantity, context.deadline, ...context.safety, ...steps.map((step) => `${step.title} ${step.description}`), context.notes].filter(Boolean).join('\n');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return { ...result, tts: { ...result.tts, text_hash: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''), audio_url: '/stored-full-instruction.mp3' } };
    };
    history.pushState({}, '', '/w/demo-vi-token'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: 'Bắt đầu bước 1' }).click();
  await page.getByRole('button', { name: 'Nghe toàn bộ hướng dẫn' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaEvents: string[] }).__mediaEvents)).toContain('play:/stored-full-instruction.mp3');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const read = api.getAssignment;
    api.getAssignment = () => read('demo-ne-token');
    dispatchEvent(new Event('focus'));
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ne');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaEvents: string[] }).__mediaEvents)).toContain('pause');
  await page.getByRole('button', { name: 'पूरा निर्देशन सुन्नुहोस्', exact: true }).click();
  await page.getByRole('button', { name: 'अर्को', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __mediaEvents: string[] }).__mediaEvents.filter((event) => event === 'pause').length)).toBe(2);
  await page.getByRole('button', { name: 'यो चरण सुन्नुहोस्', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('आवाज बजाउन सकिएन');
  expect(errors).toEqual([]);
});
