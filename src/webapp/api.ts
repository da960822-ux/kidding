import type {
  ApiErrorCode,
  Briefing,
  IssuedWorkerLink,
  OverrideReason,
  OwnerWorkSession,
  OwnerSession,
  Quantity,
  QuantityChangePreview,
  NationalityCode,
  TeamMember,
  TodayWorkTeam,
  WorkDraft,
  WorkerAssignment,
} from './contracts';
import type { WorkerLocale } from './model';
import { createMockApi } from './mock-api';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const isMockApi = import.meta.env.VITE_USE_MOCK_API === 'true' || !API_BASE;

export class ApiError extends Error {
  constructor(public status: number, public code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', signal: AbortSignal.timeout(60_000), ...init });
  if (!response.ok) {
    const fallback = { code: 'INTERNAL_ERROR' as const, message: '요청을 처리하지 못했습니다. 다시 시도해주세요.' };
    const error = await response.json().catch(() => fallback) as Partial<typeof fallback>;
    throw new ApiError(response.status, error.code ?? fallback.code, error.message ?? fallback.message);
  }
  return response.json() as Promise<T>;
}

function idempotencyKey() {
  return crypto.randomUUID();
}

function audioForm(audio: Blob, fields: Record<string, string | number> = {}) {
  const form = new FormData();
  form.append('audio', audio, audio.type === 'audio/mp4' ? 'recording.mp4' : 'recording.webm');
  Object.entries(fields).forEach(([key, value]) => form.append(key, String(value)));
  return form;
}

const realApi = {
  createOwnerSession: () => request<OwnerSession>('/api/v1/owner/session', { method: 'POST' }),
  createDraft: (audio: Blob) => request<WorkDraft>('/api/v1/work-sessions/drafts/from-audio', {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: audioForm(audio, { language_hint: 'ko' }),
  }),
  supplementDraft: (draftId: string, audio: Blob, expectedDraftRevision: number) => request<WorkDraft>(`/api/v1/work-sessions/drafts/${encodeURIComponent(draftId)}/supplement`, {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: audioForm(audio, { expected_draft_revision: expectedDraftRevision, language_hint: 'ko' }),
  }),
  confirmDraft: (draftId: string, decision: 'CONFIRM' | 'PUBLISH_AS_IS', overrideReason?: OverrideReason) => request<OwnerWorkSession>(`/api/v1/work-sessions/drafts/${encodeURIComponent(draftId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(decision === 'CONFIRM'
      ? { expected_version: 0, decision }
      : { expected_version: 0, decision, ambiguity_override: true, override_reason: overrideReason }),
  }),
  listSessions: () => request<{ items: OwnerWorkSession[] }>('/api/v1/work-sessions'),
  getSession: (sessionId: string) => request<OwnerWorkSession>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}`),
  parseQuantityChange: (sessionId: string, audio: Blob, expectedVersion: number) => request<QuantityChangePreview>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}/quantity-changes/from-audio`, {
    method: 'POST', body: audioForm(audio, { expected_version: expectedVersion }),
  }),
  confirmQuantityChange: (sessionId: string, quantity: Quantity, expectedVersion: number) => request<OwnerWorkSession>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}/quantity-changes/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ quantity, expected_version: expectedVersion }),
  }),
  issueWorkerLink: (sessionId: string, languageCode: WorkerLocale) => request<IssuedWorkerLink>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}/worker-links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ language_code: languageCode }),
  }),
  getAssignment: (token: string) => request<WorkerAssignment>(`/api/v1/worker-links/${encodeURIComponent(token)}/assignment`),
  getBriefing: (sessionId: string, languageCode: WorkerLocale) => request<Briefing>(`/api/v1/brief?${new URLSearchParams({ session_id: sessionId, language_code: languageCode })}`),
  createTodayTeam: () => request<TodayWorkTeam>('/api/v1/work-teams/today', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } }),
  getTodayTeam: () => request<TodayWorkTeam>('/api/v1/work-teams/today'),
  joinTodayTeam: (token: string, input: { display_name: string; nationality_code: NationalityCode; language_code: WorkerLocale }) => request<TeamMember>(`/api/v1/work-team-invites/${encodeURIComponent(token)}/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify(input),
  }),
};

export const api = isMockApi ? createMockApi(ApiError) : realApi;
