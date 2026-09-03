import {
  buildQuantityChangeRequest,
  buildStructureRequest,
  buildSupplementRequest,
} from './openai-requests.mjs';
import {
  AiRuntimeError,
  validateQuantityChangeContract,
  validateStt,
  validateStructureContract,
} from './contracts.mjs';
import { preflightSafety } from './safety.mjs';
import { normalizeStructure } from './structure-normalization.mjs';

const requireDependency = (dependencies, name) => {
  if (typeof dependencies?.[name] !== 'function') throw new AiRuntimeError('PROVIDER_MISSING', 500);
  return dependencies[name];
};

const safeProviderStatus = (error) => (
  Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined
);

export function extractCompletedOutputText(payload) {
  if (payload?.status !== 'completed') throw new AiRuntimeError('RESPONSE_INCOMPLETE', 502);
  const content = Array.isArray(payload.output)
    ? payload.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    : [];
  if (content.some((part) => part?.type === 'refusal')) throw new AiRuntimeError('PROVIDER_REFUSAL', 502);
  if (typeof payload.output_text === 'string' && payload.output_text) return payload.output_text;
  const text = content
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  if (text) return text;
  throw new AiRuntimeError('RESPONSE_OUTPUT_MISSING', 502);
}

async function respondJson(request, dependencies) {
  let payload;
  try {
    payload = await requireDependency(dependencies, 'respond')(request);
  } catch (error) {
    if (error instanceof AiRuntimeError) throw error;
    throw new AiRuntimeError('PROVIDER_ERROR', safeProviderStatus(error));
  }
  let outputText;
  try {
    outputText = extractCompletedOutputText(payload);
  } catch (error) {
    if (error instanceof AiRuntimeError) throw error;
    throw new AiRuntimeError('PROVIDER_RESPONSE_INVALID', 502);
  }
  try {
    return JSON.parse(outputText);
  } catch {
    throw new AiRuntimeError('RESPONSE_INVALID_JSON', 502);
  }
}

const hasAudioBytes = (audio) => {
  if (audio instanceof Blob) return audio.size > 0;
  if (audio instanceof ArrayBuffer) return audio.byteLength > 0;
  if (ArrayBuffer.isView(audio)) return audio.byteLength > 0;
  return false;
};

export async function transcribeAudio(audio, dependencies, options = {}) {
  const language = options.language || options.languageHint || 'ko';
  if (language !== 'ko') throw new AiRuntimeError('LANGUAGE_UNSUPPORTED', 422);
  if (!hasAudioBytes(audio)) throw new AiRuntimeError('AUDIO_EMPTY', 422);
  const providerOptions = { language };
  if (options.filename !== undefined) {
    if (typeof options.filename !== 'string' || !/^[^\\/\r\n]{1,255}$/.test(options.filename)) {
      throw new AiRuntimeError('AUDIO_METADATA_INVALID', 422);
    }
    providerOptions.filename = options.filename;
  }
  if (options.mimeType !== undefined) {
    if (!['audio/webm', 'audio/mp4'].includes(options.mimeType)) throw new AiRuntimeError('AUDIO_METADATA_INVALID', 422);
    providerOptions.mimeType = options.mimeType;
  }
  let result;
  try {
    result = await requireDependency(dependencies, 'transcribe')(audio, providerOptions);
  } catch (error) {
    if (error instanceof AiRuntimeError) throw error;
    throw new AiRuntimeError('PROVIDER_ERROR', safeProviderStatus(error));
  }
  const transcript = typeof result?.transcript === 'string' ? result.transcript : result?.text;
  if (typeof transcript !== 'string' || !transcript.trim()) throw new AiRuntimeError('TRANSCRIPT_EMPTY', 502);
  const output = {
    transcript: transcript.trim(),
    language_code: result?.language_code || language,
    confidence: typeof result?.confidence === 'number' ? result.confidence : null,
    schema_version: '1',
    contract_version: 'stt-v1',
  };
  return validateStt(output);
}

export async function interpretTranscript(transcript, dependencies) {
  if (typeof transcript !== 'string' || !transcript.trim()) throw new AiRuntimeError('TRANSCRIPT_EMPTY', 422);
  const output = await respondJson(buildStructureRequest(transcript.trim()), dependencies);
  if (!Array.isArray(output?.steps) || !output.steps.every((step, index) => step?.sequence === index + 1)) {
    return validateStructureContract(output);
  }
  return validateStructureContract(normalizeStructure(transcript.trim(), output));
}

export async function mergeSupplement({ baseTranscript, baseStructure, supplementTranscript }, dependencies) {
  if (typeof baseTranscript !== 'string' || !baseTranscript.trim() || typeof supplementTranscript !== 'string' || !supplementTranscript.trim()) {
    throw new AiRuntimeError('TRANSCRIPT_EMPTY', 422);
  }
  validateStructureContract(baseStructure);
  const transcript = `${baseTranscript.trim()}\n${supplementTranscript.trim()}`;
  const output = await respondJson(
    buildSupplementRequest(baseTranscript.trim(), baseStructure, supplementTranscript.trim()),
    dependencies,
  );
  const structure = !Array.isArray(output?.steps) || !output.steps.every((step, index) => step?.sequence === index + 1)
    ? validateStructureContract(output)
    : validateStructureContract(normalizeStructure(transcript, output));
  return draftPreflight(transcript, structure);
}

export async function interpretQuantityChange(transcript, expectedVersion, dependencies) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new AiRuntimeError('EXPECTED_VERSION_INVALID', 422);
  if (typeof transcript !== 'string' || !transcript.trim()) throw new AiRuntimeError('TRANSCRIPT_EMPTY', 422);
  const output = await respondJson(buildQuantityChangeRequest(transcript.trim(), expectedVersion), dependencies);
  validateQuantityChangeContract(output);
  if (output.expected_version !== expectedVersion) throw new AiRuntimeError('SCHEMA_INVALID', 422);
  return output;
}

function draftPreflight(transcript, structure) {
  const riskAssessment = preflightSafety(structure);
  const blockers = [];
  if (structure.ambiguities.some(({ blocking }) => blocking)) blockers.push('BLOCKING_AMBIGUITY');
  if (!structure.steps.length) blockers.push('NO_EXECUTABLE_STEP');
  if (riskAssessment.level !== 'LOW') blockers.push(`RISK_${riskAssessment.level}`);
  const requiresOwnerDecision = structure.interpretation !== 'READY'
    || structure.ambiguities.length > 0
    || structure.steps.some(({ task_code: taskCode }) => taskCode === null);
  const overrideAllowed = blockers.length === 0 && requiresOwnerDecision
    && !structure.ambiguities.some(({ blocking, kind }) => blocking || kind === 'SAFETY');
  return {
    transcript,
    structure,
    risk_assessment: riskAssessment,
    publishable: blockers.length === 0 && !requiresOwnerDecision,
    requires_owner_decision: requiresOwnerDecision,
    override_allowed: overrideAllowed,
    blockers,
  };
}

export async function buildOwnerDraft(audio, dependencies, audioOptions = {}) {
  const stt = await transcribeAudio(audio, dependencies, audioOptions);
  const structure = await interpretTranscript(stt.transcript, dependencies);
  return draftPreflight(stt.transcript, structure);
}
