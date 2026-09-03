import { ArrowRight, CirclePlay, Languages, MessagesSquare, Sprout } from 'lucide-react';
import type { LandingContent, Locale } from '../types';
import { ButtonLink, Container } from './ui';
import { FarmBackdrop } from './FarmBackdrop';
import { PhoneMockup } from './PhoneMockup';

const benefitIcons = [Sprout, Languages, MessagesSquare];
const benefitColors = ['text-primary bg-white/90', 'text-[#287FC5] bg-white/90', 'text-[#E97C31] bg-white/90'];

export function HeroSection({ content, appHref, locale }: { content: LandingContent; appHref: string; locale: Locale }) {
  return (
    <section id="service" className="relative isolate overflow-hidden bg-gradient-to-b from-[#FFFDF7] via-[#FFF9E9] to-[#E9EFC7]">
      <FarmBackdrop />
      <Container className="relative z-10 grid min-h-[760px] items-center gap-14 pb-24 pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:pb-20 lg:pt-12">
        <div className="min-w-0 max-w-2xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/70 px-4 py-2 text-sm font-bold text-deep shadow-sm backdrop-blur">
            <Sprout className="h-4 w-4" aria-hidden="true" />
            {content.tagline}
          </div>
          <h1 className={`font-black leading-[1.12] tracking-[-0.04em] text-ink ${locale === 'ko' ? 'text-[clamp(2.25rem,11vw,3rem)] sm:text-6xl lg:text-7xl' : 'text-5xl sm:text-6xl lg:text-7xl'}`}>
            <span className="block">{content.hero.line1}</span>
            <span className="mt-2 block text-deep">{content.hero.line2}</span>
          </h1>
          <p className="mt-7 whitespace-pre-line text-lg font-medium leading-8 text-[#39493B] sm:text-xl sm:leading-9">
            {content.hero.description}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={appHref} className="sm:min-w-48">
              {content.hero.freeStart}<ArrowRight className="h-5 w-5" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href="#how" variant="secondary" className="sm:min-w-44">
              {content.hero.viewGuide}<CirclePlay className="h-5 w-5 text-primary" aria-hidden="true" />
            </ButtonLink>
          </div>

          <div className="mt-12 grid gap-3 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-soft backdrop-blur sm:grid-cols-3">
            {content.hero.benefits.map((benefit, index) => {
              const Icon = benefitIcons[index];
              return (
                <div key={benefit} className="flex items-center gap-3 rounded-2xl px-2 py-2 sm:border-r sm:border-deep/10 sm:last:border-r-0">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${benefitColors[index]}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-extrabold leading-6 text-ink">{benefit}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 pb-2 lg:pt-8">
          <PhoneMockup />
        </div>
      </Container>
    </section>
  );
}
