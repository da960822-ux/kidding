import { expect, test } from '@playwright/test';

for (const screen of ['current', 'home', 'team'] as const) test(`an open owner ${screen} screen refreshes after another tab publishes a quantity change`, async ({ page, context }) => {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await expect(page.getByRole('heading', { name: '작업 전달하기' })).toBeVisible();
  if (screen === 'team') await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const team = await api.getTodayTeam();
    const member = await api.joinTodayTeam(team.join_url!.split('/').pop()!, { display_name: 'Lan', language_code: 'vi' });
    await api.assignTodayTeamMember(member.member_id, 'work-demo-01');
  });
  await page.goto(screen === 'current' ? '/owner/work/work-demo-01' : `/owner/${screen}`);
  await expect(page.locator('main')).toContainText('20망');
  const editor = await context.newPage();
  await editor.goto('/owner/work/work-demo-01/change');
  await editor.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await editor.getByRole('button', { name: '이 수량으로 변경' }).click();
  await expect(editor.getByText('15망', { exact: true })).toBeVisible();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('main')).toContainText('15망', { timeout: 8_000 });
  await expect(page.locator('main')).not.toContainText('20망');
});
