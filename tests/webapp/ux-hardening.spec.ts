import { expect, test } from '@playwright/test';

for (const blocking of [false, true]) {
  test(`deictic location ${blocking ? 'conflict still requires clarification' : 'advisory allows one explicit in-person confirmation'}`, async ({ page }) => {
    await page.setViewportSize({ width: blocking ? 1024 : 360, height: 800 });
    await page.addInitScript(() => localStorage.setItem('batmeori-demo-owner-session', JSON.stringify({ authenticated: true, expires_at: new Date(Date.now() + 3600000).toISOString(), farm: { code: 'farm-demo', display_name: '밭머리 데모 농장' } })));
    await page.goto('/owner/new');
    await page.evaluate(async (isBlocking) => {
      const { api } = await import('/src/webapp/api.ts');
      const originalCreate = api.createDraft;
      const originalConfirm = api.confirmDraft;
      api.createDraft = async (audio: Blob) => {
        const draft = await originalCreate(audio);
        return { ...draft, interpretation: 'AMBIGUOUS', state: { ...draft.state, location: { raw_text: '저짝 밭', kind: 'DEICTIC', canonical_name: null }, location_display: '저짝 밭' }, ambiguities: [{ field: 'location', kind: 'LOCATION', blocking: isBlocking, message: isBlocking ? '동쪽과 서쪽 중 어느 밭인가요?' : '가리킨 장소를 현장에서 함께 확인하면 됩니다.' }] };
      };
      api.confirmDraft = async (...args: Parameters<typeof api.confirmDraft>) => {
        Object.defineProperty(window, '__confirmation', { configurable: true, value: args.slice(1) });
        return originalConfirm(...args);
      };
    }, blocking);
    await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
    await expect(page.getByText('저짝 밭', { exact: true }).first()).toBeVisible();
    if (blocking) {
      await expect(page.getByRole('button', { name: '이대로 전달', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: '현장에서 장소를 알려주고 전달' })).toHaveCount(0);
    } else {
      await expect(page.getByLabel('그대로 전달하는 이유')).toHaveCount(0);
      await page.getByRole('button', { name: '현장에서 장소를 알려주고 전달' }).click();
      await expect(page.getByRole('heading', { name: '작업 전달하기' })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __confirmation: unknown }).__confirmation)).toEqual(['PUBLISH_AS_IS', 'IN_PERSON_BRIEFING']);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('direct team link keeps saved Nepali language on initial render despite Korean landing preference', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('batmeori-locale', 'ko');
    sessionStorage.setItem('batmeori-worker-locale', 'ne');
  });
  await page.goto(`/team/team-${'a'.repeat(32)}`);
  await expect(page.getByRole('heading', { name: 'तपाईंको नाम लेख्नुहोस्' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ne');
  await expect(page.getByRole('button', { name: 'नेपाली', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const locale of ['vi', 'ne'] as const) {
  test(`legacy ${locale} briefing uses worker language without Korean UI`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(locale === 'vi' ? '/w/demo-legacy-token' : '/w/demo-ne-legacy-token');
    await expect(page.getByRole('heading', { name: locale === 'vi' ? 'Hướng dẫn công việc cũ' : 'पुरानो काम निर्देशन' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/[가-힣]/);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`unsupported ${locale} task explains owner confirmation instead of only missing video`, async ({ page }) => {
    await page.goto('/start');
    await page.evaluate(async (language) => {
      const modulePath = '/src/webapp/api.ts';
      const { api } = await import(modulePath);
      const original = api.getAssignment;
      api.getAssignment = async () => ({ ...await original(`demo-${language}-token`), badges: ['UNSUPPORTED'] });
      history.pushState({}, '', `/w/demo-${language}-token`);
      dispatchEvent(new PopStateEvent('popstate'));
    }, locale);
    await expect(page.getByText(locale === 'vi' ? /Nếu chưa rõ, hãy hỏi chủ nông trại trước khi làm/ : /अस्पष्ट भए काम गर्नुअघि खेत मालिकलाई सोध्नुहोस्/)).toBeVisible();
    await expect(page.locator('main')).not.toContainText('UNSUPPORTED');
  });
}

test('reduced motion preserves color feedback and forced colors preserve controls and focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto('/w/demo-vi-token');
  const view = page.getByRole('button', { name: 'Xem từng bước' });
  await expect(view).toBeVisible();
  await view.focus();
  const styles = await view.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderTopWidth, outline: style.outlineWidth, duration: style.transitionDuration, properties: style.transitionProperty };
  });
  expect(styles.border).toBe('2px');
  expect(styles.outline).toBe('3px');
  expect(styles.properties).toContain('color');
  expect(styles.properties).not.toContain('transform');
  expect(parseFloat(styles.duration)).toBeGreaterThan(0.01);
  await view.click();
  await page.evaluate(() => {
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { onend = null; onerror = null; lang = ''; constructor(public text: string) {} } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak() {} } });
  });
  await page.getByRole('button', { name: 'Nghe hướng dẫn' }).click();
  await expect(page.locator('.animate-pulse')).toHaveCSS('animation-name', 'none');
});

test('worker can listen to the complete briefing from the summary', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      onend: (() => void) | null = null; onerror: (() => void) | null = null; lang = '';
      constructor(text: string) { Object.defineProperty(window, '__spokenBriefing', { configurable: true, value: text }); }
    } });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak(speech: { onend: (() => void) | null }) { speech.onend?.(); } } });
  });
  await page.goto('/w/demo-vi-token');
  await page.getByRole('button', { name: 'Nghe toàn bộ hướng dẫn' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenBriefing?: string }).__spokenBriefing)).toContain('Thu hoạch hành');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spokenBriefing?: string }).__spokenBriefing)).toContain('Vận chuyển hành');
});

test('owner reload recovers only draft facts, not raw audio', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('batmeori-demo-owner-session', JSON.stringify({ authenticated: true, expires_at: new Date(Date.now() + 3600000).toISOString(), farm: { code: 'farm-demo', display_name: '밭머리 데모 농장' } })));
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page.getByText('1번 밭', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('1번 밭', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '원음 듣기' })).toBeDisabled();
});

test('owner keeps issued link language visible before creating another language link', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('batmeori-demo-owner-session', JSON.stringify({ authenticated: true, expires_at: new Date(Date.now() + 3600000).toISOString(), farm: { code: 'farm-demo', display_name: '밭머리 데모 농장' } })));
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await page.getByRole('button', { name: '베트남어 링크 만들기' }).click();
  await expect(page.getByText('발급된 링크 언어: 베트남어')).toBeVisible();
  await page.getByRole('button', { name: 'नेपाली', exact: true }).click();
  await expect(page.getByText('선택한 네팔어 링크는 아직 만들지 않았어요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '네팔어 링크 만들기' })).toBeVisible();
});

test('worker sees only a verified safety source as a source link', async ({ page }) => {
  await page.goto('/start');
  await page.evaluate(async () => {
    const { api } = await import('/src/webapp/api.ts');
    const original = api.getAssignment;
    api.getAssignment = async (token: string) => {
      const briefing = await original(token);
      if (briefing.contract_version !== 'worker-briefing-v2') return briefing;
      return {
        ...briefing,
        context: { ...briefing.context, safety: ['Mang ủng chống trượt.'] },
        source_detail: [...briefing.source_detail, { step_sequence: null, segment: 'SAFETY', source: 'OFFICIAL_GUIDE', guide_lookup: 'HIT', verified: true, source_page: 3, source_url: 'https://fixture.test/batmeori/safety-guide.pdf', license: 'TEST_FIXTURE_ONLY' }],
      };
    };
    history.pushState({}, '', '/w/demo-vi-token');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  const source = page.getByRole('link', { name: 'Nguồn an toàn đã kiểm tra' });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('href', 'https://fixture.test/batmeori/safety-guide.pdf');
});

test('supplemental safety recording preserves initial audio and shows Korean risk guidance', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('batmeori-demo-owner-session', JSON.stringify({ authenticated: true, expires_at: new Date(Date.now() + 3600000).toISOString(), farm: { code: 'farm-demo', display_name: '밭머리 데모 농장' } }));
    const createObjectUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => { if (object instanceof Blob) Object.defineProperty(window, '__playedBlob', { configurable: true, value: object }); return createObjectUrl(object); };
    let recording = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
      createAnalyser() { return { fftSize: 32, getByteTimeDomainData(data: Uint8Array) { data.fill(128); } }; }
      createMediaStreamSource() { return { connect() {} }; }
      close() { return Promise.resolve(); }
    } });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: class {
      state = 'inactive'; mimeType = 'audio/webm'; ondataavailable: ((event: BlobEvent) => void) | null = null; onstop: (() => void) | null = null;
      start() { this.state = 'recording'; recording += 1; }
      stop() { this.state = 'inactive'; this.ondataavailable?.(new BlobEvent('dataavailable', { data: new Blob([recording === 1 ? 'initial-instruction' : 'supplement'], { type: this.mimeType }) })); this.onstop?.(); }
    } });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
  await page.goto('/owner/new');
  await page.evaluate(async () => {
    const modulePath = '/src/webapp/api.ts';
    const { api } = await import(modulePath);
    const original = api.createDraft;
    api.createDraft = async (audio: Blob) => {
      const draft = await original(audio);
      return { ...draft, state: { ...draft.state, risk_assessment: { ...draft.state.risk_assessment, level: 'HIGH', reasons: ['VEHICLE_OPERATION'] } } };
    };
  });
  await page.getByRole('button', { name: '녹음 시작' }).click();
  await page.getByRole('button', { name: '그만 말하기' }).click();
  await page.getByRole('button', { name: '음성 제출' }).click();
  await expect(page.getByRole('alert')).toContainText('차량 운전 작업입니다.');
  await expect(page.locator('main')).not.toContainText('VEHICLE_OPERATION');
  await page.getByRole('button', { name: '녹음 시작' }).click();
  await page.getByRole('button', { name: '그만 말하기' }).click();
  await page.getByRole('button', { name: '보완 내용 제출' }).click();
  await page.getByRole('button', { name: '원음 듣기' }).click();
  await expect.poll(() => page.evaluate(async () => (window as unknown as { __playedBlob?: Blob }).__playedBlob?.text())).toBe('initial-instruction');
});
