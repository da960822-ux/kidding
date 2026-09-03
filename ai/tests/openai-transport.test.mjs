import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OpenAiTransportError,
  requireCompletedResponse,
  requestOpenAi,
} from '../lib/openai-transport.mjs';

test('adds the server-held key only to the Authorization request header', async () => {
  let received;
  await requestOpenAi({
    url: 'https://api.openai.com/v1/responses',
    key: 'server-only-key',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    fetchImpl: async (_url, options) => {
      received = options;
      return new Response('{}', { status: 200 });
    },
  });

  assert.equal(received.headers.Authorization, 'Bearer server-only-key');
  assert.equal(received.headers['Content-Type'], 'application/json');
});

test('does not retry a 4xx provider failure and redacts its body from the typed error', async () => {
  let calls = 0;
  await assert.rejects(
    requestOpenAi({
      url: 'https://api.openai.com/v1/responses',
      key: 'server-only-key',
      maxRetries: 1,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({
          error: { code: 'invalid_request', message: 'server-only-key transcript audio bytes' },
        }), { status: 400, headers: { 'x-request-id': 'req_123' } });
      },
    }),
    (error) => {
      assert.ok(error instanceof OpenAiTransportError);
      assert.equal(error.type, 'http');
      assert.equal(error.status, 400);
      assert.equal(error.code, 'invalid_request');
      assert.equal(error.requestId, 'req_123');
      assert.equal(error.retryable, false);
      assert.doesNotMatch(error.message, /server-only-key|transcript|audio bytes/);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('retries one retryable 429 only when explicitly enabled', async () => {
  let calls = 0;
  const response = await requestOpenAi({
    url: 'https://api.openai.com/v1/responses',
    key: 'server-only-key',
    maxRetries: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ error: { code: 'rate_limit' } }), { status: 429 })
        : new Response('{}', { status: 200 });
    },
  });

  assert.equal(calls, 2);
  assert.equal(response.status, 200);
});

test('does not retry a 429 by default', async () => {
  let calls = 0;
  await assert.rejects(
    requestOpenAi({
      url: 'https://api.openai.com/v1/responses',
      key: 'server-only-key',
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}', { status: 429 });
      },
    }),
    (error) => error instanceof OpenAiTransportError && error.retryable,
  );
  assert.equal(calls, 1);
});

test('turns an aborted request into a safe timeout error', async () => {
  await assert.rejects(
    requestOpenAi({
      url: 'https://api.openai.com/v1/audio/transcriptions',
      key: 'server-only-key',
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    }),
    (error) => error instanceof OpenAiTransportError && error.type === 'timeout' && error.retryable,
  );
});

test('rejects retry counts above one', async () => {
  await assert.rejects(
    requestOpenAi({ url: 'https://api.openai.com/v1/responses', key: 'server-only-key', maxRetries: 2 }),
    /maxRetries must be 0 or 1/,
  );
});

test('accepts only completed Responses payloads', () => {
  const payload = { status: 'completed', output: [] };
  assert.equal(requireCompletedResponse(payload), payload);
  assert.throws(
    () => requireCompletedResponse({ status: 'incomplete', output: [{ content: [{ text: 'partial transcript' }] }] }),
    (error) => error instanceof OpenAiTransportError && error.type === 'response_status' && !/partial transcript/.test(error.message),
  );
});
