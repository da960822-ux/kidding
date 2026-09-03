import { Check, Image, Languages, MessageCircleMore } from 'lucide-react';
import type { LandingContent } from '../types';
import { Container } from './ui';
import { SectionTitle } from './SectionTitle';

const featureStyles = [
  { Icon: MessageCircleMore, panel: 'from-[#F5F8EB] to-[#EEF3DF]', icon: 'bg-white text-[#4B8A32]' },
  { Icon: Languages, panel: 'from-[#EEF8FF] to-[#E2F1FA]', icon: 'bg-white text-[#2B82C6]' },
  { Icon: Image, panel: 'from-[#FFF9E8] to-[#FFF0C9]', icon: 'bg-white text-[#E6A51B]' },
  { Icon: Check, panel: 'from-[#FFF3E9] to-[#FFE6D3]', icon: 'bg-gradient-to-br from-[#FF9A55] to-[#EB6B2B] text-white' },
];

export function FeaturesSection({ content }: { content: LandingContent }) {
  return (
    <section id="features" className="bg-[#FFFDF9] py-20 sm:py-24">
      <Container>
        <SectionTitle eyebrow={content.features.eyebrow}>
          {content.features.titleBefore}{' '}
          <span className="text-primary">{content.features.titleGreen}</span>{' '}
          <span className="text-[#2B82C6]">{content.features.titleBlue}</span>
        </SectionTitle>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {content.features.cards.map((feature, index) => {
            const { Icon, panel, icon } = featureStyles[index];
            return (
              <article key={feature.title} className={`group relative min-h-[295px] overflow-hidden rounded-3xl border border-white bg-gradient-to-b ${panel} p-7 text-center shadow-[0_12px_30px_rgba(47,93,53,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-soft`}>
                <div className="pointer-events-none absolute -right-8 top-20 h-20 w-28 rounded-full bg-white/65" aria-hidden="true" />
                <div className="pointer-events-none absolute right-8 top-24 h-12 w-20 rounded-full bg-white/55" aria-hidden="true" />
                <span className={`relative mx-auto flex h-20 w-20 items-center justify-center rounded-full shadow-sm ${icon}`}>
                  <Icon className="h-11 w-11" strokeWidth={2.2} aria-hidden="true" />
                </span>
                <h3 className="relative mt-7 text-xl font-black tracking-tight text-ink">{feature.title}</h3>
                <p className="relative mt-4 text-base font-medium leading-7 text-[#465247]">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
