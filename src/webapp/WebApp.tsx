import { Sprout } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Locale } from '../types';
import { api } from './api';
import { AppShell } from './AppShell';
import type { OwnerWorkSession, WorkDraft } from './contracts';
import type { AppScreen, WorkerLocale } from './model';
import { OwnerScreenRouter } from './OwnerScreens';
import { ActionButton, Panel } from './ScreenUI';
import { WorkerScreenRouter } from './WorkerScreens';

const appScreens: AppScreen[] = ['role', 'worker-entry', 'owner-home', 'owner-team', 'owner-record', 'owner-review', 'owner-storyboard', 'owner-current', 'owner-change', 'owner-change-confirm', 'owner-brief', 'worker-latest', 'worker-step', 'worker-link-error'];
const roleCopy = {
  ko: { title: '어떤 역할이신가요?', intro: '로그인 없이 바로 시작할 수 있어요.', owner: '농장주', worker: '근로자', loading: '연결하고 있어요…', error: '농장주 화면에 연결하지 못했습니다. 인터넷을 확인하고 다시 눌러주세요.', retry: '다시 연결' },
  vi: { title: 'Bạn có vai trò gì?', intro: 'Có thể bắt đầu ngay mà không cần đăng nhập.', owner: 'Chủ nông trại', worker: 'Người lao động', loading: 'Đang kết nối…', error: 'Không thể kết nối. Hãy kiểm tra mạng và thử lại.', retry: 'Kết nối lại' },
  ne: { title: 'तपाईंको भूमिका के हो?', intro: 'लगइन नगरी तुरुन्त सुरु गर्न सकिन्छ।', owner: 'खेत मालिक', worker: 'कामदार', loading: 'जडान हुँदैछ…', error: 'जडान हुन सकेन। इन्टरनेट जाँचेर फेरि प्रयास गर्नुहोस्।', retry: 'फेरि जडान' },
};

function routeState() {
  const path = window.location.pathname;
  const ownerMatch = path.match(/^\/owner\/work\/([^/]+)/);
  const workerMatch = path.match(/^\/w\/([^/]+)/);
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
  else if (path.includes('/steps/')) screen = 'worker-step';
  else if (workerMatch) screen = 'worker-latest';
  const requested = new URLSearchParams(window.location.search).get('app') as AppScreen | null;
  return { screen: requested && appScreens.includes(requested) ? requested : screen, sessionId: ownerMatch?.[1] ?? null, token: workerMatch?.[1] ?? null };
}

function pathFor(screen: AppScreen, locale: WorkerLocale, sessionId: string | null, token: string | null) {
  const id = sessionId ? encodeURIComponent(sessionId) : '';
  const workerToken = token ? encodeURIComponent(token) : '';
  const paths: Partial<Record<AppScreen, string>> = {
    role: '/start', 'worker-entry': '/worker', 'owner-home': '/owner/home', 'owner-team': '/owner/team', 'owner-record': '/owner/new',
    'owner-review': '/owner/draft/interpret', 'owner-storyboard': `/owner/work/${id}/review`, 'owner-current': `/owner/work/${id}`,
    'owner-change': `/owner/work/${id}/change`, 'owner-brief': `/owner/work/${id}/brief?lang=${locale}`,
    'worker-latest': `/w/${workerToken}`, 'worker-step': `/w/${workerToken}/steps/1`, 'worker-link-error': `/w/${workerToken}`,
  };
  return paths[screen] ?? '/start';
}

function RoleCard({ label, tone, children, onClick, disabled }: { label: string; tone: 'owner' | 'worker'; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  const colors = tone === 'owner' ? 'bg-[#EEF5E8] text-[#1F5B31] hover:bg-[#E7F0E1] focus-visible:ring-[#3E7B46]/35' : 'bg-[#EAF5FC] text-[#1A5F91] hover:bg-[#E1F0FA] focus-visible:ring-[#3886BE]/35';
  return <button type="button" disabled={disabled} onClick={onClick} className={`group flex min-h-[260px] w-full flex-col items-center justify-center rounded-[28px] p-7 text-center shadow-soft transition duration-200 hover:-translate-y-[3px] hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 disabled:cursor-wait disabled:opacity-60 sm:rounded-[32px] lg:min-h-[360px] ${colors}`}>{children}<strong className="mt-5 text-[36px] font-black tracking-[-0.03em] sm:mt-7 sm:text-[48px]">{label}</strong></button>;
}

function RoleSelectScreen({ go, locale }: { go: (screen: AppScreen) => void; locale: Locale }) {
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const t = roleCopy[locale];
  const enterOwner = async () => { setLoading(true); setError(''); try { await api.createOwnerSession(); go('owner-home'); } catch { setError(t.error); } finally { setLoading(false); } };
  return <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-6xl flex-col justify-center py-6 sm:py-12">
    <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1F5B31] text-white sm:h-[72px] sm:w-[72px]"><Sprout className="h-8 w-8 sm:h-9 sm:w-9" /></span><h1 className="mt-5 text-[36px] font-black tracking-[-0.03em] text-[#173626] sm:mt-6 sm:text-[52px]">{t.title}</h1><p className="mt-3 text-[20px] font-bold text-muted sm:text-[24px]">{t.intro}</p></div>
    <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
      <RoleCard label={t.owner} tone="owner" disabled={loading} onClick={enterOwner}><img src="/images/role-owner.png" alt="" className="h-[150px] w-[180px] scale-[1.28] object-contain sm:h-[200px] sm:w-[240px]" /></RoleCard>
      <RoleCard label={t.worker} tone="worker" onClick={() => go('worker-entry')}><img src="/images/role-worker.png" alt="" className="h-[150px] w-[180px] object-contain sm:h-[200px] sm:w-[240px]" /></RoleCard>
    </div>
    {error && <Panel className="mt-5 border-[#9A3732]/30 bg-[#FDE7E4]"><p role="alert" className="text-lg font-bold text-[#812D28]">{error}</p><ActionButton className="mt-4" onClick={enterOwner}>{t.retry}</ActionButton></Panel>}
  </div>;
}

export function WebApp({ initialLocale }: { initialLocale: Locale }) {
  const initial = routeState(); const requestedLocale = new URLSearchParams(window.location.search).get('lang');
  const [screen, setScreen] = useState<AppScreen>(initial.screen); const [sessionId, setSessionId] = useState<string | null>(initial.sessionId); const sessionIdRef = useRef<string | null>(initial.sessionId); const [token, setToken] = useState<string | null>(initial.token);
  const [workerLocale, setWorkerLocale] = useState<WorkerLocale>(requestedLocale === 'ne' || initialLocale === 'ne' ? 'ne' : 'vi'); const [draft, setDraft] = useState<WorkDraft | null>(null); const [session, setSessionState] = useState<OwnerWorkSession | null>(null);
  const setSession = (next: OwnerWorkSession | null) => { setSessionState(next); if (next) { sessionIdRef.current = next.session_id; setSessionId(next.session_id); } };
  const go = (next: AppScreen) => { setScreen(next); window.history.pushState({}, '', pathFor(next, workerLocale, sessionIdRef.current, token)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const changeLocale = (next: WorkerLocale) => { setWorkerLocale(next); document.documentElement.lang = next; };
  useEffect(() => { const needsSession = ['owner-current', 'owner-change', 'owner-storyboard'].includes(screen); if (needsSession && sessionId && session?.session_id !== sessionId) api.getSession(sessionId).then(setSession).catch(() => setSession(null)); }, [screen, sessionId, session?.session_id]);
  useEffect(() => { document.documentElement.lang = screen === 'role' || screen === 'worker-entry' ? initialLocale : screen.startsWith('worker-') || screen === 'owner-brief' ? workerLocale : 'ko'; }, [screen, workerLocale, initialLocale]);
  useEffect(() => { const pop = () => { const next = routeState(); setScreen(next.screen); sessionIdRef.current = next.sessionId; setSessionId(next.sessionId); setToken(next.token); }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const worker = screen.startsWith('worker-'); const hideNavigation = screen === 'role' || screen === 'worker-entry';
  return <AppShell role={worker ? 'worker' : 'owner'} active={screen} workerLocale={workerLocale} go={go} setWorkerLocale={changeLocale} hideNavigation={hideNavigation} hideHeader={screen === 'role'}>{screen === 'role' ? <RoleSelectScreen go={go} locale={initialLocale} /> : worker ? <WorkerScreenRouter screen={screen} go={go} token={token} locale={workerLocale} entryLocale={initialLocale} setLocale={changeLocale} /> : <OwnerScreenRouter screen={screen} go={go} workerLocale={workerLocale} setWorkerLocale={changeLocale} draft={draft} setDraft={setDraft} session={session} setSession={setSession} sessionId={sessionId} />}</AppShell>;
}
