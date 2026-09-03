const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const OPERATIONS = new Set(['TRANSCRIBE_AUDIO', 'BUILD_OWNER_DRAFT_V2', 'MERGE_SUPPLEMENT_V2', 'PARSE_QUANTITY_CHANGE', 'BUILD_WORKER_PACKAGES_V2']);
const AUDIO_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg']);
const IDENTITY_KEYS = new Set(['owner', 'ownerid', 'farm', 'farmid', 'worker', 'workerid', 'workername', 'member', 'memberid', 'membername', 'user', 'userid', 'identity', 'nickname', 'displayname', 'firstname', 'fullname', 'nameko']);

function containsIdentity(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => IDENTITY_KEYS.has(key.replace(/[_-]/g, '').toLowerCase()) || containsIdentity(nested));
}

function decodedSize(base64) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4) return null;
  return Buffer.from(base64, 'base64').length;
}

function safeError(code) { return { ok: false, error: { code } }; }

function operationError(operation, error) {
  const cause = typeof error?.message === 'string' && /^(OPENAI_(?:CONFIGURATION_REQUIRED|REQUEST_FAILED(?:_[1-5][0-9]{2})?)|INVALID_(?:PROVIDER_RESPONSE|STRUCTURE_V2(?:_[A-Z0-9_]+)?))$/.test(error.message)
    ? error.message
    : 'FAILED';
  return safeError(`${operation}_${cause}`);
}

export async function handleJsonlLine(line, services) {
  let request;
  try { request = JSON.parse(line); } catch { return safeError('INVALID_JSONL'); }
  if (!request || typeof request !== 'object' || containsIdentity(request)) return safeError('IDENTITY_FIELD_FORBIDDEN');
  if (!OPERATIONS.has(request.operation)) return safeError('UNKNOWN_OPERATION');
  if (request.payload?.audio_base64 !== undefined) {
    const size = decodedSize(request.payload.audio_base64);
    if (size === null) return safeError('INVALID_AUDIO_BASE64');
    if (size > MAX_AUDIO_BYTES) return safeError('AUDIO_TOO_LARGE');
  }
  if (request.operation === 'TRANSCRIBE_AUDIO' && (!request.payload?.audio_base64 || (request.payload.content_type && !AUDIO_TYPES.has(request.payload.content_type)) || (request.payload.filename !== undefined && (typeof request.payload.filename !== 'string' || request.payload.filename.length > 255)))) return safeError('INVALID_AUDIO_FORMAT');
  const handlers = { TRANSCRIBE_AUDIO: services.transcribeAudio, BUILD_OWNER_DRAFT_V2: services.buildOwnerDraftV2, MERGE_SUPPLEMENT_V2: services.mergeSupplementV2, PARSE_QUANTITY_CHANGE: services.parseQuantityChange, BUILD_WORKER_PACKAGES_V2: services.buildWorkerPackagesV2 };
  try {
    const result = await handlers[request.operation](request.payload);
    if (request.operation === 'TRANSCRIBE_AUDIO') return typeof result?.transcript === 'string' && result.transcript.trim() ? { ok: true, result: { transcript: result.transcript } } : safeError('INVALID_STT_RESULT');
    return containsIdentity(result) ? safeError('IDENTITY_FIELD_FORBIDDEN') : { ok: true, result };
  } catch (error) { return operationError(request.operation, error); }
}
