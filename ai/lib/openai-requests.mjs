const API_BASE = 'https://api.openai.com/v1';

function requestFailure(response) {
  return new Error(`OPENAI_REQUEST_FAILED_${response.status}`);
}

function providerSchema(value, root = true) {
  if (Array.isArray(value)) return value.map((item) => providerSchema(item, false));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if ((root && ['allOf', 'anyOf', 'oneOf'].includes(key)) || ['if', 'then', 'else'].includes(key)) continue;
    result[key === 'oneOf' ? 'anyOf' : key] = providerSchema(nested, false);
  }
  if (!result.type && result.const !== undefined) result.type = result.const === null ? 'null' : typeof result.const;
  if (!result.type && result.enum?.length && result.enum.every((item) => typeof item === typeof result.enum[0])) result.type = typeof result.enum[0];
  return result;
}

export function createOpenAiRequests({ apiKey, model = 'gpt-5.6-terra', fetchImpl = globalThis.fetch }) {
  if (!apiKey || !fetchImpl) throw new TypeError('OPENAI_CONFIGURATION_REQUIRED');
  async function request(path, body) {
    const response = await fetchImpl(`${API_BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw requestFailure(response);
    return response.json();
  }
  async function requestBytes(path, body) {
    const response = await fetchImpl(`${API_BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw requestFailure(response);
    return Buffer.from(await response.arrayBuffer());
  }
  async function transcription(audio, filename, contentType, languageHint) {
    const body = new FormData();
    body.append('file', new Blob([audio], { type: contentType || 'audio/wav' }), filename || 'audio.wav');
    body.append('model', 'gpt-4o-transcribe');
    body.append('language', languageHint === 'ko' ? languageHint : 'ko');
    const response = await fetchImpl(`${API_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body });
    if (!response.ok) throw requestFailure(response);
    return response.json();
  }
  return {
    response: (input, format) => request('/responses', { model, input, text: { format: { ...format, schema: providerSchema(format.schema) } } }),
    speech: (input, voice) => requestBytes('/audio/speech', { model: 'gpt-4o-mini-tts', input, voice, response_format: 'mp3' }),
    transcription,
    metadata: { provider: 'openai', model }
  };
}
