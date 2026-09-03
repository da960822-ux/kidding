import { Mail, MessageCircle, MessagesSquare, Sprout } from 'lucide-react';
import type { LandingContent } from '../types';
import { Container } from './ui';

export function Footer({ content }: { content: LandingContent }) {
  const links = [
    { href: '#service', label: content.nav.about },
    { href: '#', label: content.footer.terms },
    { href: '#', label: content.footer.privacy },
    { href: 'mailto:hello@batmeori.kr', label: content.footer.contact },
  ];
  const contacts = [
    { href: '#faq', label: '채팅 문의', Icon: MessageCircle },
    { href: '#faq', label: '메시지 문의', Icon: MessagesSquare },
    { href: 'mailto:hello@batmeori.kr', label: '이메일 문의', Icon: Mail },
  ];

  return (
    <footer className="border-t border-deep/10 bg-cream py-10">
      <Container className="grid gap-8 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage text-deep"><Sprout className="h-6 w-6" aria-hidden="true" /></span>
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <strong className="text-xl font-black text-ink">밭머리</strong>
              <span className="text-sm font-bold text-primary">{content.tagline}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{content.footer.copyright}</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-3" aria-label="하단 메뉴">
          {links.map((link) => <a key={link.label} href={link.href} className="rounded-md py-2 text-sm font-bold text-muted transition hover:text-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{link.label}</a>)}
        </nav>

        <div className="flex gap-2">
          {contacts.map(({ href, label, Icon }) => (
            <a key={label} href={href} aria-label={label} className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-sm transition hover:-translate-y-0.5 hover:bg-sage focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </a>
          ))}
        </div>
      </Container>
    </footer>
  );
}
