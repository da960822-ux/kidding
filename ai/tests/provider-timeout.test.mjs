import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiRequests } from '../lib/openai-requests.mjs';

for (const operation of ['response', 'transcription']) {
  test(operation + ' aborts a stalled provider instead of waiting indefinitely', async () => {
    const requests = createOpenAiRequests({
      apiKey: 'fixture',
      requestTimeoutMs: 10,
      fetchImpl: (_url, init) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ ok: true, json: async () => ({ late: true }) }), 80);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(init.signal.reason);
        }, { once: true });
      }),
    });
    const call = operation === 'response'
      ? requests.response([], { schema: { type: 'object' } })
      : requests.transcription(Buffer.from('fixture'), 'fixture.wav', 'audio/wav', 'ko');
    await assert.rejects(call, { name: 'TimeoutError' });
  });
}
