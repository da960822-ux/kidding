import { ArrowRight, Sprout, Tractor, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '../types';
import { api } from './api';
import { AppShell } from './AppShell';
import type { IssuedWorkerLink, OwnerWorkSession, WorkDraft } from './contracts';
import type { AppScreen, WorkerLocale } from './model';
import { OwnerScreenRouter } from './OwnerScreens';
import { ActionButton, Panel } from './ScreenUI';
import { WorkerScreenRouter } from './WorkerScreens';

const appScreens: AppScreen[] = ['role', 'worker-entry', 'owner-home', 'owner-team', 'owner-record', 'owner-review', 'owner-storyboard', 'owner-current', 'owner-change', 'owner-change-confirm', 'owner-brief', 'worker-latest', 'worker-step', 'worker-link-error'];
const roleCopy = {
  ko: { title: '어떻게 이용하시나요?', intro: '로그인 없이 바로 시작할 수 있어요.', owner: '농장주예요', ownerBody: '작업을 말하고, 확인한 뒤 근로자에게 전달해요.', ownerAction: '농장주 화면으로', worker: '근로자예요', workerBody: '농장주에게 받은 링크로 내 언어의 작업 지시를 확인해요.', loading: '연결하고 있어요…', error: '농장주 화면에 연결하지 못했습니다. 인터넷을 확인하고 다시 눌러주세요.', retry: '다시 연결' },
  vi: { title: 'Bạn sử dụng dịch vụ với vai trò nào?', intro: 'Có thể bắt đầu ngay mà không cần đăng nhập.', owner: 'Tôi là chủ nông trại', ownerBody: 'Nói nội dung công việc, kiểm tra rồi gửi cho người lao động.', ownerAction: 'Mở màn hình chủ nông trại', worker: 'Tôi là người lao động', workerBody: 'Mở hướng dẫn bằng ngôn ngữ của tôi qua đường dẫn đã nhận.', loading: 'Đang kết nối…', error: 'Không thể kết nối. Hãy kiểm tra mạng và thử lại.', retry: 'Kết nối lại' },
  ne: { title: 'तपाईं कुन भूमिकामा प्रयोग गर्नुहुन्छ?', intro: 'लगइन नगरी तुरुन्त सुरु गर्न सकिन्छ।', owner: 'म खेत मालिक हुँ', ownerBody: 'कामको निर्देशन भन्नुहोस्, जाँच्नुहोस् र कामदारलाई पठाउनुहोस्।', ownerAction: 'खेत मालिक स्क्रिन खोल्नुहोस्', worker: 'म कामदार हुँ', workerBody: 'प्राप्त लिङ्कबाट आफ्नो भाषामा कामको निर्देशन हेर्नुहोस्।', loading: 'जडान हुँदैछ…', error: 'जडान हुन सकेन। इन्टरनेट जाँचेर फेरि प्रयास गर्नुहोस्।', retry: 'फेरि जडान' },
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
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const t = roleCopy[locale];
  const enterOwner = async () => { const pin = window.prompt('농장주 PIN을 입력하세요.'); if (!pin) return; setLoading(true); setError(''); try { await api.createOwnerSession(pin); go('owner-home'); } catch { setError(t.error); } finally { setLoading(false); } };
  return <div className="mx-auto max-w-4xl py-4 sm:py-12">
    <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-deep text-white"><Sprout className="h-8 w-8" /></span><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">{t.title}</h1><p className="mt-3 text-lg font-bold text-muted">{t.intro}</p></div>
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <button type="button" disabled={loading} onClick={enterOwner} className="group min-h-64 rounded-3xl bg-[#E2EDDC] p-7 text-left shadow-soft transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:opacity-60"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-deep text-white"><Tractor className="h-8 w-8" /></span><strong className="mt-6 block text-3xl font-black text-deep">{t.owner}</strong><span className="mt-3 block text-lg font-bold leading-8 text-[#465247]">{t.ownerBody}</span><span className="mt-6 flex items-center gap-2 text-lg font-black text-deep">{loading ? t.loading : t.ownerAction}<ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></span></button>
      <button type="button" onClick={() => go('worker-entry')} className="group min-h-64 rounded-3xl bg-[#E5F2FB] p-7 text-left shadow-soft transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6FAEE8]/35"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#327BB4] text-white"><UsersRound className="h-8 w-8" /></span><strong className="mt-6 block text-3xl font-black text-[#184E78]">{t.worker}</strong><span className="mt-3 block text-lg font-bold leading-8 text-[#405866]">{t.workerBody}</span><span className="mt-6 flex items-center gap-2 text-lg font-black text-[#184E78]">Worker · Công nhân · कामदार<ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" /></span></button>
    </div>
    {error && <Panel className="mt-5 border-[#9A3732]/30 bg-[#FDE7E4]"><p role="alert" className="text-lg font-bold text-[#812D28]">{error}</p><ActionButton className="mt-4" onClick={enterOwner}>{t.retry}</ActionButton></Panel>}
  </div>;
}

export function WebApp({ initialLocale }: { initialLocale: Locale }) {
  const initial = routeState(); const requestedLocale = new URLSearchParams(window.location.search).get('lang');
  const [screen, setScreen] = useState<AppScreen>(initial.screen); const [sessionId, setSessionId] = useState<string | null>(initial.sessionId); const sessionIdRef = useRef<string | null>(initial.sessionId); const [token, setToken] = useState<string | null>(initial.token);
  const [workerLocale, setWorkerLocale] = useState<WorkerLocale>(requestedLocale === 'ne' || initialLocale === 'ne' ? 'ne' : 'vi'); const [draft, setDraft] = useState<WorkDraft | null>(null); const [draftAudio, setDraftAudio] = useState<Blob | null>(null); const [session, setSessionState] = useState<OwnerWorkSession | null>(null); const [issuedWorkerLink, setIssuedWorkerLink] = useState<IssuedWorkerLink | null>(null);
  const setSession = (next: OwnerWorkSession | null) => { setSessionState(next); if (next) { sessionIdRef.current = next.session_id; setSessionId(next.session_id); } };
  const go = (next: AppScreen) => { setScreen(next); window.history.pushState({}, '', pathFor(next, workerLocale, sessionIdRef.current, token)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const changeLocale = (next: WorkerLocale) => { setWorkerLocale(next); document.documentElement.lang = next; };
  useEffect(() => { const needsSession = ['owner-current', 'owner-change', 'owner-storyboard'].includes(screen); if (needsSession && sessionId && session?.session_id !== sessionId) api.getSession(sessionId).then(setSession).catch(() => setSession(null)); }, [screen, sessionId, session?.session_id]);
  useEffect(() => { document.documentElement.lang = screen === 'role' || screen === 'worker-entry' ? initialLocale : screen.startsWith('worker-') || screen === 'owner-brief' ? workerLocale : 'ko'; }, [screen, workerLocale, initialLocale]);
  useEffect(() => { const pop = () => { const next = routeState(); setScreen(next.screen); sessionIdRef.current = next.sessionId; setSessionId(next.sessionId); setToken(next.token); }; window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const worker = screen.startsWith('worker-'); const hideNavigation = screen === 'role' || screen === 'worker-entry';
  return <AppShell role={worker ? 'worker' : 'owner'} active={screen} workerLocale={workerLocale} go={go} setWorkerLocale={changeLocale} hideNavigation={hideNavigation}>{screen === 'role' ? <RoleSelectScreen go={go} locale={initialLocale} /> : worker ? <WorkerScreenRouter screen={screen} go={go} token={token} locale={workerLocale} entryLocale={initialLocale} setLocale={changeLocale} /> : <OwnerScreenRouter screen={screen} go={go} workerLocale={workerLocale} setWorkerLocale={changeLocale} draft={draft} setDraft={setDraft} draftAudio={draftAudio} setDraftAudio={setDraftAudio} session={session} setSession={setSession} sessionId={sessionId} issuedWorkerLink={issuedWorkerLink} setIssuedWorkerLink={setIssuedWorkerLink} />}</AppShell>;
}
