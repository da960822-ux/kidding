const API_BASE = 'https://api.openai.com/v1';

export function createOpenAiRequests({ apiKey, model = 'gpt-5.6-terra', fetchImpl = globalThis.fetch }) {
  if (!apiKey || !fetchImpl) throw new TypeError('OPENAI_CONFIGURATION_REQUIRED');
  async function request(path, body) {
    const response = await fetchImpl(`${API_BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('OPENAI_REQUEST_FAILED');
    return response.json();
  }
  async function requestBytes(path, body) {
    const response = await fetchImpl(`${API_BASE}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('OPENAI_REQUEST_FAILED');
    return Buffer.from(await response.arrayBuffer());
  }
  async function transcription(audio, filename, contentType, languageHint) {
    const body = new FormData();
    body.append('file', new Blob([audio], { type: contentType || 'audio/wav' }), filename || 'audio.wav');
    body.append('model', 'gpt-4o-transcribe');
    if (languageHint) body.append('language', languageHint);
    const response = await fetchImpl(`${API_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body });
    if (!response.ok) throw new Error('OPENAI_REQUEST_FAILED');
    return response.json();
  }
  return {
    response: (input, format) => request('/responses', { model, input, text: { format } }),
    speech: (input, voice) => requestBytes('/audio/speech', { model: 'gpt-4o-mini-tts', input, voice, response_format: 'mp3' }),
    transcription,
    metadata: { provider: 'openai', model }
  };
}
