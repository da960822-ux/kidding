import { expect, test, type Page } from '@playwright/test';

async function publishWork(page: Page) {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '작업 전달하기', exact: true })).toBeVisible();
}

async function mockMicrophone(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
      createAnalyser() { return { fftSize: 32, getByteTimeDomainData(data: Uint8Array) { data.fill(128); } }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    } });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: class {
      state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: ((event: BlobEvent) => void) | null = null; onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable?.(new BlobEvent('dataavailable', { data: new Blob(['new quantity'], { type: this.mimeType }) })); this.onstop?.(); }
    } });
  });
}

test('worker-facing team QR hides owner PIN and management link', async ({ page }) => {
  await publishWork(page);
  const management = await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    return (await api.getOwnerSession()).team!;
  });
  expect(management.pin).toMatch(/^\d{6}$/);
  expect(management.management_url).toContain('/owner/manage/');
  await page.getByRole('button', { name: '오늘 작업팀', exact: true }).click();
  await expect(page.getByRole('button', { name: '참여 링크 복사', exact: true })).toBeVisible();
  await expect(page.getByLabel('팀 PIN', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /관리 링크/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '관리 정보 복사', exact: true })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(management.pin!);
  await expect(page.locator('main')).not.toContainText(management.management_url!);
});

test('another work never offers the previous work remote link', async ({ page }) => {
  await publishWork(page);
  await page.getByRole('button', { name: /언어별 링크 보내기/ }).click();
  await page.getByRole('button', { name: '베트남어 링크 만들기', exact: true }).click();
  const firstLink = await page.getByRole('link', { name: '작업자 화면 열기', exact: true }).getAttribute('href');
  expect(firstLink).toBeTruthy();
  const secondId = await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const draft = await api.createDraft(new Blob(['second work'], { type: 'audio/webm' }));
    const second = (await api.confirmDraft(draft.draft_id, 'CONFIRM')).work_session;
    const sessions = (await api.listSessions()).items;
    second.version.state.location_display = '두 번째 밭';
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify(sessions.map((item) => item.session_id === second.session_id ? second : item)));
    return second.session_id;
  });
  expect(secondId).not.toBe('work-demo-01');
  await page.getByRole('button', { name: '홈', exact: true }).click();
  await page.getByRole('button').filter({ hasText: '두 번째 밭' }).click();
  await page.getByRole('button', { name: '전달 화면 열기', exact: true }).click();
  await page.getByRole('button', { name: /언어별 링크 보내기/ }).click();
  await expect(page.locator(`a[href="${firstLink}"]`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '베트남어 링크 만들기', exact: true })).toBeVisible();
});

test('owner reviews full step descriptions and notes before publishing', async ({ page }) => {
  await page.goto('/owner/new');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const create = api.createDraft;
    api.createDraft = async (audio: Blob) => {
      const draft = await create(audio);
      draft.state.steps[0].description_ko = '상한 양파는 오른쪽 바구니에 따로 모아주세요.';
      draft.state.notes = '젖은 양파는 다른 양파와 섞지 마세요.';
      return draft;
    };
  });
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page.getByText('상한 양파는 오른쪽 바구니에 따로 모아주세요.', { exact: true })).toBeVisible();
  await expect(page.getByText('젖은 양파는 다른 양파와 섞지 마세요.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확정하기', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('batmeori-demo-sessions'))).toBeNull();
});

test('starting a new quantity recording invalidates the previous candidate', async ({ page }) => {
  await mockMicrophone(page);
  await publishWork(page);
  await page.getByRole('button', { name: '진행 중 작업', exact: true }).click();
  await page.getByRole('button', { name: '수량 변경', exact: true }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  const confirm = page.getByRole('button', { name: '이 수량으로 변경', exact: true });
  await expect(confirm).toBeEnabled();
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '그만 말하기', exact: true })).toBeVisible();
  await expect.poll(async () => await confirm.isVisible() && await confirm.isEnabled()).toBe(false);
});

test('waiting for a replacement microphone cannot submit the old recording', async ({ page }) => {
  await mockMicrophone(page);
  await publishWork(page);
  await page.getByRole('button', { name: '진행 중 작업', exact: true }).click();
  await page.getByRole('button', { name: '수량 변경', exact: true }).click();
  await page.evaluate(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia;
    let attempts = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      attempts += 1;
      if (attempts === 2) await new Promise<void>((resolve) => window.addEventListener('allow-replacement-microphone', () => resolve(), { once: true }));
      return getUserMedia.call(navigator.mediaDevices, constraints);
    };
  });
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await page.getByRole('button', { name: '그만 말하기', exact: true }).click();
  const submit = page.getByRole('button', { name: '변경 내용 확인', exact: true });
  await expect(submit).toBeEnabled();
  await page.getByRole('button', { name: '다시 녹음', exact: true }).click();
  await expect(submit).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('allow-replacement-microphone')));
  await expect(page.getByRole('button', { name: '그만 말하기', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '이 수량으로 변경', exact: true })).toHaveCount(0);
});

test('pending quantity supplement cannot be closed or confirmed before review', async ({ page }) => {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const supplement = api.supplementDraft;
    api.supplementDraft = async (...args) => {
      await new Promise<void>((resolve) => window.addEventListener('finish-quantity-supplement', () => resolve(), { once: true }));
      const draft = await supplement(...args);
      return { ...draft, state: { ...draft.state, quantity: { value: 12, unit: '망' } } };
    };
  });
  await page.getByRole('button', { name: '수량 다시 말하기', exact: true }).click();
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page.getByRole('button', { name: '수량 수정 닫기', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '확정하기', exact: true })).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('finish-quantity-supplement')));
  await expect(page.getByText('12망', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '확정하기', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('batmeori-demo-sessions'))).toBeNull();
});

test('quantity conflict reloads the current value before another confirmation', async ({ page }) => {
  await publishWork(page);
  await page.getByRole('button', { name: '진행 중 작업', exact: true }).click();
  await page.getByRole('button', { name: '수량 변경', exact: true }).click();
  await page.evaluate(async () => {
    const { api, ApiError } = await import('/src/webapp/api.ts');
    const confirm = api.confirmQuantityChange;
    let first = true;
    api.confirmQuantityChange = async (id, quantity, version) => {
      if (first) {
        first = false;
        await confirm(id, { value: 12, unit: '망' }, version);
        throw new ApiError(409, 'VERSION_CONFLICT', '최신 작업 버전을 다시 확인하세요.');
      }
      return confirm(id, quantity, version);
    };
  });
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  const confirm = page.getByRole('button', { name: '이 수량으로 변경', exact: true });
  await confirm.click();
  await expect(page.getByText('12망', { exact: true })).toBeVisible();
  await expect.poll(async () => await confirm.isVisible() && await confirm.isEnabled()).toBe(false);
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await confirm.click();
  await expect(page.getByRole('heading', { name: '진행 중 작업', exact: true })).toBeVisible();
  await expect(page.getByText('15망', { exact: true })).toBeVisible();
});

test('owner briefing keeps full server audio without a duplicate current-step control', async ({ page }) => {
  await publishWork(page);
  const expected = await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const getBriefing = api.getBriefing;
    const sample = await getBriefing('work-demo-01', 'vi');
    api.getBriefing = async (...args) => {
      const briefing = await getBriefing(...args);
      if (briefing.contract_version !== 'worker-briefing-v2') throw new Error('Expected current briefing');
      const { context, steps } = briefing;
      const quantity = typeof context.quantity === 'object' && context.quantity ? `${context.quantity.value} ${context.quantity.unit}` : null;
      const complete = [context.location_display, quantity, context.deadline, ...context.safety, ...steps.map((step) => `${step.title} ${step.description}`), context.notes].filter((text) => typeof text === 'string' && text.trim()).join('\n');
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(complete));
      const text_hash = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return { ...briefing, tts: { ...briefing.tts, status: 'READY', text_hash, audio_url: '/audio/owner-complete.mp3' } };
    };
    const events: { audio: string[]; speech: string[] } = { audio: [], speech: [] };
    Object.defineProperty(window, '__ownerMedia', { value: events, configurable: true });
    Object.defineProperty(window, 'Audio', { configurable: true, value: class extends EventTarget {
      src: string; paused = true; onerror: (() => void) | null = null;
      constructor(src = '') { super(); this.src = src; }
      play() { this.paused = false; events.audio.push(this.src); this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
      pause() { this.paused = true; }
    } });
    Object.defineProperty(speechSynthesis, 'getVoices', { configurable: true, value: () => [{ lang: 'vi-VN', name: 'Vietnamese test voice', localService: true }] });
    Object.defineProperty(speechSynthesis, 'speak', { configurable: true, value: (utterance: SpeechSynthesisUtterance) => events.speech.push(utterance.text) });
    Object.defineProperty(speechSynthesis, 'cancel', { configurable: true, value: () => {} });
    return sample.steps.length;
  });
  await page.getByRole('button', { name: /현장에서 같이 보기/ }).click();
  await page.getByRole('button', { name: '현장에서 작업 함께 보기', exact: true }).click();
  await page.getByRole('button', { name: 'Nghe toàn bộ hướng dẫn', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __ownerMedia: { audio: string[] } }).__ownerMedia.audio)).toEqual(['/audio/owner-complete.mp3']);
  await expect(page.getByRole('button', { name: 'Nghe bước này', exact: true })).toHaveCount(0);
  expect(expected).toBeGreaterThan(1);
});
