import { ChevronDown, Menu, Sprout, X } from 'lucide-react';
import { useState } from 'react';
import type { LandingContent, Locale } from '../types';
import { Container } from './ui';

interface HeaderProps {
  content: LandingContent;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  appHref: string;
}

const localeLabels: Record<Locale, string> = {
  ko: '한국어',
  vi: 'Tiếng Việt',
  ne: 'नेपाली',
};

export function Header({ content, locale, onLocaleChange, appHref }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { href: '#service', label: content.nav.about },
    { href: '#features', label: content.nav.features },
    { href: '#how', label: content.nav.how },
    { href: '#faq', label: content.nav.faq },
  ];

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-deep/10 bg-cream/95 backdrop-blur-md">
      <Container>
        <div className="flex min-h-[76px] items-center justify-between gap-4">
          <a href="#top" className="group flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25" aria-label="밭머리 홈">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage text-deep transition group-hover:-rotate-6">
              <Sprout className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <span className="flex items-baseline gap-3">
              <strong className="text-2xl font-black tracking-tight text-ink">밭머리</strong>
              <span className="hidden text-sm font-bold text-primary xl:inline">{content.tagline}</span>
            </span>
          </a>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="주요 메뉴">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="rounded-lg py-3 text-[15px] font-bold text-ink transition hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <label className="relative block">
              <span className="sr-only">언어 선택</span>
              <select
                value={locale}
                onChange={(event) => onLocaleChange(event.target.value as Locale)}
                className="min-h-11 w-[88px] appearance-none rounded-xl border border-deep/15 bg-white py-2 pl-2 pr-7 text-xs font-bold text-ink shadow-sm focus:outline-none focus:ring-4 focus:ring-primary/20 sm:w-auto sm:pl-3 sm:pr-9 sm:text-sm"
                aria-label="언어 선택"
              >
                {Object.entries(localeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" aria-hidden="true" />
            </label>
            <a href={appHref} className="hidden min-h-12 items-center rounded-2xl bg-deep px-5 py-3 font-bold text-white shadow-[0_8px_20px_rgba(47,93,53,0.18)] transition hover:-translate-y-0.5 hover:bg-[#244d2b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 md:inline-flex">
              {content.start}
            </a>
            <button
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-deep/15 bg-white text-ink lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="mobile-navigation" className="border-t border-deep/10 pb-5 pt-4 lg:hidden" aria-label="모바일 메뉴">
            <div className="grid gap-1">
              {links.map((link) => (
                <a key={link.href} href={link.href} onClick={closeMenu} className="rounded-xl px-3 py-3 text-base font-bold text-ink hover:bg-sage/60">
                  {link.label}
                </a>
              ))}
              <a href={appHref} onClick={closeMenu} className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-deep px-5 py-3 font-bold text-white">
                {content.start}
              </a>
            </div>
          </nav>
        )}
      </Container>
    </header>
  );
}
