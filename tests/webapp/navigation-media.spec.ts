import { expect, test, type Page } from '@playwright/test';

async function publish(page: Page) {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await expect(page.getByRole('heading', { name: '작업 전달하기' })).toBeVisible();
}

test('new owner work uses the resumable start endpoint without waiting for a session read', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    api.getOwnerSession = () => new Promise(() => {});
  });
  await page.getByRole('button', { name: /농장주예요/ }).click();
  await expect(page.getByRole('button', { name: '녹음 시작' })).toBeVisible({ timeout: 2500 });
});

test('published storyboard uses matched package video and keeps text after media failure', async ({ page }) => {
  await publish(page);
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d')!; const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    const frames = setInterval(() => { context.fillStyle = '#173f24'; context.fillRect(0, 0, 64, 64); }, 80);
    recorder.start(); await new Promise((resolve) => setTimeout(resolve, 900)); recorder.stop(); await stopped;
    clearInterval(frames); stream.getTracks().forEach((track) => track.stop());
    const videoUrl = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const original = api.getBriefing;
    api.getBriefing = async (...args) => {
      const brief = await original(...args);
      if (brief.contract_version === 'worker-briefing-v2') brief.video = [{ step_sequence: 1, asset_id: 'approved-harvest', task_code: 'ONION_HARVEST', video_url: videoUrl, captions_text: 'Thu hoạch hành.', provenance: 'AI_GENERATED_PREGENERATED', review_status: 'APPROVED', safety_level: 'LOW' }];
      return brief;
    };
    history.pushState({}, '', '/owner/work/work-demo-01'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: '전달 화면 열기' }).click();
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('controls', '');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video.locator('track')).toHaveAttribute('srclang', 'vi');
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1);
  await video.evaluate((element: HTMLVideoElement) => element.play());
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await video.dispatchEvent('error');
  await expect(video).toHaveCount(0);
  await expect(page.getByText('영상을 재생하지 못했어요. 작업 설명을 확인해주세요.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. 양파 수확' })).toBeVisible();
});

test('owner team roster appears while work list is still pending', async ({ page }) => {
  await publish(page);
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const team = await api.getTodayTeam();
    await api.joinTodayTeam(team.join_url!.split('/').pop()!, { display_name: 'Lan', language_code: 'vi' });
    api.listSessions = () => new Promise(() => {});
    history.pushState({}, '', '/owner/team'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByText('Lan', { exact: true })).toBeVisible({ timeout: 2500 });
  await expect(page.getByLabel('Lan 작업 선택')).toBeDisabled();
  await expect(page.getByText('작업 목록을 불러오는 중…')).toBeVisible();
});

test('storyboard rejects another session, version or language package and retries without borrowing a step video', async ({ page }) => {
  await publish(page);
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts'); const original = api.getBriefing;
    (window as any).mediaMismatch = 'session'; (window as any).mediaChecks = 0;
    api.getBriefing = async (...args) => {
      const brief = await original(...args);
      if (brief.contract_version !== 'worker-briefing-v2') return brief;
      const mismatch = (window as any).mediaMismatch;
      (window as any).mediaChecks++;
      return { ...brief, session_id: mismatch === 'session' ? 'another-session' : brief.session_id,
        version: mismatch === 'version' ? brief.version + 1 : brief.version,
        language_code: mismatch === 'language' ? 'ne' : brief.language_code,
        video: [{ step_sequence: mismatch === 'step' ? 99 : 1, asset_id: 'test-asset', task_code: 'ONION_HARVEST', video_url: '/pending.mp4', captions_text: 'Thu hoạch', provenance: 'AI_GENERATED_PREGENERATED', review_status: 'APPROVED', safety_level: 'LOW' }] };
    };
    history.pushState({}, '', '/owner/work/work-demo-01'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.route('**/pending.mp4', () => new Promise(() => {}));
  await page.getByRole('button', { name: '전달 화면 열기' }).click();
  await expect(page.getByRole('button', { name: '영상 다시 불러오기' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  for (const mismatch of ['version', 'language', 'step', 'none']) {
    const before = await page.evaluate((value) => { (window as any).mediaMismatch = value; return (window as any).mediaChecks; }, mismatch);
    await expect.poll(() => page.evaluate(() => { dispatchEvent(new Event('focus')); return (window as any).mediaChecks; })).toBeGreaterThan(before);
    await expect(page.locator('video')).toHaveCount(mismatch === 'none' ? 1 : 0);
  }
  await expect(page.getByRole('heading', { name: '4. 양파 운반' })).toBeVisible();
  await expect(page.locator('li').filter({ has: page.getByRole('heading', { name: '4. 양파 운반' }) }).locator('video')).toHaveCount(0);
});

test('failed work session read offers a retry that recovers the requested session', async ({ page }) => {
  await publish(page);
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    const original = api.getSession;
    let failed = false;
    api.getSession = async () => {
      if (!failed) { failed = true; throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Unavailable'); }
      return { ...await original('work-demo-01'), session_id: 'retry-work' };
    };
    history.pushState({}, '', '/owner/work/retry-work'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: '다시 연결' })).toBeVisible();
  await page.getByRole('button', { name: '다시 연결' }).click();
  await expect(page.getByRole('heading', { name: '진행 중 작업' })).toBeVisible();
  await expect(page.locator('main')).toContainText('20망');
});

test('owner briefing deduplicates focus refreshes while a request is pending', async ({ page }) => {
  await publish(page);
  await page.evaluate(() => {
    history.pushState({}, '', '/owner/work/work-demo-01/brief'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: 'Hướng dẫn công việc' })).toBeVisible();
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    (window as any).briefRequests = 0;
    api.getBriefing = () => { (window as any).briefRequests++; return new Promise(() => {}); };
    dispatchEvent(new Event('focus')); dispatchEvent(new Event('focus')); dispatchEvent(new Event('focus'));
  });
  expect(await page.evaluate(() => (window as any).briefRequests)).toBe(1);
});

test('lost quantity confirmation response recovers the matching latest version without another write', async ({ page }) => {
  await publish(page);
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const original = api.confirmQuantityChange;
    (window as any).quantityWrites = 0;
    api.confirmQuantityChange = async (...args) => {
      (window as any).quantityWrites++;
      await original(...args);
      throw new DOMException('Response lost', 'TimeoutError');
    };
    history.pushState({}, '', '/owner/work/work-demo-01/change'); dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '이 수량으로 변경' }).click();
  await expect(page.getByRole('heading', { name: '진행 중 작업' })).toBeVisible();
  await expect(page.getByText('15망', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).quantityWrites)).toBe(1);
});

for (const changedElsewhere of [false, true]) test(`quantity retry after lost response and failed read ${changedElsewhere ? 'clears a conflicting preview' : 'recovers on version conflict'}`, async ({ page }) => {
  await publish(page);
  await page.evaluate(async (differentQuantity) => {
    const { api } = await import('/src/webapp/api.ts');
    const originalConfirm = api.confirmQuantityChange; const originalRead = api.getSession;
    let attempted = false; let reads = 0; (window as any).quantityWrites = 0;
    api.confirmQuantityChange = async (id, quantity, version) => {
      if (attempted) return originalConfirm(id, quantity, version);
      attempted = true;
      await originalConfirm(id, differentQuantity ? { value: 14, unit: '망' } : quantity, version);
      (window as any).quantityWrites++;
      throw new DOMException('Response lost', 'TimeoutError');
    };
    api.getSession = async (...args) => {
      if (attempted && reads++ === 0) throw new TypeError('Read failed');
      return originalRead(...args);
    };
    history.pushState({}, '', '/owner/work/work-demo-01/change'); dispatchEvent(new PopStateEvent('popstate'));
  }, changedElsewhere);
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '이 수량으로 변경' }).click();
  await expect(page.getByRole('alert')).toContainText('변경 결과를 확인하지 못했어요');
  await page.getByRole('button', { name: '이 수량으로 변경' }).click();
  if (changedElsewhere) {
    await expect(page.getByRole('alert')).toContainText('다른 변경이 반영됐어요');
    await expect(page.getByText('14망', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '이 수량으로 변경' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('heading', { name: '진행 중 작업' })).toBeVisible();
    await expect(page.getByText('15망', { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => (window as any).quantityWrites)).toBe(1);
});

for (const language of ['vi', 'ne'] as const) test(`worker ${language} notes remain visible on overview and step`, async ({ page }) => {
  await page.setViewportSize({ width: language === 'vi' ? 360 : 1024, height: 800 });
  const note = language === 'vi' ? 'Không trộn hành ướt với hành khác.' : 'भिजेको प्याज अर्को प्याजसँग नमिसाउनुहोस्।';
  await page.goto('/start');
  await page.evaluate(async ({ language, note }) => {
    const { api } = await import('/src/webapp/api.ts');
    const original = api.getAssignment;
    api.getAssignment = async () => {
      const brief = await original(`demo-${language}-token`);
      return { ...brief, context: { ...brief.context, notes: note } };
    };
    history.pushState({}, '', `/w/demo-${language}-token`); dispatchEvent(new PopStateEvent('popstate'));
  }, { language, note });
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`notes-${language}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: language === 'vi' ? 'Bắt đầu bước 1' : 'चरण १ सुरु गर्नुहोस्' }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
});
