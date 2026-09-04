import { expect, test } from '@playwright/test';

for (const language of ['vi', 'ne'] as const) {
  for (const stored of ['current', 'old', 'missing'] as const) {
    test(`${language} full audio includes context and prohibitions with ${stored} stored audio`, async ({ page }) => {
      const note = language === 'vi' ? 'Không được ném hành tây. Không trộn hành hỏng với hành tốt.' : 'प्याज नफ्याँक्नुहोस्। बिग्रेको प्याज राम्रो प्याजसँग नमिसाउनुहोस्।';
      const deadline = language === 'vi' ? 'Trước buổi trưa' : 'दिउँसोअघि';
      await page.addInitScript(() => {
        (window as any).spoken = []; (window as any).played = [];
        window.SpeechSynthesisUtterance = class { constructor(public text: string) {} } as unknown as typeof SpeechSynthesisUtterance;
        Object.defineProperty(window, 'speechSynthesis', { value: { cancel() {}, speak(value: SpeechSynthesisUtterance) { (window as any).spoken.push(value.text); value.onend?.(new Event('end') as SpeechSynthesisEvent); } } });
        window.Audio = class {
          onended = null; onerror = null;
          constructor(private url: string) {}
          play() { (window as any).played.push(this.url); return Promise.resolve(); }
          pause() {}
        } as unknown as typeof Audio;
      });
      await page.goto('/start');
      const expected = await page.evaluate(async ({ language, note, deadline, stored }) => {
        const { api } = await import('/src/webapp/api.ts');
        const result = await api.getAssignment(`demo-${language}-token`);
        if (result.contract_version !== 'worker-briefing-v2') throw new Error('Expected current briefing');
        result.context.notes = note; result.context.deadline = deadline;
        const steps = result.steps.map((step) => `${step.title} ${step.description}`);
        const quantity = result.context.quantity as { value: number; unit: string };
        const complete = [result.context.location_display, `${quantity.value} ${quantity.unit}`, deadline, ...result.context.safety, ...steps, note].join('\n');
        const old = [...result.context.safety, ...steps].join('\n');
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stored === 'old' ? old : complete));
        result.tts = { status: stored === 'missing' ? 'FALLBACK' : 'READY', audio_url: stored === 'missing' ? null : '/stored.mp3', text_hash: [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('') };
        api.getAssignment = async () => result;
        history.pushState({}, '', `/w/demo-${language}-token`); dispatchEvent(new PopStateEvent('popstate'));
        return complete;
      }, { language, note, deadline, stored });
      await expect(page.getByText(note, { exact: true })).toBeVisible();
      const noteBounds = await page.getByText(note, { exact: true }).boundingBox();
      const startBounds = await page.getByRole('button', { name: language === 'vi' ? 'Bắt đầu bước 1' : 'चरण १ सुरु गर्नुहोस्', exact: true }).boundingBox();
      expect(noteBounds!.y).toBeLessThan(startBounds!.y);
      await page.locator('details > summary').click();
      await page.getByRole('button', { name: language === 'vi' ? 'Nghe toàn bộ hướng dẫn' : 'पूरा निर्देशन सुन्नुहोस्', exact: true }).click();
      if (stored === 'current') {
        await expect.poll(() => page.evaluate(() => (window as any).played)).toEqual(['/stored.mp3']);
        expect(await page.evaluate(() => (window as any).spoken)).toEqual([]);
      } else {
        await expect.poll(() => page.evaluate(() => (window as any).spoken)).toEqual([expected]);
        expect(await page.evaluate(() => (window as any).played)).toEqual([]);
      }
      await page.getByRole('button', { name: language === 'vi' ? 'Bắt đầu bước 1' : 'चरण १ सुरु गर्नुहोस्', exact: true }).click();
      await expect(page.getByText(note, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: language === 'vi' ? 'Nghe bước này' : 'यो चरण सुन्नुहोस्', exact: true })).toHaveCount(0);
    });
  }
}
