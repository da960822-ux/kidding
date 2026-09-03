import type { LandingContent } from '../types';

export function PhoneMockup({ content }: { content: LandingContent }) {
  return (
    <div className="relative mx-auto w-full max-w-[430px] lg:ml-auto">
      <div className="absolute inset-x-10 bottom-5 h-16 rounded-full bg-deep/20 blur-2xl" aria-hidden="true" />
      <img
        src="/images/phone-hero-generated.png"
        alt={`${content.phone.question.replace('\n', ' ')} ${content.phone.speak} 버튼과 최근 작업지시를 보여주는 밭머리 모바일 화면`}
        width="710"
        height="1475"
        className="relative h-auto w-full object-contain drop-shadow-[0_24px_34px_rgba(31,54,34,0.18)]"
        fetchPriority="high"
      />
    </div>
  );
}
