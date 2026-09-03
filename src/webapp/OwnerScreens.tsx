import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Copy,
  Expand, Mic, Package, Pause, Play, RefreshCw,
  QrCode, Sparkles, Sprout, Truck, UsersRound, Volume2, Warehouse,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, isMockApi } from './api';
import type { Briefing, IssuedWorkerLink, LegacyWorkerBriefing, OverrideReason, OwnerWorkSession, QuantityChangePreview, TodayWorkTeam, WorkDraft, WorkStep } from './contracts';
import type { AppScreen, ScreenProps, WorkerLocale } from './model';
import { ActionButton, Callout, FactRow, PageHeading, Panel, PanelHeader, StatusBadge } from './ScreenUI';

interface OwnerScreenProps extends ScreenProps {
  workerLocale: WorkerLocale;
  setWorkerLocale: (locale: WorkerLocale) => void;
  draft: WorkDraft | null;
  setDraft: (draft: WorkDraft | null) => void;
  session: OwnerWorkSession | null;
  setSession: (session: OwnerWorkSession | null) => void;
  sessionId: string | null;
  issuedWorkerLink: IssuedWorkerLink | null;
  setIssuedWorkerLink: (link: IssuedWorkerLink | null) => void;
}

const stepIcons = { ONION_HARVEST: Sprout, ONION_TRIMMING: Sprout, ONION_SORTING: Package, ONION_TRANSPORT: Truck, STRAWBERRY_HARVEST: Sprout, STRAWBERRY_SORTING: Package, STRAWBERRY_INSPECTION: Warehouse, STRAWBERRY_PACKING: Package };
const overrideLabels: Record<OverrideReason, string> = {
  EXPERIENCED_WORKER: '숙련된 작업자가 수행해요', IN_PERSON_BRIEFING: '현장에서 직접 설명할게요', OWNER_ACCEPTED_OTHER: '내용을 확인하고 그대로 전달해요',
};

function errorText(reason: unknown) {
  if (reason instanceof DOMException && reason.name === 'TimeoutError') return '처리 시간이 초과됐습니다. 다시 시도해주세요.';
  if (reason instanceof ApiError) {
    if (reason.code === 'UNAUTHORIZED') return '농장주 연결 시간이 끝났습니다. 다시 연결해주세요.';
    if (reason.code === 'VERSION_CONFLICT') return '작업이 이미 변경됐습니다. 최신 내용을 다시 확인해주세요.';
    if (reason.code === 'OVERRIDE_NOT_ALLOWED') return '안전상 이 내용은 그대로 전달할 수 없습니다. 지시를 보완해주세요.';
    return reason.message;
  }
  return '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.';
}

function quantityText(value: OwnerWorkSession['version']['state']['quantity']) {
  return typeof value === 'object' && value ? `${value.value}${value.unit}` : '미확정';
}

function VoiceRecorder({ helper, submitLabel = '음성 제출', onSubmit }: { helper: string; submitLabel?: string; onSubmit: (audio: Blob) => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'loading'>('idle');
  const [audio, setAudio] = useState<Blob | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const stop = () => recorder.current?.state === 'recording' && recorder.current.stop();
  const start = async () => {
    setError(''); setAudio(null); setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('이 브라우저에서는 녹음할 수 없습니다. 최신 Chrome 또는 Safari로 열어주세요.'); return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream.current);
      chunks.current = [];
      next.ondataavailable = (event) => event.data.size > 0 && chunks.current.push(event.data);
      next.onstop = () => {
        const blob = new Blob(chunks.current, { type: next.mimeType || 'audio/webm' });
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null; setAudio(blob); setState('done');
      };
      recorder.current = next; next.start(); setState('recording');
      timer.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch { setError('마이크 권한을 허용한 뒤 다시 시도해주세요.'); }
  };
  const submit = async () => {
    if (!audio) return;
    if (audio.size > 10 * 1024 * 1024) { setError('녹음이 10MiB를 넘었습니다. 짧게 다시 녹음해주세요.'); return; }
    setState('loading'); setError('');
    try { await onSubmit(audio); setState('idle'); setAudio(null); } catch (reason) { setState('done'); setError(errorText(reason)); }
  };
  useEffect(() => {
    if (state !== 'recording' && timer.current) { window.clearInterval(timer.current); timer.current = null; }
    if (seconds >= 60) stop();
  }, [seconds, state]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); stream.current?.getTracks().forEach((track) => track.stop()); }, []);
  const title = state === 'recording' ? '듣고 있습니다' : state === 'done' ? '녹음이 완료됐어요' : state === 'loading' ? 'AI가 내용을 정리하고 있어요' : '말로 알려주세요';
  return <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl bg-[#E8F2E3] p-6 text-center">
    <button type="button" onClick={state === 'recording' ? stop : start} disabled={state === 'loading'} aria-label={state === 'recording' ? '녹음 중지' : '녹음 시작'} className={`flex h-28 w-28 items-center justify-center rounded-full text-white shadow-[0_16px_35px_rgba(47,93,53,0.25)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${state === 'recording' ? 'animate-pulse bg-[#A83F38]' : 'bg-deep hover:bg-[#244D2B]'}`}>
      {state === 'recording' ? <Pause className="h-11 w-11" /> : <Mic className="h-12 w-12" />}
    </button>
    <h2 className="mt-6 text-2xl font-black">{title}</h2>
    <p className="mt-2 font-medium text-muted">{state === 'recording' ? `${seconds}초 / 60초` : helper}</p>
    {error && <p role="alert" className="mt-5 max-w-md rounded-xl bg-[#FDE7E4] px-4 py-3 font-bold text-[#8A302B]">{error}</p>}
    {state === 'recording' && <ActionButton className="mt-5" variant="danger" onClick={stop}>그만 말하기</ActionButton>}
    {state === 'done' && <div className="mt-5 flex flex-wrap justify-center gap-3"><ActionButton variant="secondary" onClick={start}><RefreshCw className="h-5 w-5" />다시 녹음</ActionButton><ActionButton onClick={submit}>{submitLabel}<ArrowRight className="h-5 w-5" /></ActionButton></div>}
    {isMockApi && state === 'idle' && <ActionButton className="mt-5" variant="quiet" onClick={async () => { setState('loading'); try { await onSubmit(new Blob(['demo'], { type: 'audio/webm' })); setState('idle'); } catch (reason) { setState('idle'); setError(errorText(reason)); } }}>데모 음성으로 진행</ActionButton>}
  </div>;
}

function StorySteps({ steps }: { steps: WorkStep[] }) {
  return <ol>{steps.map((step) => {
    const Icon = step.task_code && step.task_code in stepIcons ? stepIcons[step.task_code as keyof typeof stepIcons] : AlertTriangle;
    const videoReady = step.video?.review_status === 'APPROVED' && step.video.safety_level === 'LOW';
    return <li key={step.sequence} className="grid gap-4 border-b border-deep/10 py-4 last:border-0 sm:grid-cols-[64px_1fr_auto] sm:items-center">
      <span className="flex h-14 w-16 items-center justify-center rounded-2xl bg-sage text-deep"><Icon className="h-7 w-7" /></span>
      <div><h3 className="text-lg font-black">{step.sequence}. {step.title_ko}</h3><p className="mt-1 font-medium leading-7 text-muted">{step.description_ko}</p>{step.unsupported_reason && <p className="mt-1 text-sm font-bold text-[#805D09]">미지원 작업 · {step.unsupported_reason}</p>}</div>
      <div className="text-sm font-extrabold text-primary">{videoReady ? '검수 영상' : '텍스트·음성'}<div className="mt-2 flex flex-wrap gap-1">{step.translations.map((item, index) => <small key={`${item.language_code}-${item.segment}-${index}`} className="rounded-full bg-[#EEF0EC] px-2 py-1 text-xs text-muted">{item.segment} · {item.source === 'OFFICIAL_GUIDE' && item.verified ? '검수 가이드' : item.source === 'DETERMINISTIC' ? '규칙 변환' : 'AI 번역'}</small>)}</div></div>
    </li>;
  })}</ol>;
}

function EmptySession({ go }: ScreenProps) {
  return <><PageHeading title="작업을 불러오지 못했어요" description="진행 중 작업 목록에서 다시 선택해주세요." /><ActionButton onClick={() => go('owner-home')}>홈으로</ActionButton></>;
}

export function OwnerHomeScreen({ go, session, setSession }: OwnerScreenProps) {
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; const load = async () => { setLoading(true); setError(''); try { const { items } = await api.listSessions(); if (active) setSession(items[0] ?? null); } catch (reason) { if (reason instanceof ApiError && reason.code === 'UNAUTHORIZED') { const pin = window.prompt('농장주 PIN을 입력하세요.'); try { if (pin) { await api.createOwnerSession(pin); const { items } = await api.listSessions(); if (active) setSession(items[0] ?? null); return; } } catch { /* show original error */ } } if (active) setError(errorText(reason)); } finally { if (active) setLoading(false); } }; void load(); return () => { active = false; }; }, [retry]);
  return <><PageHeading title="오늘 어떤 작업을 시킬까요?" description="평소 말투 그대로 말씀하세요. AI가 추측하지 않고 정리합니다." />
    <button type="button" onClick={() => go('owner-record')} className="mb-7 flex min-h-[220px] w-full flex-col items-center justify-center rounded-2xl bg-[#E9F1E5] p-7 text-center transition hover:bg-sage focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><span className="flex h-24 w-24 items-center justify-center rounded-full bg-deep text-white"><Mic className="h-11 w-11" /></span><strong className="mt-5 text-2xl font-black text-deep">새 작업 지시하기</strong><span className="mt-2 font-bold text-muted">버튼을 누르고 말해주세요</span></button>
    <ActionButton className="mb-7 w-full" variant="secondary" onClick={() => go('owner-team')}><QrCode className="h-6 w-6" />오늘 작업팀 QR 만들기</ActionButton>
    <h2 className="mb-4 text-xl font-black">최근 작업</h2>{loading ? <div className="h-36 animate-pulse rounded-2xl bg-sage/40" aria-label="작업을 불러오는 중" /> : error ? <div><Callout>{error}</Callout><ActionButton className="mt-4" onClick={() => setRetry((value) => value + 1)}>다시 연결</ActionButton></div> : session ? <button type="button" onClick={() => go('owner-current')} className="w-full rounded-2xl bg-white p-5 text-left shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><div className="flex justify-between gap-3"><strong className="text-xl">양파 작업</strong><StatusBadge>v{session.current_version}</StatusBadge></div><p className="mt-2 font-bold text-muted">{session.version.state.location_display} · {quantityText(session.version.state.quantity)}</p></button> : <div className="rounded-2xl border border-dashed border-deep/20 bg-white p-8 text-center"><Sprout className="mx-auto h-10 w-10 text-primary/50" /><h3 className="mt-4 text-xl font-black">진행 중인 작업이 없어요</h3></div>}
  </>;
}

export function OwnerTodayTeamScreen({ go }: OwnerScreenProps) {
  const [team, setTeam] = useState<TodayWorkTeam | null>(null); const [sessions, setSessions] = useState<OwnerWorkSession[]>([]); const [selected, setSelected] = useState<Record<string, string>>({}); const [assigning, setAssigning] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [copyStatus, setCopyStatus] = useState('');
  const showTeam = (next: TodayWorkTeam) => setTeam(next);
  useEffect(() => { let active = true; Promise.all([api.getTodayTeam(), api.listSessions()]).then(([next, result]) => { if (active) { showTeam(next); setSessions(result.items); } }).catch((reason) => { if (active && (!(reason instanceof ApiError) || reason.code !== 'NOT_FOUND')) setError(errorText(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!team) return; const timer = window.setInterval(() => api.getTodayTeam().then(showTeam).catch((reason) => setError(errorText(reason))), 4000); return () => window.clearInterval(timer); }, [team?.team_id]);
  const create = async () => { setLoading(true); setError(''); try { await showTeam(await api.createTodayTeam()); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } };
  const assign = async (memberId: string, workSessionId: string) => { if (!workSessionId) return; setAssigning(memberId); setError(''); try { await api.assignTodayTeamMember(memberId, workSessionId); showTeam(await api.getTodayTeam()); } catch (reason) { setError(errorText(reason)); } finally { setAssigning(null); } };
  const copy = async () => { if (!team?.join_url) return; try { await navigator.clipboard.writeText(team.join_url); setCopyStatus('참여 링크를 복사했어요.'); } catch { setCopyStatus('복사하지 못했어요. 링크를 길게 눌러 복사해주세요.'); } };
  const qr = team?.join_url ? <Panel className="text-center"><PanelHeader title="근로자에게 보여주세요" aside={<StatusBadge>오늘만</StatusBadge>} /><div className="mx-auto mt-4 w-full max-w-[320px] rounded-2xl bg-white p-3"><QRCodeSVG value={team.join_url} size={320} level="M" marginSize={4} fgColor="#173F24" bgColor="#FFFFFF" title="오늘 작업팀 참여 QR 코드" className="h-auto w-full" /></div><p className="mt-4 break-all text-base font-bold text-muted">{team.join_url}</p><ActionButton className="mt-4 w-full" variant="secondary" onClick={copy}><Copy className="h-5 w-5" />참여 링크 복사</ActionButton>{copyStatus && <p role="status" className="mt-3 font-bold text-deep">{copyStatus}</p>}<p className="mt-4 text-base font-bold text-muted">만료 {new Date(team.expires_at).toLocaleString('ko-KR')}</p></Panel> : <Panel className="text-center"><PanelHeader title="새 QR이 필요해요" /><p className="mt-5 font-bold text-muted">QR 원문은 저장하지 않아 다시 표시할 때 새로 발급합니다.</p><ActionButton className="mt-5 w-full" disabled={loading} onClick={create}><QrCode className="h-5 w-5" />QR 표시</ActionButton></Panel>;
  return <><PageHeading title="오늘 작업팀" description="QR 하나를 보여주면 근로자가 별명과 안내 언어를 직접 선택합니다." action={<ActionButton variant="secondary" onClick={() => go('owner-home')}><ArrowLeft className="h-5 w-5" />홈으로</ActionButton>} />
    {!team ? <Panel className="mx-auto max-w-2xl text-center"><span className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-sage text-deep"><UsersRound className="h-10 w-10" /></span><h2 className="mt-5 text-2xl font-black">오늘 함께 일할 팀을 여세요</h2><p className="mt-3 text-lg font-bold leading-8 text-muted">계정이나 전화번호는 필요 없습니다.<br />오늘 사용할 QR만 만들어집니다.</p><ActionButton className="mt-6 w-full" disabled={loading} onClick={create}><QrCode className="h-6 w-6" />{loading ? '확인하고 있어요…' : '오늘 작업팀 열기'}</ActionButton>{error && <p role="alert" className="mt-4 text-base font-bold text-[#8A302B]">{error}</p>}</Panel> : <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">{qr}<Panel><PanelHeader title="참여한 근로자" aside={<StatusBadge tone="blue">{team.members.length}명</StatusBadge>} />{team.members.length ? <ul className="grid gap-3" aria-live="polite">{team.members.map((member) => { const selectedSession = selected[member.member_id] ?? member.assignment_session_ids[0] ?? sessions[0]?.session_id ?? ''; const assignments = sessions.filter((item) => member.assignment_session_ids.includes(item.session_id)); return <li key={member.member_id} className="rounded-2xl bg-[#F2F6F0] p-4"><div className="flex items-center justify-between gap-3"><div><strong className="block text-xl">{member.display_name}</strong><span className="mt-1 block text-base font-bold text-muted">{member.language_code === 'vi' ? '베트남어' : '네팔어'}</span></div><span className="h-3 w-3 rounded-full bg-[#3D8A4C]" aria-label="참여 완료" /></div>{assignments.length > 0 && <p aria-label={`${member.display_name} 배정 작업`} className="mt-3 text-sm font-bold text-muted">{assignments.map((item) => `${item.version.state.steps.map((step) => step.title_ko).join(' · ') || '작업'} · v${item.current_version}`).join(' / ')}</p>}<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"><select aria-label={`${member.display_name} 작업 선택`} value={selectedSession} onChange={(event) => setSelected((value) => ({ ...value, [member.member_id]: event.target.value }))} className="min-h-12 rounded-xl border border-deep/20 bg-white px-3 font-bold"><option value="">게시된 작업을 선택하세요</option>{sessions.map((item) => <option key={item.session_id} value={item.session_id}>{item.version.state.steps.map((step) => step.title_ko).join(' · ') || '작업'} · v{item.current_version}</option>)}</select><ActionButton disabled={!selectedSession || assigning === member.member_id} onClick={() => assign(member.member_id, selectedSession)}>{assigning === member.member_id ? '배정 중…' : member.assignment_session_ids.includes(selectedSession) ? '배정됨' : '이 작업 배정'}</ActionButton></div></li>; })}</ul> : <div className="rounded-2xl border border-dashed border-deep/20 p-8 text-center"><UsersRound className="mx-auto h-10 w-10 text-primary/50" /><h3 className="mt-4 text-xl font-black">아직 참여한 근로자가 없어요</h3><p className="mt-2 text-base font-bold text-muted">QR을 스캔하면 여기에 바로 표시됩니다.</p></div>}{!sessions.length && <div className="mt-4"><Callout>먼저 게시된 작업을 만든 뒤 근로자에게 배정해주세요.</Callout></div>}{error && <p role="alert" className="mt-4 text-base font-bold text-[#8A302B]">{error}</p>}</Panel></div>}
  </>;
}

export function OwnerRecordScreen({ go, setDraft }: OwnerScreenProps) {
  return <><PageHeading title="평소 말투 그대로 말씀하세요" description="장소, 작업, 수량, 완료 시간을 함께 말하면 더 정확해요." /><div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]"><VoiceRecorder helper="전라도 사투리도 괜찮아요." onSubmit={async (audio) => { const next = await api.createDraft(audio); setDraft(next); go('owner-review'); }} /><Panel><PanelHeader title="녹음 안내" aside={<StatusBadge>최대 60초</StatusBadge>} /><Callout safe>원음은 처리 중에만 사용되고 서버에서 즉시 삭제됩니다.</Callout><p className="mt-5 font-medium leading-7 text-muted">예: “1번 밭 양파 스무 망 캐서 망에 담아. 오전 열한 시까지 해줘.”</p></Panel></div></>;
}

export function OwnerReviewScreen({ go, draft, setDraft, setSession, workerLocale, setWorkerLocale, setIssuedWorkerLink }: OwnerScreenProps) {
  const [reason, setReason] = useState<OverrideReason | ''>(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  if (!draft) return <><PageHeading title="확인할 작업이 없어요" description="먼저 작업 지시를 녹음해주세요." /><ActionButton onClick={() => go('owner-record')}><Mic className="h-5 w-5" />작업 지시하기</ActionButton></>;
  const blocked = draft.risk_assessment.level !== 'LOW' || draft.state.steps.length === 0 || draft.ambiguities.some((item) => item.blocking || item.kind === 'SAFETY');
  const needsOverride = draft.interpretation !== 'READY' || draft.ambiguities.length > 0;
  const confirm = async () => {
    if (needsOverride && !reason) { setError('그대로 전달하는 이유를 직접 선택해주세요.'); return; }
    setLoading(true); setError('');
    try { const next = await api.confirmDraft(draft.draft_id, needsOverride ? 'PUBLISH_AS_IS' : 'CONFIRM', needsOverride ? reason || undefined : undefined); setSession(next.work_session); setIssuedWorkerLink(next.issued_worker_link); go('owner-storyboard'); }
    catch (cause) { setError(errorText(cause)); } finally { setLoading(false); }
  };
  return <><PageHeading title="제가 이렇게 이해했어요" description="AI는 추측하지 않습니다. 미확정 내용은 농장주가 결정해주세요." />
    <Panel className="mx-auto max-w-4xl"><div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sage text-deep"><Sparkles className="h-8 w-8" /></span><p className="mx-auto mt-6 max-w-3xl text-2xl font-black leading-10 sm:text-3xl">{draft.summary_ko}</p></div>
      {draft.ambiguities[0] && <div className="mt-6"><Callout><strong>{draft.ambiguities[0].blocking ? '반드시 보완' : '확인 필요'} · {draft.ambiguities[0].message}</strong></Callout></div>}
      {blocked && <div className="mt-6"><div role="alert" className="rounded-2xl bg-[#8A302B] p-5 text-white"><strong className="text-xl">위험 판정 {draft.risk_assessment.level} · 지금은 전달할 수 없습니다.</strong><ul className="mt-3 list-disc space-y-1 pl-6 text-base font-bold">{draft.risk_assessment.reasons.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-3 text-lg font-black">안전 내용과 빠진 작업을 다시 말씀하세요.</p></div><div className="mt-4"><VoiceRecorder helper="안전 내용 또는 빠진 내용 한 가지만 말해주세요." submitLabel="보완 내용 제출" onSubmit={async (audio) => setDraft(await api.supplementDraft(draft.draft_id, audio, draft.draft_revision))} /></div></div>}
      {!blocked && needsOverride && <div className="mt-6"><label htmlFor="override-reason" className="font-extrabold">그대로 전달하는 이유</label><select id="override-reason" value={reason} onChange={(event) => setReason(event.target.value as OverrideReason)} className="mt-2 min-h-14 w-full rounded-xl border border-deep/20 bg-white px-4 text-base font-bold"><option value="">이유를 선택해주세요</option>{Object.entries(overrideLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      {error && <p role="alert" className="mt-5 rounded-xl bg-[#FDE7E4] p-4 font-bold text-[#8A302B]">{error}</p>}
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><ActionButton variant="secondary" onClick={() => { const speech = new SpeechSynthesisUtterance(draft.summary_ko); speech.lang = 'ko-KR'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech); }}><Volume2 className="h-5 w-5" />다시 듣기</ActionButton><ActionButton disabled={blocked || loading || (needsOverride && !reason)} onClick={confirm}><Check className="h-5 w-5" />{loading ? '확정하고 있어요…' : needsOverride ? '이대로 전달' : '맞아, 확정하기'}</ActionButton><ActionButton variant="quiet" onClick={() => go('owner-record')}>처음부터 다시</ActionButton></div>
    </Panel>
    <details className="mx-auto mt-5 max-w-4xl rounded-2xl bg-white px-5"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between font-extrabold">상세 정보 보기 <ChevronDown className="h-5 w-5" /></summary><div className="border-t border-deep/10 pb-4"><FactRow label="장소" value={draft.state.location_display} /><FactRow label="작업" value={draft.state.steps.map((step) => step.title_ko).join(' · ') || '실행 단계 없음'} /><FactRow label="수량" value={quantityText(draft.state.quantity)} /><FactRow label="시간" value={draft.state.deadline ?? '미확정'} /><FactRow label="위험 판정" value={draft.risk_assessment.level} /><FactRow label="원문" value={draft.transcript} last /></div></details>
  </>;
}

export function OwnerStoryboardScreen({ go, session, setSession, workerLocale, setWorkerLocale, issuedWorkerLink, setIssuedWorkerLink }: OwnerScreenProps) {
  const [issued, setIssued] = useState<IssuedWorkerLink | null>(issuedWorkerLink); const [copyStatus, setCopyStatus] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [versionChange, setVersionChange] = useState<{ from: OwnerWorkSession; to: OwnerWorkSession } | null>(null);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await api.getSession(session.session_id);
        if (active && next.current_version > session.current_version) { setVersionChange({ from: session, to: next }); setSession(next); }
      } catch { /* keep last confirmed storyboard visible */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    const focus = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', focus); window.addEventListener('focus', focus);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', focus); };
  }, [session?.session_id, session?.current_version, setSession]);
  if (!session) return <EmptySession go={go} />;
  const copy = async () => { if (!issued) return; try { await navigator.clipboard.writeText(issued.issued_worker_link.url); setCopyStatus('복사됐어요. 카카오톡 대화창에 붙여넣어 보내세요.'); } catch { setCopyStatus('복사하지 못했어요. 링크를 길게 눌러 직접 복사해주세요.'); } };
  const reissue = async () => { setLoading(true); setError(''); try { const next = await api.issueWorkerLink(session.session_id, workerLocale); setIssued(next); setIssuedWorkerLink(next); setCopyStatus('새 링크를 발급했어요. 이전 링크는 사용할 수 없습니다.'); } catch (reason) { setError(errorText(reason)); } finally { setLoading(false); } };
  return <>{versionChange && <div role="status" aria-live="polite" className="mb-5 rounded-2xl bg-[#173F24] p-5 text-white"><strong className="text-lg">작업 변경 반영</strong><p className="mt-1 font-bold">v{versionChange.from.current_version}에서 v{versionChange.to.current_version} · {quantityText(versionChange.from.version.state.quantity)}에서 {quantityText(versionChange.to.version.state.quantity)}</p></div>}<PageHeading title="작업 스토리보드" description="확정 뒤 전달 방식과 언어를 선택하세요." /><div className="mb-5 grid gap-3 rounded-2xl bg-[#EAF2E6] p-5 sm:grid-cols-3"><FactRow label="장소" value={session.version.state.location_display} last /><FactRow label="수량" value={quantityText(session.version.state.quantity)} last /><FactRow label="버전" value={`v${session.current_version}`} last /></div><div className="grid gap-5 xl:grid-cols-[1fr_350px]"><Panel className="order-2 xl:order-1"><PanelHeader title="작업 단계" aside={<StatusBadge>{session.version.state.steps.length}단계</StatusBadge>} /><StorySteps steps={session.version.state.steps} /></Panel><div className="order-1 grid content-start gap-5 xl:order-2"><Panel><PanelHeader title="전달 언어" /><div className="grid grid-cols-2 gap-2">{(['vi', 'ne'] as const).map((locale) => <button key={locale} type="button" onClick={() => setWorkerLocale(locale)} className={`min-h-12 rounded-xl border px-3 font-black ${workerLocale === locale ? 'border-deep bg-sage' : 'border-deep/15 bg-white'}`}>{locale === 'vi' ? 'Tiếng Việt' : 'नेपाली'}</button>)}</div><ActionButton className="mt-4 w-full" onClick={() => go('owner-brief')}><Play className="h-5 w-5" />현장에서 같이 보기</ActionButton></Panel>{issued ? <Panel><PanelHeader title="24시간 링크" /><Callout safe><strong>링크는 지금 한 번만 표시됩니다.</strong><p className="break-all text-base">{issued.issued_worker_link.url}</p><p className="text-base">만료: {new Date(issued.issued_worker_link.expires_at).toLocaleString('ko-KR')}</p></Callout><div className="mt-3 grid gap-2"><ActionButton onClick={copy}><Copy className="h-5 w-5" />링크 복사</ActionButton><ActionButton variant="secondary" disabled={loading} onClick={reissue}>{loading ? '새 링크 발급 중…' : '새 링크 발급'}</ActionButton><a className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-primary/35 font-extrabold text-deep" href={issued.issued_worker_link.url}>작업자 화면 열기</a></div>{copyStatus && <p role="status" className="mt-3 text-base font-extrabold text-deep">{copyStatus}</p>}{error && <p role="alert" className="mt-3 text-base font-bold text-[#8A302B]">{error}</p>}</Panel> : <Panel><PanelHeader title="링크로 보내기" /><p className="text-base font-bold text-muted">선택 언어의 익명 24시간 링크를 한 번 발급합니다.</p><ActionButton className="mt-4 w-full" disabled={loading} onClick={reissue}>{loading ? '링크 발급 중…' : 'REMOTE 링크 발급'}</ActionButton>{error && <p role="alert" className="mt-3 text-base font-bold text-[#8A302B]">{error}</p>}</Panel>}</div></div></>;
}

function LegacyBriefingView({ briefing }: { briefing: LegacyWorkerBriefing }) {
  return <><PageHeading title="기존 작업 브리핑" description={`v${briefing.version} · 읽기 전용`} /><Callout><span className="flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0" />새 수량 변경 없이 저장된 기존 기록을 표시합니다.</span></Callout><section className="mt-5 grid gap-4"><FactRow label="장소" value={briefing.context.location_display} /><FactRow label="수량" value={briefing.context.quantity_display} /><ol className="grid gap-3">{briefing.steps.map((step) => <li key={step.sequence} className="overflow-hidden rounded-2xl bg-[#F5F8F3] p-4"><strong>{step.sequence}. {step.title}</strong><p className="mt-2 font-bold text-muted">{step.description}</p>{step.video && <video controls playsInline className="mt-3 aspect-video w-full rounded-xl bg-deep"><source src={step.video.video_url} /></video>}</li>)}</ol></section></>;
}

export function OwnerBriefScreen({ go, sessionId, workerLocale }: OwnerScreenProps) {
  const [brief, setBrief] = useState<Briefing | null>(null); const [error, setError] = useState(''); const [index, setIndex] = useState(0); const [updated, setUpdated] = useState(false); const [retry, setRetry] = useState(0); const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    const load = () => api.getBriefing(sessionId, workerLocale).then((next) => { setBrief((current) => { if (current && next.version > current.version) { audio.current?.pause(); window.speechSynthesis.cancel(); setUpdated(true); setIndex(0); } return !current || next.version >= current.version ? next : current; }); setError(''); }).catch((cause) => setError(errorText(cause)));
    load(); const timer = window.setInterval(load, 5000); const focus = () => document.visibilityState === 'visible' && load(); document.addEventListener('visibilitychange', focus); window.addEventListener('focus', load);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', load); audio.current?.pause(); window.speechSynthesis.cancel(); };
  }, [sessionId, workerLocale, retry]);
  if (error && !brief) return <><PageHeading title="브리핑을 열 수 없어요" description={error} /><ActionButton onClick={async () => { const pin = window.prompt('농장주 PIN을 입력하세요.'); if (pin) { await api.createOwnerSession(pin); setRetry((value) => value + 1); } }}>다시 연결</ActionButton></>;
  if (!brief) return <div className="h-64 animate-pulse rounded-2xl bg-sage/40" aria-label="브리핑 불러오는 중" />;
  if (brief.contract_version === 'structure-v1') return <LegacyBriefingView briefing={brief} />;
  const step = brief.steps[Math.min(index, brief.steps.length - 1)]; const isVi = workerLocale === 'vi'; const video = brief.video.find((item) => item.step_sequence === step.sequence) ?? null;
  const browserSpeech = () => { const speech = new SpeechSynthesisUtterance(step.description); speech.lang = isVi ? 'vi-VN' : 'ne-NP'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech); };
  const play = async () => { audio.current?.pause(); if (!brief.tts.audio_url) { browserSpeech(); return; } const next = new Audio(brief.tts.audio_url); audio.current = next; next.onerror = browserSpeech; try { await next.play(); } catch { browserSpeech(); } };
  const quantity = typeof brief.context.quantity === 'object' && brief.context.quantity ? `${brief.context.quantity.value} ${brief.context.quantity.unit}` : '—';
  return <>{updated && <div role="status" aria-live="assertive" className="mb-5 rounded-2xl bg-[#173F24] p-5 text-lg font-black text-white">{isVi ? 'Có hướng dẫn mới. Hãy xem lại từ bước đầu tiên.' : 'नयाँ निर्देशन आएको छ। पहिलो चरणदेखि फेरि हेर्नुहोस्।'}</div>}{error && <div role="alert" className="mb-5 rounded-2xl bg-[#FFF0BF] p-5 text-base font-extrabold text-[#654B16]">{isVi ? 'Không thể kiểm tra hướng dẫn mới nhất.' : 'नयाँ निर्देशन जाँच्न सकिएन।'}<ActionButton className="ml-3" variant="secondary" onClick={() => setRetry((value) => value + 1)}>{isVi ? 'Thử lại' : 'फेरि प्रयास'}</ActionButton></div>}<PageHeading title={isVi ? 'Hướng dẫn công việc' : 'काम निर्देशन'} description={`v${brief.version} · ${index + 1}/${brief.steps.length}`} action={<ActionButton variant="secondary" onClick={() => go('owner-storyboard')}><ArrowLeft className="h-5 w-5" />돌아가기</ActionButton>} />{brief.badges.map((badge) => <StatusBadge key={badge} tone="yellow">{badge === 'DEMO_FALLBACK' ? (isVi ? 'NỘI DUNG DEMO' : 'डेमो सामग्री') : (isVi ? 'Cần xác nhận' : 'पुष्टि आवश्यक')}</StatusBadge>)}<div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"><section>{video ? <video key={video.video_url} controls playsInline className="aspect-video w-full rounded-2xl bg-deep object-cover"><source src={video.video_url} /><track kind="captions" src={`data:text/vtt;charset=utf-8,${encodeURIComponent(`WEBVTT\n\n00:00.000 --> 23:59.000\n${video.captions_text}`)}`} srcLang={workerLocale} label={workerLocale} default /></video> : <Callout safe><p className="text-lg">{isVi ? 'Không có video đã kiểm duyệt. Hãy đọc hoặc nghe hướng dẫn.' : 'जाँच गरिएको भिडियो छैन। निर्देशन पढ्नुहोस् वा सुन्नुहोस्।'}</p></Callout>}<div className="mt-4 grid grid-cols-[auto_1fr_auto] gap-2"><ActionButton variant="secondary" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>{isVi ? 'Trước' : 'अघिल्लो'}</ActionButton><ActionButton onClick={play}><Volume2 className="h-5 w-5" />{isVi ? 'Nghe' : 'सुन्नुहोस्'}</ActionButton><ActionButton variant="secondary" disabled={index === brief.steps.length - 1} onClick={() => setIndex((value) => value + 1)}>{isVi ? 'Tiếp' : 'अर्को'}</ActionButton></div></section><Panel><PanelHeader title={step.title} aside={<StatusBadge>v{brief.version}</StatusBadge>} /><p className="text-xl font-bold leading-9">{step.description}</p><FactRow label={isVi ? 'Địa điểm' : 'स्थान'} value={brief.context.location_display} /><FactRow label={isVi ? 'Số lượng' : 'परिमाण'} value={quantity} last /><ActionButton className="mt-6 w-full" variant="quiet" onClick={() => document.documentElement.requestFullscreen?.()}><Expand className="h-5 w-5" />{isVi ? 'Toàn màn hình' : 'पूरा स्क्रিন'}</ActionButton></Panel></div></>;
}

export function OwnerCurrentScreen({ go, session }: OwnerScreenProps) {
  if (!session) return <EmptySession go={go} />;
  const legacy = session.contract_version === 'structure-v1';
  return <><PageHeading title="진행 중 작업" description={`${legacy ? '기존 읽기 전용 · ' : ''}최신 게시 버전 v${session.current_version}`} action={legacy ? undefined : <ActionButton onClick={() => go('owner-change')}><Mic className="h-5 w-5" />수량 변경</ActionButton>} />{legacy && <Callout><span className="flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0" />기존 v1 작업은 수량을 변경할 수 없습니다.</span></Callout>}<div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.8fr]"><Panel><PanelHeader title="작업 단계" aside={<StatusBadge>PUBLISHED</StatusBadge>} /><StorySteps steps={session.version.state.steps} /></Panel><Panel className="self-start"><PanelHeader title="현재 작업 정보" /><FactRow label="장소" value={session.version.state.location_display} /><FactRow label="수량" value={quantityText(session.version.state.quantity)} /><FactRow label="완료시간" value={session.version.state.deadline ?? '미확정'} /><FactRow label="안전" value={session.version.state.safety.join(' · ') || '별도 안전사항 없음'} last /><ActionButton className="mt-6 w-full" onClick={() => go('owner-storyboard')}>전달 화면 열기</ActionButton></Panel></div></>;
}

export function OwnerChangeScreen({ go, session, setSession }: OwnerScreenProps) {
  const [preview, setPreview] = useState<QuantityChangePreview | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  if (!session) return <EmptySession go={go} />;
  if (session.contract_version === 'structure-v1') return <><PageHeading title="기존 작업" description="기존 v1 작업은 읽기 전용입니다." /><Callout>새 수량 변경 없이 기존 기록만 확인할 수 있습니다.</Callout><ActionButton className="mt-5" variant="secondary" onClick={() => go('owner-current')}>작업으로 돌아가기</ActionButton></>;
  const confirm = async () => {
    if (!preview?.quantity) return; setLoading(true); setError('');
    try { const next = await api.confirmQuantityChange(session.session_id, preview.quantity, preview.expected_version); setSession(next); go('owner-current'); } catch (cause) { setError(errorText(cause)); } finally { setLoading(false); }
  };
  return <><PageHeading title="수량 변경하기" description="변경할 수량만 말해주세요. 확인 전에는 저장되지 않습니다." /><div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]"><VoiceRecorder helper="예: “스무 망 말고 열다섯 망으로 바꿔.”" submitLabel="변경 내용 확인" onSubmit={async (audio) => { const next = await api.parseQuantityChange(session.session_id, audio, session.current_version); setPreview(next); }} /><Panel><PanelHeader title="현재 수량" aside={<StatusBadge>v{session.current_version}</StatusBadge>} /><strong className="block rounded-2xl bg-sage/60 p-7 text-center text-4xl text-deep">{quantityText(session.version.state.quantity)}</strong>{preview?.interpretation === 'AMBIGUOUS' && <div className="mt-5"><Callout>{preview.ambiguities[0]?.message ?? '수량을 다시 말해주세요.'}</Callout></div>}{preview?.interpretation === 'READY' && preview.quantity && <div className="mt-5"><p className="font-bold text-muted">변경할 수량</p><strong className="mt-2 block text-4xl">{preview.quantity.value}{preview.quantity.unit}</strong><ActionButton className="mt-5 w-full" disabled={loading} onClick={confirm}><Check className="h-5 w-5" />{loading ? '변경하고 있어요…' : '이 수량으로 변경'}</ActionButton></div>}{error && <p role="alert" className="mt-4 rounded-xl bg-[#FDE7E4] p-4 font-bold text-[#8A302B]">{error}</p>}</Panel></div></>;
}

export function OwnerScreenRouter({ screen, ...props }: OwnerScreenProps & { screen: AppScreen }) {
  const screens: Partial<Record<AppScreen, (value: OwnerScreenProps) => JSX.Element>> = {
    'owner-home': OwnerHomeScreen, 'owner-team': OwnerTodayTeamScreen, 'owner-record': OwnerRecordScreen,
    'owner-review': OwnerReviewScreen, 'owner-storyboard': OwnerStoryboardScreen,
    'owner-current': OwnerCurrentScreen, 'owner-change': OwnerChangeScreen, 'owner-change-confirm': OwnerChangeScreen,
    'owner-brief': OwnerBriefScreen,
  };
  const Screen = screens[screen] ?? OwnerHomeScreen; return <Screen {...props} />;
}
