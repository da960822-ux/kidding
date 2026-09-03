import type { LandingContent, Locale } from './types';

export const landingContent: Record<Locale, LandingContent> = {
  ko: {
    localeName: '한국어',
    tagline: '농사의 시작, 소통이 답이다',
    nav: { about: '서비스 소개', features: '주요 기능', how: '사용 방법', faq: '자주 묻는 질문' },
    start: '시작하기',
    hero: {
      line1: '말 한마디면,',
      line2: '일이 통합니다',
      description: '전라도 사투리로 말하는 작업지시,\nAI가 이해하고 외국어로 정확하게 전달해요.\n농장과 근로자를 잇는 가장 쉬운 방법, 밭머리',
      freeStart: '무료로 시작하기',
      viewGuide: '사용법 보기',
      benefits: ['사투리도 정확하게 이해해요', '여러 언어로 바로 번역해요', '쉽고 빠르게 전달하고 확인해요'],
    },
    phone: {
      question: '오늘 무엇을\n시킬까요?', speak: '말로 하기', write: '글로 입력하기', recent: '최근 작업지시',
      more: '더보기', task: '고추밭 두 번째 줄에 물 주기', delivered: '베트남어로 전달됨', time: '오전 9:30',
    },
    features: {
      eyebrow: '밭머리가 특별한 이유', titleBefore: '농장 현장을 더', titleGreen: '편하게,', titleBlue: '정확하게',
      cards: [
        { title: '사투리 그대로 말해도 OK', description: '전라도 사투리를 포함한 자연스러운 말도 AI가 정확하게 이해해요.' },
        { title: '다국어로 한 번에 번역', description: '베트남어와 네팔어로 작업 내용을 빠르고 정확하게 전달해요.' },
        { title: '사진으로 더 쉽게 전달', description: '사진을 함께 보내면 더 정확한 작업 이해가 가능해요.' },
        { title: '전달 확인까지 한 번에', description: '근로자가 내용을 확인하면 완료 여부를 바로 알 수 있어요.' },
      ],
    },
    cta: { title: '이제, 농장의 소통이 쉬워집니다', description: '복잡한 입력은 이제 그만!\n말 한마디로 작업을 지시하고, 정확하게 전달하세요.', button: '지금 시작하기' },
    how: {
      title: '사용 방법',
      steps: [
        { title: '말하거나 입력하기', description: '작업 내용을 말로 하거나 글로 입력해요.' },
        { title: 'AI가 이해하고 번역', description: 'AI가 내용을 이해하고, 다국어로 번역해요.' },
        { title: '근로자에게 전달', description: '번역된 내용을 근로자에게 전달해요.' },
        { title: '확인하고 완료', description: '근로자가 확인하면 작업이 완료돼요.' },
      ],
    },
    footer: { copyright: '© 2026 밭머리. All rights reserved.', terms: '이용 약관', privacy: '개인정보처리방침', contact: '문의하기' },
  },
  vi: {
    localeName: 'Tiếng Việt',
    tagline: 'Khởi đầu mùa vụ bằng sự thấu hiểu',
    nav: { about: 'Giới thiệu', features: 'Tính năng', how: 'Cách sử dụng', faq: 'Câu hỏi thường gặp' },
    start: 'Bắt đầu',
    hero: {
      line1: 'Chỉ cần nói,', line2: 'công việc sẽ thông suốt',
      description: 'Hãy giao việc bằng tiếng địa phương Jeolla.\nAI sẽ hiểu và truyền đạt chính xác bằng ngôn ngữ của người lao động.\nCách dễ nhất để kết nối nông trại và người lao động — Batmeori.',
      freeStart: 'Bắt đầu miễn phí', viewGuide: 'Xem cách dùng',
      benefits: ['Hiểu cả tiếng địa phương', 'Dịch ngay sang nhiều ngôn ngữ', 'Gửi và xác nhận thật dễ dàng'],
    },
    phone: {
      question: 'Hôm nay bạn muốn\ngiao việc gì?', speak: 'Nói để nhập', write: 'Nhập bằng chữ', recent: 'Công việc gần đây',
      more: 'Xem thêm', task: 'Tưới hàng ớt thứ hai', delivered: 'Đã gửi bằng tiếng Việt', time: '09:30',
    },
    features: {
      eyebrow: 'Điều làm Batmeori khác biệt', titleBefore: 'Công việc đồng áng', titleGreen: 'thuận tiện hơn,', titleBlue: 'chính xác hơn',
      cards: [
        { title: 'Cứ nói tự nhiên', description: 'AI hiểu cả cách nói tự nhiên và tiếng địa phương Jeolla.' },
        { title: 'Dịch nhiều ngôn ngữ cùng lúc', description: 'Dịch nhanh và chính xác sang tiếng Việt, Nepal, Campuchia và nhiều ngôn ngữ khác.' },
        { title: 'Dễ hiểu hơn bằng hình ảnh', description: 'Gửi kèm hình ảnh để người lao động hiểu công việc chính xác hơn.' },
        { title: 'Theo dõi cả việc xác nhận', description: 'Biết ngay người lao động đã xem và hoàn thành hướng dẫn hay chưa.' },
      ],
    },
    cta: { title: 'Giờ đây, giao tiếp ở nông trại thật dễ dàng', description: 'Không cần nhập liệu phức tạp.\nChỉ cần nói để giao việc và truyền đạt chính xác.', button: 'Bắt đầu ngay' },
    how: {
      title: 'Cách sử dụng',
      steps: [
        { title: 'Nói hoặc nhập', description: 'Nói hoặc gõ nội dung công việc.' },
        { title: 'AI hiểu và dịch', description: 'AI hiểu nội dung và dịch sang nhiều ngôn ngữ.' },
        { title: 'Gửi cho người lao động', description: 'Gửi hướng dẫn đã dịch cho người lao động.' },
        { title: 'Xác nhận và hoàn tất', description: 'Công việc hoàn tất sau khi người lao động xác nhận.' },
      ],
    },
    footer: { copyright: '© 2026 Batmeori. Đã đăng ký bản quyền.', terms: 'Điều khoản', privacy: 'Chính sách bảo mật', contact: 'Liên hệ' },
  },
  ne: {
    localeName: 'नेपाली',
    tagline: 'खेतीको सुरुवात, सही सञ्चारबाट',
    nav: { about: 'सेवा परिचय', features: 'मुख्य सुविधा', how: 'प्रयोग विधि', faq: 'सोधिने प्रश्नहरू' },
    start: 'सुरु गर्नुहोस्',
    hero: {
      line1: 'एक वाक्य बोले पुग्छ,', line2: 'काम सजिलै बुझिन्छ',
      description: 'जोल्ला क्षेत्रको स्थानीय बोलीमै काम भन्नुहोस्।\nAI ले बुझेर कामदारको भाषामा सही रूपमा पुर्‍याउँछ।\nफार्म र कामदार जोड्ने सबैभन्दा सजिलो उपाय — बाटमेओरी।',
      freeStart: 'निःशुल्क सुरु गर्नुहोस्', viewGuide: 'प्रयोग विधि हेर्नुहोस्',
      benefits: ['स्थानीय बोली पनि बुझ्छ', 'धेरै भाषामा तुरुन्त अनुवाद', 'सजिलै पठाउनुहोस् र पुष्टि गर्नुहोस्'],
    },
    phone: {
      question: 'आज कुन काम\nलगाउने?', speak: 'बोलेर लेख्नुहोस्', write: 'टाइप गर्नुहोस्', recent: 'हालका काम निर्देशन',
      more: 'थप हेर्नुहोस्', task: 'खुर्सानीको दोस्रो लाइनमा पानी हाल्नुहोस्', delivered: 'नेपालीमा पठाइयो', time: 'बिहान ९:३०',
    },
    features: {
      eyebrow: 'बाटमेओरी किन विशेष छ', titleBefore: 'फार्मको काम अझ', titleGreen: 'सजिलो र', titleBlue: 'सही',
      cards: [
        { title: 'स्थानीय बोलीमै भन्नुहोस्', description: 'जोल्ला क्षेत्रको बोलीसहित स्वाभाविक कुरालाई AI ले सही बुझ्छ।' },
        { title: 'एकै पटक धेरै भाषामा', description: 'भियतनामी, नेपाली, कम्बोडियाली लगायतका भाषामा छिटो अनुवाद हुन्छ।' },
        { title: 'फोटोले अझ सजिलो', description: 'फोटोसँगै पठाउँदा कामलाई अझ सही रूपमा बुझ्न सकिन्छ।' },
        { title: 'पुष्टि पनि एकै ठाउँमा', description: 'कामदारले निर्देशन हेरेपछि तुरुन्त पुष्टि अवस्था थाहा पाउनुहोस्।' },
      ],
    },
    cta: { title: 'अब फार्मको सञ्चार सजिलो हुन्छ', description: 'जटिल इनपुट चाहिँदैन।\nबोलेर काम दिनुहोस् र सही रूपमा पुर्‍याउनुहोस्।', button: 'अहिले सुरु गर्नुहोस्' },
    how: {
      title: 'प्रयोग विधि',
      steps: [
        { title: 'बोल्नुहोस् वा लेख्नुहोस्', description: 'कामको विवरण बोलेर वा टाइप गरेर दिनुहोस्।' },
        { title: 'AI ले बुझेर अनुवाद गर्छ', description: 'AI ले सामग्री बुझेर धेरै भाषामा अनुवाद गर्छ।' },
        { title: 'कामदारलाई पठाउनुहोस्', description: 'अनुवाद गरिएको निर्देशन कामदारलाई पठाउनुहोस्।' },
        { title: 'पुष्टि गरी पूरा गर्नुहोस्', description: 'कामदारले पुष्टि गरेपछि काम पूरा हुन्छ।' },
      ],
    },
    footer: { copyright: '© 2026 बाटमेओरी। सर्वाधिकार सुरक्षित।', terms: 'प्रयोगका सर्तहरू', privacy: 'गोपनीयता नीति', contact: 'सम्पर्क' },
  },
};
