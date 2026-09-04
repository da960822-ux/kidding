import { ArrowLeft, ArrowRight, KeyRound, Sprout, Tractor, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../types';
import { api, ApiError, ownerUnauthorizedEvent, setOwnerAuthGeneration } from './api';
import { AppShell } from './AppShell';
import type { IssuedWorkerLink, OwnerSession, OwnerWorkSession, WorkDraft } from './contracts';
import type { AppScreen, WorkerLocale } from './model';
import { OwnerScreenRouter } from './OwnerScreens';
import { ActionButton, PageHeading, Panel } from './ScreenUI';
import { WorkerScreenRouter } from './WorkerScreens';

const appScreens: AppScreen[] = ['role', 'worker-entry', 'owner-home', 'owner-team', 'owner-record', 'owner-review', 'owner-storyboard', 'owner-current', 'owner-change', 'owner-change-confirm', 'owner-brief', 'worker-latest', 'worker-step', 'worker-link-error'];
const workerLocaleStorageKey = 'batmeori-worker-locale';
const ownerDraftStorageKey = 'batmeori-owner-draft-id';
const roleCopy = {
  ko: { title: '어떻게 이용하시나요?', intro: '농장주는 바로 말하고, 근로자는 받은 지시를 확인합니다.', owner: '농장주예요', ownerBody: '작업을 말하고 확인하면 24시간 작업팀이 열려요.', ownerAction: '작업 말하기', worker: '근로자예요', workerBody: '농장주에게 받은 링크로 내 언어의 작업 지시를 확인해요.' },
  vi: { title: 'Bạn sử dụng dịch vụ với vai trò nào?', intro: 'Bắt đầu bằng giọng nói. Người lao động mở hướng dẫn đã nhận.', owner: 'Tôi là chủ nông trại', ownerBody: 'Nói và xác nhận công việc để mở nhóm trong 24 giờ.', ownerAction: 'Bắt đầu nói', worker: 'Tôi là người lao động', workerBody: 'Mở hướng dẫn bằng ngôn ngữ của tôi qua đường dẫn đã nhận.' },
  ne: { title: 'तपाईं कुन भूमिकामा प्रयोग गर्नुहुन्छ?', intro: 'खेत मालिकले बोलेर सुरु गर्छन्। कामदारले निर्देशन हेर्छन्।', owner: 'म खेत मालिक हुँ', ownerBody: 'काम बोलेर पुष्टि गरेपछि २४ घण्टाको टोली खुल्छ।', ownerAction: 'काम बोल्नुहोस्', worker: 'म कामदार हुँ', workerBody: 'प्राप्त लिङ्कबाट आफ्नो भाषामा कामको निर्देशन हेर्नुहोस्।' },
};

function routeState() {
  const path = window.location.pathname;
  const managementMatch = path.match(/^\/owner\/manage\/([^/]+)$/);
  const ownerMatch = path.match(/^\/owner\/work\/([^/]+)/);
  const workerMatch = path.match(/^\/w\/([^/]+)/);
  const teamMemberPath = path === '/worker/my' || /^\/worker\/my\/steps\/\d+/.test(path);
  let screen: AppScreen = 'role';
  if (path === '/owner' || path === '/owner/home') screen = 'owner-home';
  else if (managementMatch || path === '/owner/manage') screen = 'owner-team';
  else if (path === '/owner/team') screen = 'owner-team';
  else if (path === '/worker' || path.startsWith('/team/')) screen = 'worker-entry';
  else if (path === '/owner/new') screen = 'owner-record';
  else if (path.includes('/brief')) screen = 'owner-brief';
  else if (path.includes('/interpret')) screen = 'owner-review';
  else if (path.includes('/review')) screen = 'owner-storyboard';
  else if (path.includes('/change')) screen = 'owner-change';
  else if (ownerMatch) screen = 'owner-current';
  else if (teamMemberPath && path.includes('/steps/')) screen = 'worker-step';
  else if (teamMemberPath) screen = 'worker-latest';
  else if (path.includes('/steps/')) screen = 'worker-step';
  else if (workerMatch) screen = 'worker-latest';
  const requested = new URLSearchParams(window.location.search).get('app') as AppScreen | null;
  return { managementEntry: path === '/owner/manage', managementId: managementMatch?.[1] ?? null, screen: requested && appScreens.includes(requested) ? requested : screen, sessionId: ownerMatch?.[1] ?? null, token: teamMemberPath ? '__team_member__' : workerMatch?.[1] ?? null };
}

function pathFor(screen: AppScreen, locale: WorkerLocale, sessionId: string | null, token: string | null) {
  const id = sessionId ? encodeURIComponent(sessionId) : '';
  const workerRoot = token === '__team_member__' ? '/worker/my' : `/w/${token ? encodeURIComponent(token) : ''}`;
  const paths: Partial<Record<AppScreen, string>> = {
    role: '/start', 'worker-entry': '/worker', 'owner-home': '/owner/home', 'owner-team': '/owner/team', 'owner-record': '/owner/new',
    'owner-review': '/owner/draft/interpret', 'owner-storyboard': `/owner/work/${id}/review`, 'owner-current': `/owner/work/${id}`,
    'owner-change': `/owner/work/${id}/change`, 'owner-brief': `/owner/work/${id}/brief?lang=${locale}`,
    'worker-latest': workerRoot, 'worker-step': `${workerRoot}/steps/1`, 'worker-link-error': workerRoot,
  };
  return paths[screen] ?? '/start';
}

function RoleSelectScreen({ go, locale, openExistingTeam }: { go: (screen: AppScreen) => void; locale: Locale; openExistingTeam: () => void }) {
  const t = roleCopy[locale];
  return <div className="mx-auto max-w-4xl py-4 sm:py-12">
    <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-deep text-white"><Sprout className="h-8 w-8" /></span><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">{t.title}</h1><p className="mt-3 text-lg font-bold text-muted">{t.intro}</p></div>
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <button type="button" onClick={() => go('owner-record')} className="group min-h-64 rounded-3xl bg-[#E2EDDC] p-7 text-left shadow-soft transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-deep text-white"><Tractor className="h-8 w-8" /></span><strong className="mt-6 block text-3xl font-black text-deep">{t.owner}</strong><span className="mt-3 block text-lg font-bold leading-8 text-[#465247]">{t.ownerBody}</span><span className="mt-6 flex items-center gap-2 text-lg font-black text-deep">{t.ownerAction}<ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></span></button>
      <button type="button" onClick={() => go('worker-entry')} className="group min-h-64 rounded-3xl bg-[#E5F2FB] p-7 text-left shadow-soft transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6FAEE8]/35"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#327BB4] text-white"><UsersRound className="h-8 w-8" /></span><strong className="mt-6 block text-3xl font-black text-[#184E78]">{t.worker}</strong><span className="mt-3 block text-lg font-bold leading-8 text-[#405866]">{t.workerBody}</span><span className="mt-6 flex items-center gap-2 text-lg font-black text-[#184E78]">Worker · Công nhân · कामदार<ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></span></button>
    </div>
    <ActionButton variant="secondary" className="mt-5 w-full md:w-auto" onClick={openExistingTeam}><KeyRound className="h-5 w-5" />{locale === 'vi' ? 'Mở nhóm công việc hiện có' : locale === 'ne' ? 'पहिलेको कार्य टोली खोल्नुहोस्' : '기존 작업팀 들어가기'}</ActionButton>
  </div>;
}

function OwnerLoginScreen({ login, cancel, startNew, hasTeam }: { login: (pin: string) => Promise<void>; cancel: () => void; startNew: () => Promise<void>; hasTeam: boolean }) {
  const [pin, setPin] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [managementLink, setManagementLink] = useState('');
  const openSavedTeam = (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const url = new URL(managementLink.trim(), window.location.origin);
      if (url.origin !== window.location.origin || url.username || url.password || !/^\/owner\/manage\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname)) throw new Error('Invalid management link');
      window.location.assign(url.pathname);
    } catch { setError('같은 밭머리 서비스에서 받은 관리 링크를 입력해주세요. 근로자 참여 링크는 사용할 수 없습니다.'); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try { await login(pin); } catch (reason) { setError(reason instanceof ApiError && reason.status === 429 ? '시도가 많습니다. 잠시 후 다시 시도해주세요.' : '팀에 연결할 수 없습니다. 관리 링크와 PIN 또는 만료 시간을 확인해주세요.'); } finally { setLoading(false); }
  };
  return <div className="mx-auto max-w-xl py-6 sm:py-14"><button type="button" onClick={cancel} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-extrabold text-deep"><ArrowLeft className="h-5 w-5" />처음으로</button><Panel><KeyRound className="h-10 w-10 text-deep" /><h1 className="mt-6 text-3xl font-black">{hasTeam ? '팀 관리 다시 열기' : '기존 작업팀 들어가기'}</h1><p className="mt-3 font-bold leading-7 text-muted">{hasTeam ? '처음 작업을 확정할 때 받은 6자리 PIN을 입력해주세요. 팀은 첫 확정부터 24시간 동안 유지됩니다.' : '농장주가 저장한 관리 링크를 붙여넣어주세요. 다음 화면에서 PIN을 확인합니다.'}</p>{hasTeam ? <form className="mt-6 grid gap-4" onSubmit={submit}><label htmlFor="owner-pin" className="grid gap-2 font-extrabold">PIN<input id="owner-pin" type="password" value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="current-password" className="min-h-14 rounded-xl border border-deep/20 px-4 text-lg focus:ring-4 focus:ring-primary/20" /></label><ActionButton type="submit" disabled={loading}>{loading ? '연결 중…' : '이 팀 열기'}</ActionButton></form> : <form className="mt-6 grid gap-4" onSubmit={openSavedTeam}><label htmlFor="owner-management-link" className="grid gap-2 font-extrabold">관리 링크<input id="owner-management-link" value={managementLink} onChange={(event) => setManagementLink(event.target.value)} inputMode="url" autoCapitalize="none" autoCorrect="off" required className="min-h-14 min-w-0 rounded-xl border border-deep/20 px-4 text-base focus:ring-4 focus:ring-primary/20" /></label><ActionButton type="submit">관리 링크로 계속</ActionButton></form>}{error && <p role="alert" className="mt-4 rounded-xl bg-[#FDE7E4] p-4 font-bold text-[#8A302B]">{error}</p>}<ActionButton variant="secondary" className="mt-5 w-full" disabled={loading} onClick={async () => { setLoading(true); try { await startNew(); } catch { setError('새 팀을 시작하지 못했습니다. 다시 시도해주세요.'); } finally { setLoading(false); } }}>새 팀으로 시작</ActionButton></Panel></div>;
}

function OwnerSessionError({ retry, cancel }: { retry: () => void; cancel: () => void }) {
  return <div className="mx-auto max-w-xl py-6 sm:py-14"><Panel><h1 className="text-3xl font-black tracking-[-0.035em]">농장 연결을 확인할 수 없어요</h1><p className="mt-3 text-base font-bold leading-7 text-muted">서버 또는 네트워크 문제일 수 있습니다. PIN을 다시 입력하지 않아도 연결을 다시 확인할 수 있어요.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><ActionButton onClick={retry}>다시 연결</ActionButton><ActionButton variant="secondary" onClick={cancel}>처음으로</ActionButton></div></Panel></div>;
}

function OwnerReadStatus({ draft, failed, retry, cancel }: { draft: boolean; failed: boolean; retry: () => void; cancel: () => void }) {
  if (!failed) return <p role="status" className="py-12 text-center text-lg font-bold text-muted">{draft ? '초안을 불러오고 있어요.' : '작업을 불러오고 있어요.'}</p>;
  return <><PageHeading title={draft ? '초안을 불러오지 못했어요' : '작업을 불러오지 못했어요'} description="저장된 내용을 다시 확인해주세요." /><div className="flex flex-wrap gap-3"><ActionButton onClick={retry}>다시 연결</ActionButton><ActionButton variant="secondary" onClick={cancel}>홈으로</ActionButton></div></>;
}

export function WebApp({ initialLocale }: { initialLocale: Locale }) {
  const initial = routeState(); const requestedLocale = new URLSearchParams(window.location.search).get('lang');
  const savedLocale = window.sessionStorage.getItem(workerLocaleStorageKey);
  const [screen, setScreen] = useState<AppScreen>(initial.screen); const [sessionId, setSessionId] = useState<string | null>(initial.sessionId); const sessionIdRef = useRef<string | null>(initial.sessionId); const [token, setToken] = useState<string | null>(initial.token);
  const [workerLocale, setWorkerLocale] = useState<WorkerLocale>(requestedLocale === 'ne' || savedLocale === 'ne' || (savedLocale !== 'vi' && initialLocale === 'ne') ? 'ne' : 'vi'); const [draft, setDraftState] = useState<WorkDraft | null>(null); const [draftAudio, setDraftAudio] = useState<Blob | null>(null); const [draftRecoveryError, setDraftRecoveryError] = useState(false); const [session, setSessionState] = useState<OwnerWorkSession | null>(null); const [issuedWorkerLink, setIssuedWorkerLink] = useState<IssuedWorkerLink | null>(null);
  const [managementId, setManagementId] = useState<string | null>(initial.managementId);
  const navigationGeneration = useRef(0);
  const [readRetry, setReadRetry] = useState(0); const [sessionReadError, setSessionReadError] = useState<string | null>(null); const [draftReadFailed, setDraftReadFailed] = useState(false);
  const [ownerSession, setOwnerSession] = useState<OwnerSession | null>(null); const [ownerAuth, setOwnerAuth] = useState<'idle' | 'checking' | 'login' | 'error' | 'authenticated'>(initial.managementEntry ? 'login' : 'idle'); const [authRetry, setAuthRetry] = useState(0); const returnScreen = useRef<AppScreen>(initial.screen.startsWith('owner-') ? initial.screen : 'owner-home'); const ownerAuthGeneration = useRef(0); const authenticatedOwnerScope = useRef<string | null>(null);
  const setSession = (next: OwnerWorkSession | null) => { if (next?.session_id !== sessionIdRef.current) setIssuedWorkerLink(null); setSessionState(next); if (next) { sessionIdRef.current = next.session_id; setSessionId(next.session_id); } };
  const setDraft = (next: WorkDraft | null) => { setDraftState(next); setDraftRecoveryError(false); if (next) window.sessionStorage.setItem(ownerDraftStorageKey, next.draft_id); else window.sessionStorage.removeItem(ownerDraftStorageKey); };
  const advanceOwnerAuthGeneration = () => { ownerAuthGeneration.current += 1; setOwnerAuthGeneration(ownerAuthGeneration.current); };
  const clearOwnerState = (resetRoute = false, preserveDraft = false) => { advanceOwnerAuthGeneration(); setOwnerSession(null); setSession(null); if (preserveDraft) { setDraftState(null); setDraftRecoveryError(false); } else setDraft(null); setDraftReadFailed(false); setDraftAudio(null); setIssuedWorkerLink(null); if (resetRoute) { authenticatedOwnerScope.current = null; returnScreen.current = 'owner-home'; sessionIdRef.current = null; setSessionId(null); } };
  const go = (next: AppScreen) => { navigationGeneration.current += 1; setScreen(next); window.history.pushState({}, '', pathFor(next, workerLocale, sessionIdRef.current, token)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openExistingTeam = () => { setManagementId(null); setOwnerAuth('login'); go('owner-team'); window.history.replaceState({}, '', '/owner/manage'); };
  const changeLocale = useCallback((next: WorkerLocale) => { window.sessionStorage.setItem(workerLocaleStorageKey, next); setWorkerLocale(next); document.documentElement.lang = next; }, []);
  useEffect(() => {
    if (!screen.startsWith('owner-') || ownerSession || ownerAuth !== 'idle') return;
    let active = true; const generation = ownerAuthGeneration.current; returnScreen.current = screen; setOwnerAuth('checking');
    const load = async () => {
      try {
        let next: OwnerSession;
        try { next = screen === 'owner-record' && !managementId && !sessionId ? await api.startOwnerSession() : await api.getOwnerSession(); }
        catch (reason) {
          if (!(reason instanceof ApiError) || reason.status !== 401 || managementId || sessionId || screen === 'owner-review') throw reason;
          next = await api.startOwnerSession();
        }
        if (!active || generation !== ownerAuthGeneration.current) return;
        if (managementId && next.team?.team_id !== managementId) { setOwnerSession(next); setOwnerAuth('login'); return; }
        authenticatedOwnerScope.current = next.team?.team_id ?? next.farm.code; setOwnerSession(next); setOwnerAuth('authenticated');
      } catch (reason) { if (active && generation === ownerAuthGeneration.current) setOwnerAuth(reason instanceof ApiError && reason.status === 401 ? 'login' : 'error'); }
    };
    void load();
    return () => { active = false; };
  }, [screen, ownerSession, authRetry]);
  useEffect(() => {
    const unauthorized = (event: Event) => { const generation = (event as CustomEvent<{ generation?: number }>).detail?.generation; if (!screen.startsWith('owner-') || (generation !== undefined && generation !== ownerAuthGeneration.current)) return; returnScreen.current = screen; setManagementId(ownerSession?.team?.status === 'ACTIVE' ? ownerSession.team.team_id : managementId); clearOwnerState(false, true); setOwnerAuth('login'); };
    window.addEventListener(ownerUnauthorizedEvent, unauthorized); return () => window.removeEventListener(ownerUnauthorizedEvent, unauthorized);
  }, [screen, ownerSession, managementId]);
  useEffect(() => { const needsSession = ['owner-current', 'owner-change', 'owner-change-confirm', 'owner-storyboard', 'owner-brief'].includes(screen); if (!needsSession || !sessionId || session?.session_id === sessionId || ownerAuth !== 'authenticated') return; const generation = ownerAuthGeneration.current; let active = true; setSessionReadError(null); api.getSession(sessionId).then((next) => { if (!active || generation !== ownerAuthGeneration.current) return; if (next.session_id !== sessionId) throw new Error('SESSION_MISMATCH'); setSession(next); }).catch(() => { if (active && generation === ownerAuthGeneration.current) setSessionReadError(sessionId); }); return () => { active = false; }; }, [screen, sessionId, session?.session_id, ownerAuth, readRetry]);
  useEffect(() => { if (screen !== 'owner-review' || draft || ownerAuth !== 'authenticated') return; const draftId = window.sessionStorage.getItem(ownerDraftStorageKey); if (!draftId) { setDraftRecoveryError(true); return; } let active = true; const generation = ownerAuthGeneration.current; setDraftReadFailed(false); api.getDraft(draftId).then((next) => { if (active && generation === ownerAuthGeneration.current) setDraft(next); }).catch((reason) => { if (!active || generation !== ownerAuthGeneration.current) return; if (reason instanceof ApiError && [404, 409, 422].includes(reason.status)) { window.sessionStorage.removeItem(ownerDraftStorageKey); setDraftRecoveryError(true); } else setDraftReadFailed(true); }); return () => { active = false; }; }, [screen, draft, ownerAuth, readRetry]);
  useEffect(() => { document.documentElement.lang = screen === 'role' ? initialLocale : screen === 'worker-entry' || screen.startsWith('worker-') || screen === 'owner-brief' ? workerLocale : 'ko'; }, [screen, workerLocale, initialLocale]);
  useEffect(() => { const pop = () => { const next = routeState(); navigationGeneration.current += 1; setScreen(next.screen); if (next.sessionId !== sessionIdRef.current) setIssuedWorkerLink(null); sessionIdRef.current = next.sessionId; setSessionId(next.sessionId); setToken(next.token); setManagementId(next.managementId); if (next.screen === 'role') setOwnerAuth(ownerSession ? 'authenticated' : 'idle'); else if (next.managementEntry) setOwnerAuth('login'); else if (next.managementId && next.managementId !== ownerSession?.team?.team_id) { clearOwnerState(); setOwnerAuth('idle'); } }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, [ownerSession?.team?.team_id]);
  const login = async (pin: string) => {
    if (!managementId) return;
    const next = await api.createTeamOwnerSession(managementId, pin);
    const scope = next.team?.team_id ?? next.farm.code;
    if (authenticatedOwnerScope.current !== scope) { clearOwnerState(); sessionIdRef.current = null; setSessionId(null); } else advanceOwnerAuthGeneration();
    setOwnerSession(next); setOwnerAuth('authenticated'); authenticatedOwnerScope.current = scope;
  };
  const startNew = async () => {
    if (ownerSession && new Date(ownerSession.expires_at).getTime() > Date.now() && ownerAuth !== 'authenticated' && !window.confirm('현재 팀으로 돌아오려면 저장한 관리 링크와 PIN이 필요합니다. 새 팀을 시작할까요?')) return;
    await api.deleteOwnerSession();
    window.sessionStorage.removeItem('batmeori-owner-start-key'); clearOwnerState(true); setManagementId(null);
    const next = await api.startOwnerSession(); authenticatedOwnerScope.current = next.team?.team_id ?? next.farm.code; setOwnerSession(next); setOwnerAuth('authenticated'); go('owner-record');
  };
  const refreshOwnerSession = async () => { const generation = ownerAuthGeneration.current; const next = await api.getOwnerSession(); if (generation === ownerAuthGeneration.current) setOwnerSession(next); };
  const logout = async () => { await api.deleteOwnerSession(); window.sessionStorage.removeItem('batmeori-owner-start-key'); clearOwnerState(true); setManagementId(null); setOwnerAuth('idle'); go('role'); };
  const cancelLogin = () => { setManagementId(null); setOwnerAuth(ownerSession ? 'authenticated' : 'idle'); go('role'); };
  const worker = screen.startsWith('worker-'); const ownerLocked = screen.startsWith('owner-') && ownerAuth !== 'authenticated'; const hideNavigation = screen === 'role' || screen === 'worker-entry' || ownerLocked;
  const viewGeneration = navigationGeneration.current; const viewAuthGeneration = ownerAuthGeneration.current;
  const guardOwnerCallback = <Args extends unknown[]>(callback: (...args: Args) => void) => (...args: Args) => { if (viewGeneration === navigationGeneration.current && viewAuthGeneration === ownerAuthGeneration.current) callback(...args); };
  const needsSessionRead = ['owner-current', 'owner-change', 'owner-change-confirm', 'owner-storyboard', 'owner-brief'].includes(screen) && Boolean(sessionId) && session?.session_id !== sessionId;
  const needsDraftRead = screen === 'owner-review' && !draft && !draftRecoveryError;
  const content = screen === 'role' ? <RoleSelectScreen go={go} locale={initialLocale} openExistingTeam={openExistingTeam} /> : worker ? <WorkerScreenRouter screen={screen} go={go} token={token} locale={workerLocale} entryLocale={initialLocale} setLocale={changeLocale} /> : ownerAuth === 'login' ? <OwnerLoginScreen login={login} cancel={cancelLogin} startNew={startNew} hasTeam={Boolean(managementId)} /> : ownerAuth === 'error' ? <OwnerSessionError retry={() => { setOwnerAuth('idle'); setAuthRetry((value) => value + 1); }} cancel={cancelLogin} /> : ownerAuth === 'checking' || ownerAuth === 'idle' ? <div className="mx-auto h-64 max-w-xl animate-pulse rounded-2xl bg-sage/40" aria-label="농장 연결 확인 중" /> : needsSessionRead || needsDraftRead ? <OwnerReadStatus draft={needsDraftRead} failed={needsDraftRead ? draftReadFailed : sessionReadError === sessionId} retry={() => setReadRetry((value) => value + 1)} cancel={() => go('owner-home')} /> : <OwnerScreenRouter ownerSession={ownerSession} refreshOwnerSession={refreshOwnerSession} startNewTeam={startNew} screen={screen} go={guardOwnerCallback(go)} workerLocale={workerLocale} setWorkerLocale={changeLocale} draft={draft} setDraft={guardOwnerCallback(setDraft)} draftAudio={draftAudio} setDraftAudio={guardOwnerCallback(setDraftAudio)} draftRecoveryError={draftRecoveryError} session={session} setSession={guardOwnerCallback(setSession)} sessionId={sessionId} issuedWorkerLink={issuedWorkerLink} setIssuedWorkerLink={guardOwnerCallback(setIssuedWorkerLink)} />;
  return <AppShell role={worker ? 'worker' : 'owner'} active={screen} workerLocale={workerLocale} go={go} ownerSession={ownerSession} currentWorkSessionId={session?.session_id} onLogout={logout} hideNavigation={hideNavigation}>{content}</AppShell>;
}
