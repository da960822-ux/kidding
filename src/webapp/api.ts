import type {
  ApiErrorCode,
  Briefing,
  IssuedWorkerLink,
  InitialPublishResult,
  OverrideReason,
  OwnerWorkSession,
  OwnerSession,
  Quantity,
  QuantityChangePreview,
  TeamAssignmentMeta,
  TeamMember,
  TodayWorkTeam,
  WorkDraft,
  WorkerAssignment,
  WorkerBriefing,
} from './contracts';
import type { WorkerLocale } from './model';
import { createMockApi } from './mock-api';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const isMockApi = import.meta.env.VITE_USE_MOCK_API === 'true';

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

function presentDraft(value: WorkDraft): WorkDraft {
  return { ...value, risk_assessment: value.state.risk_assessment } as WorkDraft;
}

const realApi = {
  createOwnerSession: (pin: string) => request<OwnerSession>('/api/v1/owner/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
  }),
  createDraft: async (audio: Blob) => presentDraft(await request<WorkDraft>('/api/v1/work-sessions/drafts/from-audio', {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: audioForm(audio, { language_hint: 'ko' }),
  })),
  supplementDraft: async (draftId: string, audio: Blob, expectedDraftRevision: number) => presentDraft(await request<WorkDraft>(`/api/v1/work-sessions/drafts/${encodeURIComponent(draftId)}/supplement`, {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: audioForm(audio, { expected_draft_revision: expectedDraftRevision, language_hint: 'ko' }),
  })),
  confirmDraft: async (draftId: string, decision: 'CONFIRM' | 'PUBLISH_AS_IS', overrideReason?: OverrideReason): Promise<InitialPublishResult> => {
    const result = await request<{ work_session: OwnerWorkSession; issued_worker_links: Array<IssuedWorkerLink['issued_worker_link']> }>(`/api/v1/work-sessions/drafts/${encodeURIComponent(draftId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() },
    body: JSON.stringify(decision === 'CONFIRM'
      ? { expected_version: 0, decision }
      : { expected_version: 0, decision, ambiguity_override: true, override_reason: overrideReason }),
    });
    return { work_session: result.work_session, issued_worker_link: result.issued_worker_links[0] ? { session_id: result.work_session.session_id, issued_worker_link: result.issued_worker_links[0] } : null };
  },
  listSessions: () => request<{ items: OwnerWorkSession[] }>('/api/v1/work-sessions'),
  getSession: (sessionId: string) => request<OwnerWorkSession>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}`),
  parseQuantityChange: (sessionId: string, audio: Blob, expectedVersion: number) => request<QuantityChangePreview>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}/quantity-changes/from-audio`, {
    method: 'POST', headers: {}, body: audioForm(audio, { expected_version: expectedVersion, language_hint: 'ko' }),
  }),
  confirmQuantityChange: (sessionId: string, quantity: Quantity, expectedVersion: number) => request<OwnerWorkSession>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}/quantity-changes/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ quantity, expected_version: expectedVersion }),
  }),
  issueWorkerLink: async (sessionId: string, languageCode: WorkerLocale) => {
    const result = await request<{ session_id: string; issued_worker_links: Array<{ language_code: WorkerLocale; url: string; expires_at: string }> }>(`/api/v1/work-sessions/${encodeURIComponent(sessionId)}/worker-links`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ language_code: languageCode }),
    });
    return { session_id: result.session_id, issued_worker_link: result.issued_worker_links[0] } as IssuedWorkerLink;
  },
  getAssignment: (token: string) => request<WorkerBriefing>(`/api/v1/worker-links/${encodeURIComponent(token)}/assignment`),
  getBriefing: (sessionId: string, languageCode: WorkerLocale) => request<WorkerBriefing>(`/api/v1/brief?${new URLSearchParams({ session_id: sessionId, language_code: languageCode })}`),
  createTodayTeam: () => request<TodayWorkTeam>('/api/v1/work-teams/today', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() } }),
  getTodayTeam: () => request<TodayWorkTeam>('/api/v1/work-teams/today'),
  joinTodayTeam: (token: string, input: { display_name: string; language_code: WorkerLocale }) => request<TeamMember>(`/api/v1/work-team-invites/${encodeURIComponent(token)}/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify(input),
  }),
  assignTodayTeamMember: (memberId: string, workSessionId: string) => request<TeamAssignmentMeta>(`/api/v1/work-teams/today/members/${encodeURIComponent(memberId)}/assignments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify({ work_session_id: workSessionId }),
  }),
  getMyTodayAssignments: async () => {
    const result = await request<{ assignments: WorkerAssignment[] }>('/api/v1/work-team-members/me/assignments');
    return result.assignments;
  },
};

export const api = isMockApi ? createMockApi(ApiError) : realApi;
