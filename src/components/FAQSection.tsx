import { ChevronDown } from 'lucide-react';
import type { Locale } from '../types';
import { Container } from './ui';

const faqContent: Record<Locale, { title: string; items: Array<{ q: string; a: string }> }> = {
  ko: {
    title: '자주 묻는 질문',
    items: [
      { q: '전라도 사투리도 잘 알아듣나요?', a: '네. 자연스러운 사투리 표현을 AI가 작업 맥락에 맞게 정리하며, 애매한 내용은 전달 전에 다시 확인합니다.' },
      { q: '작업자는 앱을 설치해야 하나요?', a: '아니요. 밭머리는 모바일 웹앱으로 제공되어 받은 주소를 브라우저에서 열면 바로 사용할 수 있습니다.' },
      { q: '어떤 언어를 지원하나요?', a: '한국어를 기본으로 베트남어와 네팔어를 지원하며, 캄보디아어 등 지원 언어를 순차 확대할 예정입니다.' },
    ],
  },
  vi: {
    title: 'Câu hỏi thường gặp',
    items: [
      { q: 'AI có hiểu tiếng địa phương Jeolla không?', a: 'Có. AI sắp xếp cách nói tự nhiên theo ngữ cảnh công việc và sẽ hỏi lại trước khi gửi nếu có điểm chưa rõ.' },
      { q: 'Người lao động có cần cài ứng dụng không?', a: 'Không. Batmeori là web app di động, chỉ cần mở đường dẫn được gửi bằng trình duyệt.' },
      { q: 'Dịch vụ hỗ trợ những ngôn ngữ nào?', a: 'Dịch vụ hiện hỗ trợ tiếng Hàn, tiếng Việt và tiếng Nepal. Các ngôn ngữ khác sẽ được bổ sung dần.' },
    ],
  },
  ne: {
    title: 'बारम्बार सोधिने प्रश्नहरू',
    items: [
      { q: 'AI ले जोल्ला क्षेत्रको बोली बुझ्छ?', a: 'बुझ्छ। AI ले स्वाभाविक बोलीलाई कामको सन्दर्भमा मिलाउँछ र अस्पष्ट कुरा पठाउनुअघि फेरि सोध्छ।' },
      { q: 'कामदारले एप डाउनलोड गर्नुपर्छ?', a: 'पर्दैन। बाटमेओरी मोबाइल वेब एप हो, पठाइएको लिंक ब्राउजरमा खोलेर तुरुन्त प्रयोग गर्न सकिन्छ।' },
      { q: 'कुन भाषाहरू उपलब्ध छन्?', a: 'हाल कोरियाली, भियतनामी र नेपाली उपलब्ध छन्। थप भाषाहरू क्रमशः थपिनेछन्।' },
    ],
  },
};

export function FAQSection({ locale }: { locale: Locale }) {
  const content = faqContent[locale];
  return (
    <section id="faq" className="bg-[#FFFDF9] py-20 sm:py-24">
      <Container className="max-w-4xl">
        <h2 className="mb-9 text-center text-3xl font-black tracking-tight text-ink sm:text-4xl">{content.title}</h2>
        <div className="grid gap-3">
          {content.items.map((item) => (
            <details key={item.q} className="group rounded-2xl border border-deep/10 bg-white px-5 py-1 shadow-sm open:shadow-soft sm:px-6">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-black text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-primary transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="border-t border-deep/10 pb-5 pt-4 text-base font-medium leading-7 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
