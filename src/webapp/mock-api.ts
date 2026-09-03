import type { Briefing, IssuedWorkerLink, LocalizedWorkerContext, OverrideReason, OwnerWorkSession, Quantity, QuantityChangePreview, TeamAssignmentMeta, TeamMember, TodayWorkTeam, Translation, V2TaskCode, V2WorkerBriefing, WorkDraft, WorkerAssignment, WorkerBadgeCode, WorkerBriefing, WorkerStep } from './contracts';
import type { WorkerLocale } from './model';

type ApiErrorConstructor = new (status: number, code: 'UNAUTHORIZED' | 'NOT_FOUND' | 'ACCESS_DENIED' | 'LINK_EXPIRED' | 'VERSION_CONFLICT', message: string) => Error;
const SESSION_KEY = 'batmeori-demo-session';
const SESSIONS_KEY = 'batmeori-demo-sessions';
const TEAM_KEY = 'batmeori-demo-today-team';
const TEAM_MEMBER_KEY = 'batmeori-demo-today-team-member';
const translated = (language_code: WorkerLocale, segment: Translation['segment'], text: string): Translation => ({ language_code, segment, text, source: 'AI_TRANSLATION', verified: false, guide_lookup: 'MISS', phrase_key: null, source_page: null, source_url: null, license: null });
const steps = [
  { sequence: 1, task_code: 'ONION_HARVEST' as const, title_ko: '양파 수확', description_ko: '양파가 상하지 않게 흙에서 꺼냅니다.', video: null, audio_url: null, delivery_mode: 'TEXT_TTS' as const, unsupported_reason: null, translations: [translated('vi', 'ACTION', 'Nhổ hành tây nhẹ nhàng để không làm dập củ'), translated('ne', 'ACTION', 'प्याज नबिग्रिने गरी बिस्तारै निकाल्नुहोस्')] },
  { sequence: 2, task_code: 'ONION_TRIMMING' as const, title_ko: '양파 손질', description_ko: '수확한 양파의 흙과 마른 잎을 정리합니다.', video: null, audio_url: null, delivery_mode: 'TEXT_TTS' as const, unsupported_reason: null, translations: [translated('vi', 'ACTION', 'Làm sạch đất và lá khô của hành tây'), translated('ne', 'ACTION', 'प्याजको माटो र सुकेका पात सफा गर्नुहोस्')] },
  { sequence: 3, task_code: 'ONION_SORTING' as const, title_ko: '양파 분류', description_ko: '상한 양파를 골라 따로 둡니다.', video: null, audio_url: null, delivery_mode: 'TEXT_TTS' as const, unsupported_reason: null, translations: [translated('vi', 'ACTION', 'Phân loại hành tây bị hỏng riêng ra'), translated('ne', 'ACTION', 'बिग्रिएको प्याज छुट्टै छान्नुहोस्')] },
  { sequence: 4, task_code: 'ONION_TRANSPORT' as const, title_ko: '양파 운반', description_ko: '양파를 지정한 장소로 옮깁니다.', video: null, audio_url: null, delivery_mode: 'TEXT_TTS' as const, unsupported_reason: null, translations: [translated('vi', 'ACTION', 'Vận chuyển hành tây đến nơi được chỉ định'), translated('ne', 'ACTION', 'प्याज तोकिएको ठाउँमा लैजानुहोस्')] },
];
const draft = (): WorkDraft => { const risk_assessment = { level: 'LOW' as const, reasons: [], schema_version: '1' as const, contract_version: 'safety-policy-v1' as const }; return { draft_id: 'draft-demo-01', draft_revision: 0, summary_ko: '1번 밭에서 양파 20망을 수확하고 손질·분류한 뒤 지정 장소로 옮깁니다.', interpretation: 'READY', state: { task_family: 'ONION', location: { raw_text: '1번 밭', kind: 'NAMED', canonical_name: '1번 밭' }, location_display: '1번 밭', quantity: { value: 20, unit: '망' }, deadline: '오전 11시', safety: ['미끄러지지 않는 장화를 신으세요.'], notes: '상한 양파는 따로 모아주세요.', steps, risk_assessment }, ambiguities: [], transcript: '1번 밭 양파 스무 망 수확해서 손질하고 분류한 뒤 옮겨. 오전 열한 시까지.', schema_version: '2', contract_version: 'structure-v2', ontology_version: 'ontology-v2' }; };
let currentDraft = draft();
const loadSession = () => { const saved = window.localStorage.getItem(SESSION_KEY); return saved ? JSON.parse(saved) as OwnerWorkSession : null; };
const saveSession = (session: OwnerWorkSession) => { window.localStorage.setItem(SESSION_KEY, JSON.stringify(session)); return session; };
const loadSessions = () => {
  const saved = window.localStorage.getItem(SESSIONS_KEY);
  if (saved) return JSON.parse(saved) as OwnerWorkSession[];
  const session = loadSession();
  return session ? [session] : [];
};
const saveWorkSession = (session: OwnerWorkSession) => {
  const sessions = loadSessions();
  window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.some((item) => item.session_id === session.session_id) ? sessions.map((item) => item.session_id === session.session_id ? session : item) : [...sessions, session]));
  if (session.session_id === 'work-demo-01') saveSession(session);
  return session;
};
const createSession = (quantity: Quantity = { value: 20, unit: '망' }, version = 1): OwnerWorkSession => ({ session_id: 'work-demo-01', current_version: version, contract_version: 'structure-v2', ontology_version: 'ontology-v2', lifecycle: 'PUBLISHED', version: { version, lifecycle: 'PUBLISHED', state: { ...currentDraft.state, quantity }, transcript: currentDraft.transcript } });
const wait = <T>(value: T) => new Promise<T>((resolve) => window.setTimeout(() => resolve(value), 250));
const loadTeam = () => { const saved = window.localStorage.getItem(TEAM_KEY); return saved ? { ...(JSON.parse(saved) as TodayWorkTeam), status: 'ACTIVE' as const } : null; };
const saveTeam = (team: TodayWorkTeam) => { window.localStorage.setItem(TEAM_KEY, JSON.stringify(team)); return team; };
const contextFor = (locale: WorkerLocale, session: OwnerWorkSession): LocalizedWorkerContext => {
  const quantity = session.version.state.quantity;
  const amount = typeof quantity === 'object' && quantity ? `${quantity.value} ${locale === 'vi' ? 'bao' : 'बोरा'}` : locale === 'vi' ? 'Chưa xác định' : 'तोकिएको छैन';
  return locale === 'vi'
    ? { location_display: 'Ruộng số 1', quantity_display: amount, deadline_display: 'Trước 11 giờ sáng', safety: ['Mang ủng chống trượt.'], notes: 'Để riêng hành bị hỏng.' }
    : { location_display: 'खेत नम्बर १', quantity_display: amount, deadline_display: 'बिहान ११ बजेसम्म', safety: ['नचिप्लिने बुट लगाउनुहोस्।'], notes: 'बिग्रेको प्याज अलग राख्नुहोस्।' };
};
const legacySteps = (locale: WorkerLocale): WorkerStep[] => steps.map((step) => { const segments = step.translations.filter((item) => item.language_code === locale); const description = segments.map((item) => item.text).join('. '); return { sequence: step.sequence, task_code: step.task_code, title: description, description, video: step.video, audio_url: step.audio_url, tts_status: 'TEXT_FALLBACK', tts_hash: `demo-${locale}-${description.length}`, delivery_mode: step.delivery_mode, unsupported_reason: null, segments }; });
const legacyBriefing = (session: OwnerWorkSession, locale: WorkerLocale): WorkerBriefing => ({ contract_version: 'structure-v1', language_code: locale, session_id: session.session_id, version: session.current_version, lifecycle: 'PUBLISHED', context: contextFor(locale, session), steps: legacySteps(locale), badge_codes: ['LEGACY_READ_ONLY'] as WorkerBadgeCode[], source_detail: [] });
const hash = (seed: string) => seed.padEnd(64, '0').slice(0, 64);
const v2TaskCopy: Record<WorkerLocale, Record<V2TaskCode, { title: string; description: string }>> = {
  vi: {
    ONION_HARVEST: { title: 'Thu hoạch hành', description: 'Nhổ hành tây nhẹ nhàng để không làm dập củ.' },
    ONION_TRIMMING: { title: 'Sơ chế hành', description: 'Làm sạch đất và lá khô của hành tây.' },
    ONION_SORTING: { title: 'Phân loại hành', description: 'Để riêng những củ hành bị hỏng.' },
    ONION_TRANSPORT: { title: 'Vận chuyển hành', description: 'Chuyển hành tây đến nơi được chỉ định.' },
    STRAWBERRY_HARVEST: { title: 'Thu hoạch dâu tây', description: 'Hái dâu tây chín cẩn thận.' },
    STRAWBERRY_SORTING: { title: 'Phân loại dâu tây', description: 'Để riêng quả bị dập hoặc hỏng.' },
    STRAWBERRY_INSPECTION: { title: 'Kiểm tra dâu tây', description: 'Kiểm tra màu sắc và tình trạng quả.' },
    STRAWBERRY_PACKING: { title: 'Đóng gói dâu tây', description: 'Xếp dâu tây nhẹ tay vào hộp.' },
  },
  ne: {
    ONION_HARVEST: { title: 'प्याज निकाल्नुहोस्', description: 'प्याज नबिग्रिने गरी बिस्तारै माटोबाट निकाल्नुहोस्।' },
    ONION_TRIMMING: { title: 'प्याज सफा गर्नुहोस्', description: 'प्याजको माटो र सुकेका पात सफा गर्नुहोस्।' },
    ONION_SORTING: { title: 'प्याज छुट्याउनुहोस्', description: 'बिग्रिएका प्याज अलग राख्नुहोस्।' },
    ONION_TRANSPORT: { title: 'प्याज सार्नुहोस्', description: 'प्याज तोकिएको ठाउँमा लैजानुहोस्।' },
    STRAWBERRY_HARVEST: { title: 'स्ट्रबेरी टिप्नुहोस्', description: 'पाकेको स्ट्रबेरी सावधानीपूर्वक टिप्नुहोस्।' },
    STRAWBERRY_SORTING: { title: 'स्ट्रबेरी छुट्याउनुहोस्', description: 'कुच्चिएको वा बिग्रिएको फल अलग राख्नुहोस्।' },
    STRAWBERRY_INSPECTION: { title: 'स्ट्रबेरी जाँच्नुहोस्', description: 'फलको रङ र अवस्था जाँच्नुहोस्।' },
    STRAWBERRY_PACKING: { title: 'स्ट्रबेरी प्याक गर्नुहोस्', description: 'स्ट्रबेरीलाई बिस्तारै बाकसमा राख्नुहोस्।' },
  },
};
const v2Briefing = (session: OwnerWorkSession, locale: WorkerLocale, task_family: 'ONION' | 'STRAWBERRY' = 'ONION'): V2WorkerBriefing => {
  const quantity = session.version.state.quantity;
  const copy = locale === 'vi'
    ? { location: task_family === 'ONION' ? 'Ruộng hành số 1' : 'Ruộng dâu số 2', unit: 'bao', deadline: 'Trước 11 giờ sáng', notes: 'Để riêng nông sản bị hỏng.' }
    : { location: task_family === 'ONION' ? 'प्याज खेत नम्बर १' : 'स्ट्रबेरी खेत नम्बर २', unit: 'बोरा', deadline: 'बिहान ११ बजेसम्म', notes: 'बिग्रिएको उत्पादन अलग राख्नुहोस्।' };
  const workerSteps = session.version.state.steps.map((step) => {
    const taskCode = step.task_code && step.task_code in v2TaskCopy[locale] ? step.task_code as V2TaskCode : null;
    const localized = taskCode ? v2TaskCopy[locale][taskCode] : locale === 'vi' ? { title: 'Công việc cần xác nhận', description: 'Hãy hỏi chủ nông trại trước khi bắt đầu.' } : { title: 'पुष्टि गर्नुपर्ने काम', description: 'सुरु गर्नुअघि खेत मालिकलाई सोध्नुहोस्।' };
    return { sequence: step.sequence, task_code: taskCode, ...localized, delivery_mode: step.delivery_mode };
  });
  const actionSources = workerSteps.map((step) => ({ step_sequence: step.sequence, segment: 'ACTION' as const, source: 'AI_TRANSLATION' as const, guide_lookup: 'MISS' as const, verified: false, source_page: null, source_url: null, license: null }));
  return { session_id: session.session_id, version: session.current_version, contract_version: 'worker-briefing-v2', ontology_version: 'ontology-v2', language_code: locale, context: { task_family, location_display: copy.location, quantity: typeof quantity === 'object' && quantity ? { value: quantity.value, unit: copy.unit } : null, deadline: copy.deadline, safety: [], notes: copy.notes }, badges: ['TEXT_TTS_FALLBACK', 'DEMO_FALLBACK'], steps: workerSteps, source_detail: actionSources, tts: { status: 'FALLBACK', text_hash: hash(`${task_family}-${session.current_version}-${typeof quantity === 'object' && quantity ? quantity.value : 'unknown'}`), audio_url: null }, video: [] };
};

export function createMockApi(ApiError: ApiErrorConstructor) {
  return {
    createOwnerSession: (_pin: string) => wait({ authenticated: true as const, expires_at: new Date(Date.now() + 60 * 60_000).toISOString() }),
    createDraft: (_audio: Blob) => { currentDraft = draft(); return wait(currentDraft); },
    getDraft: (draftId: string) => draftId === currentDraft.draft_id ? wait(currentDraft) : Promise.reject(new ApiError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.')),
    supplementDraft: (_draftId: string, _audio: Blob, expectedRevision: number) => { currentDraft = { ...currentDraft, draft_revision: expectedRevision + 1, interpretation: 'READY', ambiguities: [] }; return wait(currentDraft); },
    confirmDraft: (_draftId: string, _decision: 'CONFIRM' | 'PUBLISH_AS_IS', _reason?: OverrideReason) => wait({ work_session: saveWorkSession(createSession()), issued_worker_link: null }),
    listSessions: () => wait({ items: loadSessions() }),
    getSession: (sessionId: string) => { const session = loadSessions().find((item) => item.session_id === sessionId); return session ? wait(session) : Promise.reject(new ApiError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.')); },
    parseQuantityChange: (_sessionId: string, _audio: Blob, expectedVersion: number): Promise<QuantityChangePreview> => wait({ interpretation: 'READY', quantity: { value: 15, unit: '망' }, expected_version: expectedVersion, ambiguities: [], schema_version: '1', contract_version: 'quantity-change-v1' }),
    confirmQuantityChange: (sessionId: string, quantity: Quantity, expectedVersion: number) => { const session = loadSessions().find((item) => item.session_id === sessionId); if (!session || session.current_version !== expectedVersion) return Promise.reject(new ApiError(409, 'VERSION_CONFLICT', '최신 작업 버전을 다시 확인하세요.')); return wait(saveWorkSession({ ...session, current_version: expectedVersion + 1, version: { ...session.version, version: expectedVersion + 1, state: { ...session.version.state, quantity } } })); },
    issueWorkerLink: (sessionId: string, languageCode: WorkerLocale): Promise<IssuedWorkerLink> => { const token = `demo-${languageCode}-${crypto.randomUUID().replace(/-/g, '')}`; return wait({ session_id: sessionId, issued_worker_link: { language_code: languageCode, url: `${window.location.origin}/w/${token}`, expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString() } }); },
    getAssignment: (token: string): Promise<WorkerAssignment> => { if (token.includes('expired')) return Promise.reject(new ApiError(410, 'LINK_EXPIRED', '접근할 수 없습니다.')); if (!token.startsWith('demo-')) return Promise.reject(new ApiError(404, 'ACCESS_DENIED', '접근할 수 없습니다.')); const session = loadSession() ?? saveSession(createSession()); const language_code: WorkerLocale = token.startsWith('demo-ne-') ? 'ne' : 'vi'; return wait(token.includes('legacy') ? legacyBriefing(session, language_code) : v2Briefing(session, language_code)); },
    getBriefing: (sessionId: string, languageCode: WorkerLocale): Promise<Briefing> => { const session = loadSessions().find((item) => item.session_id === sessionId); if (!session) return Promise.reject(new ApiError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.')); return wait(v2Briefing(session, languageCode, session.version.state.task_family)); },
    createTodayTeam: (): Promise<TodayWorkTeam> => { const existing = loadTeam(); if (existing && new Date(existing.expires_at) > new Date()) { const next = { ...existing, status: 'ACTIVE' as const, join_url: `${window.location.origin}/team/team-${crypto.randomUUID().replace(/-/g, '')}` }; return wait(saveTeam(next)); } const now = new Date(); const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); const expires = new Date(Math.min(now.getTime() + 24 * 60 * 60_000, dayEnd.getTime())); const token = `team-${crypto.randomUUID().replace(/-/g, '')}`; return wait(saveTeam({ team_id: crypto.randomUUID(), work_date: now.toLocaleDateString('sv-SE'), status: 'ACTIVE', join_url: `${window.location.origin}/team/${token}`, expires_at: expires.toISOString(), members: [] })); },
    getTodayTeam: (): Promise<TodayWorkTeam> => { const team = loadTeam(); return team ? wait({ ...team, join_url: null }) : Promise.reject(new ApiError(404, 'NOT_FOUND', '오늘 작업팀이 아직 없습니다.')); },
    joinTodayTeam: (token: string, input: { display_name: string; language_code: WorkerLocale }): Promise<TeamMember> => { const team = loadTeam(); if (!team?.join_url?.endsWith(`/team/${token}`)) return Promise.reject(new ApiError(404, 'ACCESS_DENIED', '참여 코드를 확인해주세요.')); if (new Date(team.expires_at) <= new Date()) return Promise.reject(new ApiError(410, 'LINK_EXPIRED', '참여 시간이 끝났습니다.')); const existing = team.members.find((member) => member.member_id === window.localStorage.getItem(TEAM_MEMBER_KEY)); if (existing) return wait(existing); const member = { member_id: crypto.randomUUID(), ...input, joined_at: new Date().toISOString(), assignment_session_ids: [] }; saveTeam({ ...team, members: [...team.members, member] }); window.localStorage.setItem(TEAM_MEMBER_KEY, member.member_id); return wait(member); },
    assignTodayTeamMember: (memberId: string, workSessionId: string): Promise<TeamAssignmentMeta> => { const team = loadTeam(); const session = loadSessions().find((item) => item.session_id === workSessionId); const member = team?.members.find((item) => item.member_id === memberId); if (!team || !member || !session) return Promise.reject(new ApiError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.')); if (!member.assignment_session_ids.includes(workSessionId)) saveTeam({ ...team, members: team.members.map((item) => item.member_id === memberId ? { ...item, assignment_session_ids: [...item.assignment_session_ids, workSessionId] } : item) }); return wait({ member_id: memberId, work_session_id: workSessionId, assigned_at: new Date().toISOString() }); },
    getMyTodayAssignments: (): Promise<WorkerAssignment[]> => { const memberId = window.localStorage.getItem(TEAM_MEMBER_KEY); const team = loadTeam(); const member = team?.members.find((item) => item.member_id === memberId); if (!member) return wait([]); return wait(member.assignment_session_ids.flatMap((sessionId) => { const session = loadSessions().find((item) => item.session_id === sessionId); return session ? [v2Briefing(session, member.language_code, session.version.state.task_family)] : []; })); },
  };
}
