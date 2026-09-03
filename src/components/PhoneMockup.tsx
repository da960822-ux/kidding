import { Bell, CheckCircle2, Menu, Mic, QrCode } from 'lucide-react';
import type { LandingContent } from '../types';

export function PhoneMockup({ content }: { content: LandingContent }) {
  return (
    <div className="relative mx-auto w-full max-w-[350px] lg:ml-auto">
      <div className="absolute -inset-5 rounded-[48px] bg-white/35 blur-xl" aria-hidden="true" />
      <div className="relative rounded-[48px] border-[8px] border-[#172019] bg-[#172019] p-1 shadow-phone">
        <div className="overflow-hidden rounded-[36px] bg-[#F7F7F3]">
          <div className="relative h-8 bg-[#F7F7F3]">
            <div className="absolute left-1/2 top-1.5 h-5 w-20 -translate-x-1/2 rounded-full bg-[#101712]" />
          </div>
          <div className="flex items-center justify-between px-5 py-3 text-ink">
            <Menu className="h-5 w-5" aria-hidden="true" />
            <strong className="font-black">밭머리</strong>
            <Bell className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="mx-4 rounded-3xl bg-white px-5 py-6 text-center shadow-[0_12px_35px_rgba(47,93,53,0.10)]">
            <h3 className="whitespace-pre-line text-2xl font-black leading-snug text-ink">{content.phone.question}</h3>
            <button type="button" className="mx-auto mt-5 flex h-32 w-32 flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#64A34D] to-deep text-white shadow-[0_14px_28px_rgba(47,93,53,0.28)] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow/60">
              <Mic className="h-11 w-11" strokeWidth={2.1} aria-hidden="true" />
              <span className="mt-2 font-black">{content.phone.speak}</span>
            </button>
            <button type="button" className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-deep/10 bg-white px-4 py-3 font-bold text-ink shadow-sm transition hover:bg-sage/30">
              <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
              {content.phone.write}
            </button>
          </div>

          <div className="px-4 pb-5 pt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <strong className="text-ink">{content.phone.recent}</strong>
              <span className="text-muted">{content.phone.more} ›</span>
            </div>
            <div className="rounded-2xl border border-deep/10 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-ink">{content.phone.task}</strong>
                  <p className="mt-2 text-xs text-muted">{content.phone.delivered} · {content.phone.time}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-7 -right-10 hidden rotate-[-12deg] text-deep lg:block" aria-hidden="true">
        <Sprig />
      </div>
    </div>
  );
}

function Sprig() {
  return (
    <div className="relative h-32 w-28">
      <span className="absolute bottom-0 left-1/2 h-28 w-1 -rotate-[28deg] rounded-full bg-deep/70" />
      <span className="absolute bottom-14 left-6 h-8 w-16 -rotate-[25deg] rounded-[100%_0_100%_0] bg-primary" />
      <span className="absolute bottom-7 left-11 h-8 w-16 rotate-[24deg] rounded-[100%_0_100%_0] bg-[#6C9B46]" />
      <span className="absolute bottom-20 left-10 h-7 w-14 rotate-[20deg] rounded-[100%_0_100%_0] bg-[#86AE4F]" />
    </div>
  );
}
