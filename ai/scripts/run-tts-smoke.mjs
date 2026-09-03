import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OpenAiTransportError, requestOpenAi } from '../lib/openai-transport.mjs';
import { requireOpenAiKey, resolveOutputDirectory } from './run-stt-smoke.mjs';

const SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);

export const buildTtsRequest = (text, voice) => {
  if (text.length > 4096) throw new Error('TTS input must be at most 4096 characters.');
  if (!VOICES.has(voice)) throw new Error('voice must be a built-in OpenAI voice.');
  return {
    url: SPEECH_URL,
    body: { model: 'gpt-4o-mini-tts', input: text, voice, response_format: 'mp3' },
  };
};

const usage = 'usage: node ai/scripts/run-tts-smoke.mjs --output-dir <outside-git-dir> --id <run-id> --text <text> [--language ko|vi|ne] [--voice alloy]';

function parseArgs(args) {
  const options = { language: 'ko', voice: 'alloy' };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--help' || value === '-h') return { help: true };
    if (['--output-dir', '--id', '--text', '--language', '--voice'].includes(value)) {
      if (!args[index + 1]) throw new Error(usage);
      options[value.slice(2).replace('-', '_')] = value === '--output-dir' ? resolve(args[++index]) : args[++index];
    } else throw new Error(usage);
  }
  if (!options.output_dir || !options.id || !options.text || !['ko', 'vi', 'ne'].includes(options.language)) throw new Error(usage);
  return options;
}

const hash = (value) => createHash('sha256').update(value).digest('hex');

export const buildTtsSmokeResult = ({ id, language, text, model, voice, responseFormat, status, audioSha256, recordedAt }) => ({
  id,
  language_code: language,
  text,
  text_sha256: hash(text),
  model,
  voice,
  response_format: responseFormat,
  status,
  audio_sha256: audioSha256,
  recorded_at: recordedAt,
  contract_version: 'tts-v1',
});

export const summarizeTtsResult = (result, outputDirectory) => ({
  id: result.id,
  status: result.status,
  output_dir: outputDirectory,
});

async function run(options, key) {
  const request = buildTtsRequest(options.text, options.voice);
  let result;
  try {
    const response = await requestOpenAi({
      url: request.url,
      key,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
    });
    result = { status: 'OK', audio_sha256: hash(Buffer.from(await response.arrayBuffer())) };
  } catch (error) {
    const status = error instanceof OpenAiTransportError && error.status !== null
      ? `HTTP_${error.status}`
      : error instanceof OpenAiTransportError && error.type === 'timeout' ? 'TIMEOUT' : 'REQUEST_ERROR';
    result = { status, audio_sha256: null };
  }

  const smokeResult = buildTtsSmokeResult({
    id: options.id,
    language: options.language,
    text: options.text,
    model: request.body.model,
    voice: request.body.voice,
    responseFormat: request.body.response_format,
    status: result.status,
    audioSha256: result.audio_sha256,
    recordedAt: new Date().toISOString(),
  });
  await writeFile(resolve(options.output_dir, 'tts-smoke-results.jsonl'), `${JSON.stringify(smokeResult)}\n`, 'utf8');
  console.log(JSON.stringify(summarizeTtsResult(smokeResult, options.output_dir)));
  if (result.status !== 'OK') process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(usage);
  const key = requireOpenAiKey();
  options.output_dir = await resolveOutputDirectory(options.output_dir);
  await run(options, key);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
