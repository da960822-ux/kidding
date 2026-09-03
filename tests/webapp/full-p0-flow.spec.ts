import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

test('owner chooses one delivery method before its controls appear', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();

  await expect(page.getByRole('heading', { name: '전달 방법을 고르세요' })).toBeVisible();
  await expect(page.getByText('링크 언어', { exact: true })).toBeHidden();
  await expect(page.getByText('브리핑 언어', { exact: true })).toBeHidden();

  await page.getByRole('button', { name: '언어별 링크 보내기' }).click();
  await expect(page.getByText('링크 언어', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '현장에서 작업 함께 보기' })).toBeHidden();

  await page.getByRole('button', { name: '전달 방법 다시 고르기' }).click();
  await page.getByRole('button', { name: '현장에서 같이 보기' }).click();
  await expect(page.getByText('브리핑 언어', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '현장에서 작업 함께 보기' })).toBeVisible();
  await expect(page.getByText('링크 언어', { exact: true })).toBeHidden();
});

test('owner instruction reaches remote and today-team workers, then quantity refreshes', async ({ context, page }) => {
  await page.goto('/start');
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page.getByRole('heading', { name: '제가 이렇게 이해했어요' })).toBeVisible();
  await page.getByRole('button', { name: '확정하기' }).click();
  await expect(page.getByRole('heading', { name: '작업 전달하기' })).toBeVisible();

  await page.getByRole('button', { name: '현장에서 같이 보기' }).click();
  await page.getByRole('button', { name: '현장에서 작업 함께 보기' }).click();
  await expect(page.getByRole('heading', { name: 'Hướng dẫn công việc' })).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await page.getByRole('button', { name: '언어별 링크 보내기' }).click();
  await page.getByRole('button', { name: 'नेपाली' }).click();
  await page.getByRole('button', { name: '네팔어 링크 만들기' }).click();
  const workerUrl = await page.getByRole('link', { name: '작업자 화면 열기' }).getAttribute('href');
  expect(workerUrl).toBeTruthy();

  const remote = await context.newPage();
  await remote.goto(workerUrl!);
  await expect(remote.getByRole('heading', { name: 'प्याज निकाल्नुहोस्' })).toBeVisible();

  await page.goto('/owner/work/work-demo-01');
  await expect(page.getByRole('heading', { name: '진행 중 작업' })).toBeVisible();
  await page.getByRole('button', { name: '수량 변경' }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '이 수량으로 변경' }).click();
  await expect(page.getByText('15망', { exact: true })).toBeVisible();
  await remote.bringToFront();
  await remote.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(remote.getByRole('status')).toContainText('नयाँ निर्देशन आएको छ');
  await expect(remote.getByText(/15 बोरा/)).toBeVisible();

  await page.bringToFront();
  await page.goto('/owner/team');
  const teamUrl = await page.getByText(/\/team\/team-/).textContent();
  expect(teamUrl).toBeTruthy();

  const member = await context.newPage();
  await member.goto(teamUrl!);
  await member.getByLabel('Tên hoặc biệt danh').fill('Nguyễn');
  await member.getByRole('button', { name: 'Tiếng Việt' }).click();
  await member.getByRole('button', { name: 'Tham gia nhóm hôm nay' }).click();
  await expect(member.getByText('Hãy chờ chủ nông trại gửi hướng dẫn.')).toBeVisible();

  await page.bringToFront();
  await expect(page.getByText('Nguyễn', { exact: true })).toBeVisible({ timeout: 6_000 });
  const work = page.getByLabel('Nguyễn 작업 선택');
  await expect(work).toContainText('양파 수확');
  await page.getByRole('button', { name: '이 작업 배정' }).click();

  await member.bringToFront();
  await member.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(member.getByRole('heading', { name: 'Thu hoạch hành' })).toBeVisible();
  await expect(member.getByText(/15 bao/)).toBeVisible();
});
