import { requestOpenAi, requireCompletedResponse } from './openai-transport.mjs';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);

const audioBlob = (audio, type) => {
  if (audio instanceof Blob) return audio;
  if (ArrayBuffer.isView(audio) || audio instanceof ArrayBuffer) return new Blob([audio], { type });
  throw new TypeError('audio must be a Blob or byte array');
};

export function createOpenAiProvider({
  key = process.env.OPENAI_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 30000,
  maxRetries = 0,
} = {}) {
  const request = (options) => requestOpenAi({ key, fetchImpl, timeoutMs, maxRetries, ...options });

  return {
    async transcribe(audio, { filename = 'audio.webm', mimeType = 'audio/webm', language = 'ko' } = {}) {
      const file = audioBlob(audio, mimeType);
      if (!file.size) throw new TypeError('audio must not be empty');
      if (language !== 'ko') throw new RangeError('STT language must be ko');
      const body = new FormData();
      body.append('file', file, filename);
      body.append('model', 'gpt-4o-transcribe');
      body.append('language', language);
      const response = await request({ url: TRANSCRIPTIONS_URL, body });
      const payload = await response.json();
      return {
        text: typeof payload?.text === 'string' ? payload.text : '',
        confidence: Number.isFinite(payload?.confidence) ? payload.confidence : null,
      };
    },

    async respond(responseRequest) {
      const response = await request({
        url: RESPONSES_URL,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(responseRequest),
      });
      return requireCompletedResponse(await response.json());
    },

    async speak(text, { voice = 'alloy', responseFormat = 'mp3' } = {}) {
      if (typeof text !== 'string' || !text.trim()) throw new TypeError('TTS text is required');
      if (text.length > 4096) throw new RangeError('TTS input must be at most 4096 characters');
      if (!VOICES.has(voice)) throw new RangeError('voice must be a built-in OpenAI voice');
      if (responseFormat !== 'mp3') throw new RangeError('P0 TTS response format must be mp3');
      const response = await request({
        url: SPEECH_URL,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          input: text,
          voice,
          response_format: responseFormat,
        }),
      });
      return {
        audio: new Uint8Array(await response.arrayBuffer()),
        model: 'gpt-4o-mini-tts',
        voice,
        response_format: responseFormat,
      };
    },
  };
}
