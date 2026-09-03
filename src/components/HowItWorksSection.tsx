import { ArrowDown, ArrowRight, CheckSquare, Mic, Send, Sparkles } from 'lucide-react';
import type { LandingContent } from '../types';
import { Container } from './ui';
import { SectionTitle } from './SectionTitle';

const stepStyles = [
  { Icon: Mic, bubble: 'bg-[#E9F3DA] text-[#4D882E]', number: 'bg-[#5E9639]' },
  { Icon: Sparkles, bubble: 'bg-[#E2F3FF] text-[#2B82C6]', number: 'bg-[#2B82C6]' },
  { Icon: Send, bubble: 'bg-[#FFF2C9] text-[#D99A11]', number: 'bg-[#F0AD1D]' },
  { Icon: CheckSquare, bubble: 'bg-[#FFE8D7] text-[#EA762E]', number: 'bg-[#ED762F]' },
];

export function HowItWorksSection({ content }: { content: LandingContent }) {
  return (
    <section id="how" className="relative overflow-hidden bg-gradient-to-b from-[#F3FAFF] to-[#EDF8FF] py-20 sm:py-24">
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-64 rounded-[50%] bg-[#CBE4AF]/70" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 -right-14 h-56 w-72 rounded-[50%] bg-[#DCEBAF]/70" aria-hidden="true" />
      <Container className="relative">
        <SectionTitle eyebrow={content.features.eyebrow}>{content.how.title}</SectionTitle>
        <ol className="grid gap-5 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center md:gap-3">
          {content.how.steps.map((step, index) => {
            const { Icon, bubble, number } = stepStyles[index];
            return (
              <li key={step.title} className="contents">
                <article className="relative flex min-h-[250px] flex-col items-center rounded-3xl bg-white/55 px-5 py-7 text-center md:bg-transparent">
                  <span className={`absolute left-4 top-5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-white md:left-[calc(50%-54px)] ${number}`}>{index + 1}</span>
                  <span className={`flex h-24 w-24 items-center justify-center rounded-full ${bubble}`}>
                    <Icon className="h-12 w-12" strokeWidth={2} aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-lg font-black text-ink">{step.title}</h3>
                  <p className="mt-3 max-w-[220px] text-base font-medium leading-7 text-[#465247]">{step.description}</p>
                </article>
                {index < content.how.steps.length - 1 && (
                  <div className="flex items-center justify-center text-deep/35" aria-hidden="true">
                    <ArrowDown className="h-7 w-7 md:hidden" />
                    <ArrowRight className="hidden h-8 w-8 md:block" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
