const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class OpenAiTransportError extends Error {
  constructor({ type, status = null, code = null, requestId = null, retryable = false }) {
    super(`OpenAI request failed: ${type}${status ? ` (${status})` : ''}${code ? ` [${code}]` : ''}`);
    this.name = 'OpenAiTransportError';
    this.type = type;
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function validateOptions({ key, maxRetries, timeoutMs }) {
  if (typeof key !== 'string' || !key) throw new Error('OPENAI_API_KEY is required for live provider runs.');
  if (![0, 1].includes(maxRetries)) throw new RangeError('maxRetries must be 0 or 1.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new RangeError('timeoutMs must be a positive integer.');
}

async function providerError(response) {
  let code = null;
  try {
    const payload = await response.json();
    if (/^[a-z0-9_:-]{1,128}$/i.test(payload?.error?.code || '')) code = payload.error.code;
  } catch { /* provider body is intentionally not surfaced */ }
  return new OpenAiTransportError({
    type: 'http',
    status: response.status,
    code,
    requestId: response.headers.get('x-request-id'),
    retryable: RETRYABLE_STATUS.has(response.status),
  });
}

function requestError(error, timedOut) {
  return new OpenAiTransportError({
    type: timedOut ? 'timeout' : 'network',
    retryable: true,
  });
}

export async function requestOpenAi({
  url,
  key,
  body,
  headers = {},
  fetchImpl = fetch,
  timeoutMs = 30000,
  maxRetries = 0,
  sleep = delay,
}) {
  validateOptions({ key, maxRetries, timeoutMs });

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let failure;
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${key}` },
        body,
        signal: controller.signal,
      });
      if (response.ok) return response;
      failure = await providerError(response);
    } catch (error) {
      failure = requestError(error, controller.signal.aborted);
    } finally {
      clearTimeout(timeout);
    }
    if (!failure.retryable || attempt === maxRetries) throw failure;
    await sleep(0);
  }
  throw new Error('unreachable');
}

export function requireCompletedResponse(payload) {
  if (payload?.status === 'completed') return payload;
  throw new OpenAiTransportError({ type: 'response_status', retryable: false });
}
