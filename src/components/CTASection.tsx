import { ArrowRight } from 'lucide-react';
import type { LandingContent } from '../types';
import { ButtonLink, Container } from './ui';

export function CTASection({ content, appHref }: { content: LandingContent; appHref: string }) {
  return (
    <section id="start" className="bg-[#FFFDF9] pb-20 sm:pb-24">
      <Container>
        <div className="relative overflow-hidden rounded-[32px] border border-yellow/70 bg-gradient-to-r from-[#FFF8DD] via-[#FFF9E9] to-[#FFF3C9] px-6 py-8 shadow-[0_14px_35px_rgba(163,122,29,0.08)] sm:px-9 lg:grid lg:grid-cols-[300px_1fr_auto] lg:items-center lg:gap-9 lg:px-11">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/45" aria-hidden="true" />
          <div className="flex items-center justify-center lg:justify-start" aria-hidden="true">
            <img
              src="/images/cta-farm.png"
              alt=""
              width="427"
              height="235"
              className="h-auto max-h-40 w-full max-w-[330px] object-contain drop-shadow-[0_10px_14px_rgba(81,104,48,0.10)]"
              loading="lazy"
            />
          </div>
          <div className="relative mt-5 lg:mt-0">
            <h2 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{content.cta.title}</h2>
            <p className="mt-3 whitespace-pre-line text-base font-medium leading-7 text-[#465247]">{content.cta.description}</p>
          </div>
          <ButtonLink href={appHref} className="relative mt-6 whitespace-nowrap lg:mt-0">
            {content.cta.button}<ArrowRight className="h-5 w-5" aria-hidden="true" />
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
