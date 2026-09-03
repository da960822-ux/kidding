import { ArrowLeft, ArrowRight, KeyRound, Sprout, Tractor, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../types';
import { api, ApiError, ownerUnauthorizedEvent, setOwnerAuthGeneration } from './api';
import { AppShell } from './AppShell';
import type { IssuedWorkerLink, OwnerSession, OwnerWorkSession, WorkDraft } from './contracts';
import type { AppScreen, WorkerLocale } from './model';
import { OwnerScreenRouter } from './OwnerScreens';
import { ActionButton, Panel } from './ScreenUI';
import { WorkerScreenRouter } from './WorkerScreens';

const appScreens: AppScreen[] = ['role', 'worker-entry', 'owner-home', 'owner-team', 'owner-record', 'owner-review', 'owner-storyboard', 'owner-current', 'owner-change', 'owner-change-confirm', 'owner-brief', 'worker-latest', 'worker-step', 'worker-link-error'];
const workerLocaleStorageKey = 'batmeori-worker-locale';
const ownerDraftStorageKey = 'batmeori-owner-draft-id';
const roleCopy = {
  ko: { title: '어떻게 이용하시나요?', intro: '근로자는 로그인 없이, 농장주는 농장 코드로 시작합니다.', owner: '농장주예요', ownerBody: '농장 코드와 PIN으로 내 농장 작업을 안전하게 관리해요.', ownerAction: '농장주 로그인', worker: '근로자예요', workerBody: '농장주에게 받은 링크로 내 언어의 작업 지시를 확인해요.' },
  vi: { title: 'Bạn sử dụng dịch vụ với vai trò nào?', intro: 'Người lao động không cần đăng nhập. Chủ nông trại dùng mã nông trại.', owner: 'Tôi là chủ nông trại', ownerBody: 'Đăng nhập bằng mã nông trại và PIN để quản lý công việc.', ownerAction: 'Đăng nhập chủ nông trại', worker: 'Tôi là người lao động', workerBody: 'Mở hướng dẫn bằng ngôn ngữ của tôi qua đường dẫn đã nhận.' },
  ne: { title: 'तपाईं कुन भूमिकामा प्रयोग गर्नुहुन्छ?', intro: 'कामदारलाई लगइन चाहिँदैन। खेत मालिकले खेत कोड प्रयोग गर्छन्।', owner: 'म खेत मालिक हुँ', ownerBody: 'खेत कोड र PIN प्रयोग गरी आफ्नो काम व्यवस्थापन गर्नुहोस्।', ownerAction: 'खेत मालिक लगइन', worker: 'म कामदार हुँ', workerBody: 'प्राप्त लिङ्कबाट आफ्नो भाषामा कामको निर्देशन हेर्नुहोस्।' },
};

function routeState() {
  const path = window.location.pathname;
  const ownerMatch = path.match(/^\/owner\/work\/([^/]+)/);
  const workerMatch = path.match(/^\/w\/([^/]+)/);
  const teamMemberPath = path === '/worker/my' || /^\/worker\/my\/steps\/\d+/.test(path);
  let screen: AppScreen = 'role';
  if (path === '/owner' || path === '/owner/home') screen = 'owner-home';
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
  return { screen: requested && appScreens.includes(requested) ? requested : screen, sessionId: ownerMatch?.[1] ?? null, token: teamMemberPath ? '__team_member__' : workerMatch?.[1] ?? null };
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

function RoleSelectScreen({ go, locale }: { go: (screen: AppScreen) => void; locale: Locale }) {
  const t = roleCopy[locale];
  return <div className="mx-auto max-w-4xl py-4 sm:py-12">
    <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-deep text-white"><Sprout className="h-8 w-8" /></span><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">{t.title}</h1><p className="mt-3 text-lg font-bold text-muted">{t.intro}</p></div>
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <button type="button" onClick={() => go('owner-home')} className="group min-h-64 rounded-3xl bg-[#E2EDDC] p-7 text-left shadow-soft transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-deep text-white"><Tractor className="h-8 w-8" /></span><strong className="mt-6 block text-3xl font-black text-deep">{t.owner}</strong><span className="mt-3 block text-lg font-bold leading-8 text-[#465247]">{t.ownerBody}</span><span className="mt-6 flex items-center gap-2 text-lg font-black text-deep">{t.ownerAction}<ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></span></button>
      <button type="button" onClick={() => go('worker-entry')} className="group min-h-64 rounded-3xl bg-[#E5F2FB] p-7 text-left shadow-soft transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6FAEE8]/35"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#327BB4] text-white"><UsersRound className="h-8 w-8" /></span><strong className="mt-6 block text-3xl font-black text-[#184E78]">{t.worker}</strong><span className="mt-3 block text-lg font-bold leading-8 text-[#405866]">{t.workerBody}</span><span className="mt-6 flex items-center gap-2 text-lg font-black text-[#184E78]">Worker · Công nhân · कामदार<ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></span></button>
    </div>
  </div>;
}

function OwnerLoginScreen({ login, cancel }: { login: (farmCode: string, pin: string) => Promise<void>; cancel: () => void }) {
  const [farmCode, setFarmCode] = useState(''); const [pin, setPin] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!farmCode.trim() || !pin) { setError('농장 코드와 PIN을 모두 입력해주세요.'); return; }
    setLoading(true); setError('');
    try { await login(farmCode.trim(), pin); }
    catch (reason) { setError(reason instanceof ApiError && reason.status === 401 ? '농장 코드 또는 PIN이 맞지 않습니다.' : '농장에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'); }
    finally { setLoading(false); }
  };
  return <div className="mx-auto max-w-xl py-6 sm:py-14"><button type="button" onClick={cancel} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-extrabold text-deep hover:bg-sage/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><ArrowLeft className="h-5 w-5" />처음으로</button><Panel><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-deep text-white"><KeyRound className="h-8 w-8" /></span><h1 className="mt-6 text-3xl font-black tracking-[-0.035em]">농장주 로그인</h1><p className="mt-2 text-base font-bold leading-7 text-muted">농장마다 다른 코드와 PIN으로 내 작업만 불러옵니다.</p><form className="mt-7 grid gap-5" onSubmit={submit}><label className="grid gap-2 font-extrabold" htmlFor="farm-code">농장 코드<input id="farm-code" value={farmCode} onChange={(event) => setFarmCode(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} className="min-h-14 rounded-xl border border-deep/20 px-4 text-lg font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/20" placeholder="농장 코드를 입력하세요" /></label><label className="grid gap-2 font-extrabold" htmlFor="owner-pin">PIN<input id="owner-pin" type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" inputMode="numeric" className="min-h-14 rounded-xl border border-deep/20 px-4 text-lg font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/20" placeholder="PIN을 입력하세요" /></label>{error && <p role="alert" className="rounded-xl bg-[#FDE7E4] p-4 font-bold text-[#8A302B]">{error}</p>}<ActionButton type="submit" className="w-full" disabled={loading}>{loading ? '농장에 연결하고 있어요…' : '내 농장으로 들어가기'}<ArrowRight className="h-5 w-5" /></ActionButton></form></Panel></div>;
}

function OwnerSessionError({ retry, cancel }: { retry: () => void; cancel: () => void }) {
  return <div className="mx-auto max-w-xl py-6 sm:py-14"><Panel><h1 className="text-3xl font-black tracking-[-0.035em]">농장 연결을 확인할 수 없어요</h1><p className="mt-3 text-base font-bold leading-7 text-muted">서버 또는 네트워크 문제일 수 있습니다. PIN을 다시 입력하지 않아도 연결을 다시 확인할 수 있어요.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><ActionButton onClick={retry}>다시 연결</ActionButton><ActionButton variant="secondary" onClick={cancel}>처음으로</ActionButton></div></Panel></div>;
}

export function WebApp({ initialLocale }: { initialLocale: Locale }) {
  const initial = routeState(); const requestedLocale = new URLSearchParams(window.location.search).get('lang');
  const savedLocale = window.sessionStorage.getItem(workerLocaleStorageKey);
  const [screen, setScreen] = useState<AppScreen>(initial.screen); const [sessionId, setSessionId] = useState<string | null>(initial.sessionId); const sessionIdRef = useRef<string | null>(initial.sessionId); const [token, setToken] = useState<string | null>(initial.token);
  const [workerLocale, setWorkerLocale] = useState<WorkerLocale>(requestedLocale === 'ne' || savedLocale === 'ne' || (savedLocale !== 'vi' && initialLocale === 'ne') ? 'ne' : 'vi'); const [draft, setDraftState] = useState<WorkDraft | null>(null); const [draftAudio, setDraftAudio] = useState<Blob | null>(null); const [draftRecoveryError, setDraftRecoveryError] = useState(false); const [session, setSessionState] = useState<OwnerWorkSession | null>(null); const [issuedWorkerLink, setIssuedWorkerLink] = useState<IssuedWorkerLink | null>(null);
  const [ownerSession, setOwnerSession] = useState<OwnerSession | null>(null); const [ownerAuth, setOwnerAuth] = useState<'idle' | 'checking' | 'login' | 'error' | 'authenticated'>('idle'); const [authRetry, setAuthRetry] = useState(0); const returnScreen = useRef<AppScreen>(initial.screen.startsWith('owner-') ? initial.screen : 'owner-home'); const ownerAuthGeneration = useRef(0); const authenticatedFarmCode = useRef<string | null>(null);
  const setSession = (next: OwnerWorkSession | null) => { setSessionState(next); if (next) { sessionIdRef.current = next.session_id; setSessionId(next.session_id); } };
  const setDraft = (next: WorkDraft | null) => { setDraftState(next); setDraftRecoveryError(false); if (next) window.sessionStorage.setItem(ownerDraftStorageKey, next.draft_id); else window.sessionStorage.removeItem(ownerDraftStorageKey); };
  const advanceOwnerAuthGeneration = () => { ownerAuthGeneration.current += 1; setOwnerAuthGeneration(ownerAuthGeneration.current); };
  const clearOwnerState = (resetRoute = false) => { advanceOwnerAuthGeneration(); setOwnerSession(null); setSession(null); setDraft(null); setDraftAudio(null); setIssuedWorkerLink(null); if (resetRoute) { authenticatedFarmCode.current = null; returnScreen.current = 'owner-home'; sessionIdRef.current = null; setSessionId(null); } };
  const go = (next: AppScreen) => { setScreen(next); window.history.pushState({}, '', pathFor(next, workerLocale, sessionIdRef.current, token)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const changeLocale = (next: WorkerLocale) => { window.sessionStorage.setItem(workerLocaleStorageKey, next); setWorkerLocale(next); document.documentElement.lang = next; };
  useEffect(() => {
    if (!screen.startsWith('owner-') || ownerSession || ownerAuth !== 'idle') return;
    let active = true; const generation = ownerAuthGeneration.current; returnScreen.current = screen; setOwnerAuth('checking');
    api.getOwnerSession().then((next) => { if (active && generation === ownerAuthGeneration.current) { authenticatedFarmCode.current = next.farm.code; setOwnerSession(next); setOwnerAuth('authenticated'); } }).catch((reason) => { if (active && generation === ownerAuthGeneration.current) setOwnerAuth(reason instanceof ApiError && reason.status === 401 ? 'login' : 'error'); });
    return () => { active = false; };
  }, [screen, ownerSession, authRetry]);
  useEffect(() => {
    const unauthorized = (event: Event) => { const generation = (event as CustomEvent<{ generation?: number }>).detail?.generation; if (!screen.startsWith('owner-') || (generation !== undefined && generation !== ownerAuthGeneration.current)) return; returnScreen.current = screen; clearOwnerState(); setOwnerAuth('login'); };
    window.addEventListener(ownerUnauthorizedEvent, unauthorized); return () => window.removeEventListener(ownerUnauthorizedEvent, unauthorized);
  }, [screen]);
  useEffect(() => { const needsSession = ['owner-current', 'owner-change', 'owner-storyboard', 'owner-brief'].includes(screen); if (!needsSession || !sessionId || session?.session_id === sessionId || ownerAuth !== 'authenticated') return; const generation = ownerAuthGeneration.current; let active = true; api.getSession(sessionId).then((next) => { if (active && generation === ownerAuthGeneration.current) setSession(next); }).catch(() => { if (active && generation === ownerAuthGeneration.current) setSession(null); }); return () => { active = false; }; }, [screen, sessionId, session?.session_id, ownerAuth]);
  useEffect(() => { if (screen !== 'owner-review' || draft || ownerAuth !== 'authenticated') return; const draftId = window.sessionStorage.getItem(ownerDraftStorageKey); if (!draftId) { setDraftRecoveryError(true); return; } let active = true; api.getDraft(draftId).then((next) => { if (active) setDraft(next); }).catch(() => { if (active) { window.sessionStorage.removeItem(ownerDraftStorageKey); setDraftRecoveryError(true); } }); return () => { active = false; }; }, [screen, draft, ownerAuth]);
  useEffect(() => { document.documentElement.lang = screen === 'role' ? initialLocale : screen === 'worker-entry' || screen.startsWith('worker-') || screen === 'owner-brief' ? workerLocale : 'ko'; }, [screen, workerLocale, initialLocale]);
  useEffect(() => { const pop = () => { const next = routeState(); setScreen(next.screen); sessionIdRef.current = next.sessionId; setSessionId(next.sessionId); setToken(next.token); }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const login = async (farmCode: string, pin: string) => { const next = await api.createOwnerSession(farmCode, pin); const farmChanged = authenticatedFarmCode.current !== null && authenticatedFarmCode.current !== next.farm.code; advanceOwnerAuthGeneration(); if (farmChanged) { setSession(null); setDraft(null); setDraftAudio(null); setIssuedWorkerLink(null); sessionIdRef.current = null; setSessionId(null); returnScreen.current = 'owner-home'; } authenticatedFarmCode.current = next.farm.code; setOwnerSession(next); setOwnerAuth('authenticated'); const destination = farmChanged ? 'owner-home' : returnScreen.current; if (screen !== destination) go(destination); };
  const logout = async () => { try { await api.deleteOwnerSession(); } finally { clearOwnerState(true); setOwnerAuth('idle'); go('role'); } };
  const cancelLogin = () => { setOwnerAuth('idle'); go('role'); };
  const worker = screen.startsWith('worker-'); const ownerLocked = screen.startsWith('owner-') && ownerAuth !== 'authenticated'; const hideNavigation = screen === 'role' || screen === 'worker-entry' || ownerLocked;
  const content = screen === 'role' ? <RoleSelectScreen go={go} locale={initialLocale} /> : worker ? <WorkerScreenRouter screen={screen} go={go} token={token} locale={workerLocale} entryLocale={initialLocale} setLocale={changeLocale} /> : ownerAuth === 'login' ? <OwnerLoginScreen login={login} cancel={cancelLogin} /> : ownerAuth === 'error' ? <OwnerSessionError retry={() => { setOwnerAuth('idle'); setAuthRetry((value) => value + 1); }} cancel={cancelLogin} /> : ownerAuth === 'checking' || ownerAuth === 'idle' ? <div className="mx-auto h-64 max-w-xl animate-pulse rounded-2xl bg-sage/40" aria-label="농장 연결 확인 중" /> : <OwnerScreenRouter screen={screen} go={go} workerLocale={workerLocale} setWorkerLocale={changeLocale} draft={draft} setDraft={setDraft} draftAudio={draftAudio} setDraftAudio={setDraftAudio} draftRecoveryError={draftRecoveryError} session={session} setSession={setSession} sessionId={sessionId} issuedWorkerLink={issuedWorkerLink} setIssuedWorkerLink={setIssuedWorkerLink} />;
  return <AppShell role={worker ? 'worker' : 'owner'} active={screen} workerLocale={workerLocale} go={go} ownerSession={ownerSession} currentWorkSessionId={session?.session_id} onLogout={logout} hideNavigation={hideNavigation}>{content}</AppShell>;
}
