import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OpenAiTransportError, requestOpenAi } from '../lib/openai-transport.mjs';

const TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_MANIFEST = resolve(ROOT, 'evals/audio/manifest.jsonl');

export const requireOpenAiKey = (env = process.env) => {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for live provider runs.');
  return env.OPENAI_API_KEY;
};

export const buildSttRequest = (audio, filename, language = 'ko') => {
  const body = new FormData();
  body.append('file', audio, filename);
  body.append('model', 'gpt-4o-transcribe');
  body.append('language', language);
  return { url: TRANSCRIPTIONS_URL, body };
};

const usage = 'usage: node ai/scripts/run-stt-smoke.mjs --output-dir <outside-git-dir> [--manifest <path>]';

function parseArgs(args) {
  const options = { manifest: DEFAULT_MANIFEST };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--help' || value === '-h') return { help: true };
    if (value === '--output-dir' || value === '--manifest') {
      if (!args[index + 1]) throw new Error(usage);
      options[value.slice(2).replace('-', '_')] = resolve(args[++index]);
    } else throw new Error(usage);
  }
  if (!options.output_dir) throw new Error(usage);
  return options;
}

const within = (parent, path) => {
  const fromParent = relative(parent, path);
  return fromParent === '' || (!fromParent.startsWith('..') && !isAbsolute(fromParent));
};

async function existingParent(path) {
  const missing = [];
  let candidate = resolve(path);
  while (true) {
    try { return { path: await realpath(candidate), missing }; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      missing.unshift(basename(candidate));
      candidate = parent;
    }
  }
}

export async function resolveOutputDirectory(path) {
  const root = await realpath(ROOT);
  const parent = await existingParent(path);
  const output = resolve(parent.path, ...parent.missing);
  if (within(root, output)) {
    throw new Error('output directory must be outside the Git workspace.');
  }
  await mkdir(output, { recursive: true });
  const resolvedOutput = await realpath(output);
  if (within(root, resolvedOutput)) throw new Error('output directory must be outside the Git workspace.');
  return resolvedOutput;
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => String(value).replaceAll(/\s+/g, ' ').trim();

export const summarizeSttResults = (results, outputDirectory) => {
  const failed = results.filter(({ status, matched_expected_transcript: matched }) => status !== 'OK' || !matched);
  return {
    total_cases: results.length,
    pass_count: results.length - failed.length,
    failure_count: failed.length,
    output_dir: outputDirectory,
    first_failure: failed[0] || null,
  };
};

async function run(options, key) {
  const manifestDirectory = resolve(options.manifest, '..');
  const records = (await readFile(options.manifest, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const results = [];

  for (const record of records) {
    const audio = await readFile(resolve(manifestDirectory, record.file));
    const request = buildSttRequest(new Blob([audio]), basename(record.file));
    let status = 'ERROR';
    let matched = false;
    let transcriptSha256 = null;
    try {
      const response = await requestOpenAi({
        url: request.url,
        key,
        body: request.body,
        headers: {},
      });
      const payload = await response.json();
      const transcript = typeof payload.text === 'string' ? payload.text : '';
      status = transcript ? 'OK' : 'EMPTY_TRANSCRIPT';
      transcriptSha256 = transcript ? hash(transcript) : null;
      matched = transcript !== '' && normalize(transcript) === normalize(record.transcript);
    } catch (error) {
      status = error instanceof OpenAiTransportError && error.status !== null
        ? `HTTP_${error.status}`
        : error instanceof OpenAiTransportError && error.type === 'timeout' ? 'TIMEOUT' : 'REQUEST_ERROR';
    }
    results.push({
      id: record.id,
      expected_case: record.expected_case,
      status,
      matched_expected_transcript: matched,
      transcript_sha256: transcriptSha256,
      model: 'gpt-4o-transcribe',
      contract_version: 'stt-v1',
    });
  }

  await writeFile(resolve(options.output_dir, 'stt-smoke-results.jsonl'), `${results.map(JSON.stringify).join('\n')}\n`, 'utf8');
  console.log(JSON.stringify(summarizeSttResults(results, options.output_dir)));
  if (results.some(({ status, matched_expected_transcript: matched }) => status !== 'OK' || !matched)) process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(usage);
  const key = requireOpenAiKey();
  options.output_dir = await resolveOutputDirectory(options.output_dir);
  await run(options, key);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
