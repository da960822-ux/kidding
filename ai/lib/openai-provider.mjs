import { createOpenAiRequests } from './openai-requests.mjs';
import { createHash } from 'node:crypto';

function outputText(response) {
  const text = response?.output_text ?? response?.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('INVALID_PROVIDER_RESPONSE');
  try { return JSON.parse(text); } catch { throw new TypeError('INVALID_PROVIDER_RESPONSE'); }
}

function nonEmpty(value) { return typeof value === 'string' && value.trim(); }

export function createOpenAiProvider({ env, fetchImpl } = {}) {
  const requests = createOpenAiRequests({ apiKey: env?.OPENAI_API_KEY, model: env?.OPENAI_MODEL || 'gpt-5.6-terra', fetchImpl });
  return {
    metadata: requests.metadata,
    async transcribe({ audio_base64, filename, content_type, language_hint }) {
      const result = await requests.transcription(Buffer.from(audio_base64, 'base64'), filename, content_type, language_hint);
      if (!nonEmpty(result?.text)) throw new TypeError('INVALID_PROVIDER_RESPONSE');
      return { transcript: result.text };
    },
    async interpretStructureV2({ prompt, transcript, schema }) {
      return outputText(await requests.response([{ role: 'user', content: `${prompt}\n<owner-transcript>${transcript}</owner-transcript>` }], { type: 'json_schema', name: 'structure_v2', strict: true, schema }));
    },
    async translate({ languageCode, text }) {
      return outputText(await requests.response([{ role: 'user', content: `Translate into ${languageCode}: ${text}` }], { type: 'json_schema', name: 'translation', strict: true, schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string', minLength: 1 } } } })).text;
    },
    async interpretQuantityChange({ prompt, transcript, expected_version, schema }) {
      return outputText(await requests.response([{ role: 'user', content: `${prompt}\n<owner-transcript>${transcript}</owner-transcript>\n<expected-version>${expected_version}</expected-version>` }], { type: 'json_schema', name: 'quantity_change_v1', strict: true, schema }));
    },
    async synthesize({ text }) {
      const audio = await requests.speech(text, env?.OPENAI_TTS_VOICE || 'alloy');
      return { status: 'READY', text_hash: createHash('sha256').update(text).digest('hex'), audio_url: null, audio_bytes_base64: audio.toString('base64') };
    }
  };
}
