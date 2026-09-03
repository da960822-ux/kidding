import {
  ClipboardCheck,
  ClipboardList,
  Home,
  LockKeyhole,
  LogOut,
  Menu,
  Sprout,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useState, type PropsWithChildren } from 'react';
import type { OwnerSession } from './contracts';
import type { AppRole, AppScreen, WorkerLocale } from './model';
import { buildRevision, isMockApi } from './api';

interface AppShellProps extends PropsWithChildren {
  role: AppRole;
  active: AppScreen;
  workerLocale: WorkerLocale;
  go: (screen: AppScreen) => void;
  ownerSession?: OwnerSession | null;
  currentWorkSessionId?: string | null;
  onLogout?: () => Promise<void>;
  hideNavigation?: boolean;
}

const ownerNav: Array<{ screen: AppScreen; label: string; icon: typeof Home }> = [
  { screen: 'owner-home', label: '홈', icon: Home },
  { screen: 'owner-team', label: '오늘 작업팀', icon: UsersRound },
  { screen: 'owner-current', label: '진행 중 작업', icon: ClipboardList },
];

export function AppShell({ children, role, active, workerLocale, go, ownerSession, currentWorkSessionId, onLogout, hideNavigation = false }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); const [loggingOut, setLoggingOut] = useState(false); const [logoutError, setLogoutError] = useState('');
  const workerLabels = workerLocale === 'vi'
    ? { menu: 'Menu công việc', today: 'Công việc', landing: 'Trang giới thiệu', open: 'Mở menu', close: 'Đóng menu', bottom: 'Điều hướng công việc' }
    : { menu: 'काम मेनु', today: 'आजको काम', landing: 'परिचय पृष्ठ', open: 'मेनु खोल्नुहोस्', close: 'मेनु बन्द गर्नुहोस्', bottom: 'काम नेभिगेसन' };
  const workerNav: Array<{ screen: AppScreen; label: string; icon: typeof Home }> = [
    { screen: 'worker-latest', label: workerLabels.today, icon: ClipboardCheck },
  ];
  const nav = role === 'owner' ? ownerNav : workerNav;
  const activeRoot = active.startsWith('owner-') ? active : active.startsWith('worker-') ? active : 'role';

  const navigate = (screen: AppScreen) => {
    setMobileMenuOpen(false);
    go(role === 'owner' && screen === 'owner-current' && !currentWorkSessionId ? 'owner-home' : screen);
  };
  const logout = async () => { if (!onLogout) return; setLoggingOut(true); setLogoutError(''); try { await onLogout(); } catch { setLogoutError('로그아웃하지 못했습니다. 다시 시도해주세요.'); setLoggingOut(false); } };

  return (
    <div className="batmeori-webapp min-h-screen bg-[#F5F7F3] text-ink" data-build-revision={buildRevision}>
      <a href="#webapp-main" className="fixed left-3 top-3 z-[60] -translate-y-24 rounded-xl bg-deep px-4 py-3 font-extrabold text-white focus:translate-y-0">{role === 'worker' ? (workerLocale === 'vi' ? 'Đi đến nội dung' : 'मुख्य सामग्रीमा जानुहोस्') : '본문으로 바로가기'}</a>
      <header className="sticky top-0 z-40 border-b border-deep/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 sm:gap-3" aria-label="밭머리 랜딩페이지">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-deep text-white"><Sprout className="h-6 w-6" aria-hidden="true" /></span>
            <span className="whitespace-nowrap text-xl font-black tracking-tight sm:text-2xl">밭머리</span>
          </a>

          {!hideNavigation && <div className="flex items-center gap-2 sm:gap-3">
            {isMockApi && <span className="inline-flex rounded-full bg-[#FFF0BF] px-3 py-2 text-sm font-black text-[#654B16]">{role === 'worker' ? (workerLocale === 'vi' ? 'NỘI DUNG DEMO' : 'डेमो सामग्री') : '데모 내용'}</span>}
            {role === 'worker' ? (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sage/60 px-3 text-sm font-extrabold text-deep">
                <LockKeyhole className="h-4 w-4" aria-hidden="true" />{workerLocale === 'vi' ? 'Tiếng Việt' : 'नेपाली'}
              </span>
            ) : (
              ownerSession && <span className="hidden rounded-full bg-sage/60 px-4 py-2 text-sm font-extrabold text-deep sm:inline-flex">{ownerSession.team?.status === 'PENDING' ? '작업 작성 중' : '24시간 작업팀'}</span>
            )}
            <div className="hidden items-center gap-2 rounded-full bg-[#EFF3ED] py-1.5 pl-1.5 pr-3 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
              <strong className="text-sm">{role === 'owner' ? '농장주' : workerLocale === 'vi' ? 'Người lao động' : 'कामदार'}</strong>
            </div>
            {role === 'owner' && <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="flex h-12 w-12 items-center justify-center rounded-xl border border-deep/10 lg:hidden" aria-expanded={mobileMenuOpen} aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}>
              {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>}
          </div>}
        </div>
      </header>

      <div className={`mx-auto grid max-w-[1500px] ${hideNavigation ? '' : 'lg:grid-cols-[240px_minmax(0,1fr)]'}`}>
        {!hideNavigation && <aside className={`${mobileMenuOpen ? 'block' : 'hidden'} border-b border-deep/10 bg-[#EEF3EC] p-4 lg:block lg:min-h-[calc(100vh-72px)] lg:border-b-0 lg:border-r lg:p-5`}>
          {role === 'owner' && ownerSession && <div className="mb-5 rounded-2xl bg-white p-4"><span className="block text-sm font-bold text-muted">현재 팀</span><strong className="mt-1 block text-base text-deep">{ownerSession.team?.status === 'PENDING' ? '첫 작업을 확정해주세요' : '작업팀 관리'}</strong><span className="mt-1 block text-sm font-bold text-muted">{ownerSession.team?.status === 'PENDING' ? '작업 작성 중' : '24시간 작업팀'}</span></div>}
          <p className="mb-3 hidden px-3 text-sm font-extrabold text-muted lg:block">{role === 'owner' ? '팀 관리' : workerLabels.menu}</p>
          <nav className="hidden gap-1.5 lg:grid" aria-label={role === 'owner' ? '웹앱 메뉴' : workerLabels.menu}>
            {nav.map(({ screen, label, icon: Icon }) => {
              const selected = activeRoot === screen || (screen === 'owner-current' && ['owner-change', 'owner-change-confirm'].includes(active));
              return (
                <button key={screen} type="button" onClick={() => navigate(screen)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-extrabold transition ${selected ? 'bg-deep text-white shadow-sm' : 'text-[#465247] hover:bg-white'}`}>
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />{label}
                </button>
              );
            })}
          </nav>

          <div className="mt-7 border-t border-deep/10 pt-5">
            {role === 'owner' ? <><button type="button" disabled={loggingOut} onClick={logout} className="mt-1 flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-3 font-extrabold text-muted hover:bg-white hover:text-deep disabled:opacity-50"><LogOut className="h-5 w-5" aria-hidden="true" />{loggingOut ? '로그아웃 중…' : '로그아웃'}</button>{logoutError && <p role="alert" className="mt-2 px-3 text-sm font-bold text-[#8A302B]">{logoutError}</p>}</> : <a href="/" className="mt-1 flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 font-extrabold text-muted hover:bg-white hover:text-deep"><LogOut className="h-5 w-5" aria-hidden="true" />{workerLabels.landing}</a>}
          </div>
        </aside>}

        <main id="webapp-main" className="min-w-0 px-4 py-7 sm:px-7 sm:py-9 lg:px-9 xl:px-12">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>

      {!hideNavigation && <nav className={`sticky bottom-0 z-30 grid ${role === 'owner' ? 'grid-cols-3' : 'grid-cols-1'} border-t border-deep/10 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden`} aria-label={role === 'worker' ? workerLabels.bottom : '모바일 하단 메뉴'}>
        {(role === 'owner' ? ownerNav : workerNav).map(({ screen, label, icon: Icon }) => {
          const selected = activeRoot === screen || (screen === 'owner-current' && ['owner-change', 'owner-change-confirm'].includes(active));
          return (
            <button key={screen} type="button" onClick={() => navigate(screen)} aria-current={selected ? 'page' : undefined} className={`flex min-h-[70px] flex-col items-center justify-center gap-1 px-2 py-2 text-base font-extrabold ${selected ? 'text-deep' : 'text-muted'}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />{label}
            </button>
          );
        })}
      </nav>}
    </div>
  );
}
