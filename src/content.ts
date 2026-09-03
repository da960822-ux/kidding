import type { LandingContent, Locale } from './types';

export const landingContent: Record<Locale, LandingContent> = {
  ko: {
    localeName: '한국어',
    tagline: '농사의 시작은 소통입니다',
    nav: { about: '서비스 소개', features: '주요 기능', how: '사용 방법', faq: '자주 묻는 질문' },
    start: '시작하기',
    hero: {
      line1: '말 한마디면,',
      line2: '일이 통합니다',
      description: '전라도 사투리로 말한 작업 지시를 AI가 이해해 베트남어와 네팔어로 정확히 전달합니다. 농장주와 근로자를 잇는 쉬운 방법, 밭머리.',
      freeStart: '무료로 시작하기',
      viewGuide: '사용법 보기',
      benefits: ['전라도 사투리도 이해해요', '베트남어·네팔어로 안내해요', '최신 작업을 바로 전달해요'],
    },
    phone: {
      question: '오늘은 어떤 작업을 하실까요?', speak: '말로 하기', write: '작업 확인하기', recent: '최근 작업 지시',
      more: '더보기', task: '1번 밭 양파 20망 수확', delivered: '안내 준비 완료', time: '오전 9:30',
    },
    features: {
      eyebrow: '밭머리가 특별한 이유', titleBefore: '농장 일을 더', titleGreen: '쉽게,', titleBlue: '정확하게',
      cards: [
        { title: '전라도 사투리로 말해도 괜찮아요', description: 'AI가 작업 지시로 정리하고, 애매한 내용은 농장주가 확인합니다.' },
        { title: '두 언어로 작업 안내', description: '베트남어와 네팔어로 작업 안내를 준비해 전달합니다.' },
        { title: '영상 또는 음성으로 안내', description: '검수된 영상이 없으면 글과 음성으로 안내합니다.' },
        { title: '확인한 수량만 반영', description: '농장주가 확인한 수량 변경만 최신 작업에 반영합니다.' },
      ],
    },
    cta: { title: '농장 소통이 쉬워집니다', description: '복잡하게 입력하지 않아도 됩니다. 말로 작업을 지시하고, 필요한 언어로 전달하세요.', button: '지금 시작하기' },
    how: {
      title: '사용 방법',
      steps: [
        { title: '말로 작업 지시', description: '양파나 딸기 작업, 수량, 장소를 말해주세요.' },
        { title: 'AI가 정리하고 농장주가 확인', description: 'AI가 모르는 내용은 추측하지 않고, 농장주가 정합니다.' },
        { title: '언어와 전달 방법 선택', description: '현장에서 함께 보거나, 링크 또는 오늘 작업팀 QR로 전달하세요.' },
        { title: '최신 작업 안내 전달', description: '근로자는 자기 언어로 최신 작업을 확인합니다.' },
      ],
    },
    footer: { copyright: '© 2026 밭머리. 모든 권리 보유.', terms: '이용 약관', privacy: '개인정보처리방침', contact: '문의하기' },
  },
  vi: {
    localeName: 'Tiếng Việt',
    tagline: 'Khởi đầu mùa vụ bằng sự thấu hiểu',
    nav: { about: 'Giới thiệu', features: 'Tính năng', how: 'Cách sử dụng', faq: 'Câu hỏi thường gặp' },
    start: 'Bắt đầu',
    hero: {
      line1: 'Chỉ cần nói,', line2: 'công việc sẽ thông suốt',
      description: 'Hãy giao việc bằng tiếng địa phương Jeolla. AI sẽ hiểu và truyền đạt chính xác bằng ngôn ngữ của người lao động. Cách dễ nhất để kết nối nông trại và người lao động — Batmeori.',
      freeStart: 'Bắt đầu miễn phí', viewGuide: 'Xem cách dùng',
      benefits: ['Hiểu cả tiếng địa phương', 'Dịch sang tiếng Việt và Nepal', 'Gửi ngay hướng dẫn mới nhất'],
    },
    phone: {
      question: 'Hôm nay bạn muốn\ngiao việc hành tây nào?', speak: 'Nói để giao việc', write: 'Mở QR nhóm hôm nay', recent: 'Công việc gần đây',
      more: 'Xem thêm', task: 'Thu hoạch 20 bao hành tây ở ruộng số 1', delivered: 'Hướng dẫn tiếng Việt đã sẵn sàng', time: '09:30',
    },
    features: {
      eyebrow: 'Điều làm Batmeori khác biệt', titleBefore: 'Công việc đồng áng', titleGreen: 'thuận tiện hơn,', titleBlue: 'chính xác hơn',
      cards: [
        { title: 'Cứ nói tự nhiên', description: 'AI hiểu cả cách nói tự nhiên và tiếng địa phương Jeolla.' },
        { title: 'Hướng dẫn bằng hai ngôn ngữ', description: 'Chuẩn bị hướng dẫn công việc bằng tiếng Việt và Nepal.' },
        { title: 'Video hoặc giọng nói', description: 'Nếu chưa có video đã kiểm duyệt, hãy đọc hoặc nghe hướng dẫn.' },
        { title: 'Cập nhật số lượng mới nhất', description: 'Chỉ thay đổi số lượng đã được chủ nông trại xác nhận.' },
      ],
    },
    cta: { title: 'Giờ đây, giao tiếp ở nông trại thật dễ dàng', description: 'Không cần nhập liệu phức tạp. Chỉ cần nói để giao việc và truyền đạt chính xác.', button: 'Bắt đầu ngay' },
    how: {
      title: 'Cách sử dụng',
      steps: [
        { title: 'Nói nội dung công việc', description: 'Nói công việc hành tây, số lượng và địa điểm.' },
        { title: 'Chủ nông trại kiểm tra', description: 'AI không đoán phần chưa rõ.' },
        { title: 'Chọn ngôn ngữ và cách gửi', description: 'Chọn xem cùng nhau, liên kết hoặc QR nhóm hôm nay.' },
        { title: 'Mở hướng dẫn mới nhất', description: 'Người lao động xem hướng dẫn mới nhất bằng ngôn ngữ của mình.' },
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
      description: 'जोल्ला क्षेत्रको स्थानीय बोलीमै काम भन्नुहोस्। AI ले बुझेर कामदारको भाषामा सही रूपमा पुर्‍याउँछ। फार्म र कामदार जोड्ने सबैभन्दा सजिलो उपाय — बाटमेओरी।',
      freeStart: 'निःशुल्क सुरु गर्नुहोस्', viewGuide: 'प्रयोग विधि हेर्नुहोस्',
      benefits: ['स्थानीय बोली पनि बुझ्छ', 'भियतनामी र नेपालीमा अनुवाद', 'नवीनतम निर्देशन तुरुन्त पठाउँछ'],
    },
    phone: {
      question: 'आज कुन प्याजको काम\nलगाउने?', speak: 'बोलेर निर्देशन दिनुहोस्', write: 'आजको टोली QR खोल्नुहोस्', recent: 'हालका काम निर्देशन',
      more: 'थप हेर्नुहोस्', task: 'खेत नम्बर १ मा प्याजका २० बोरा काट्नुहोस्', delivered: 'नेपाली निर्देशन तयार छ', time: 'बिहान ९:३०',
    },
    features: {
      eyebrow: 'बाटमेओरी किन विशेष छ', titleBefore: 'फार्मको काम अझ', titleGreen: 'सजिलो र', titleBlue: 'सही',
      cards: [
        { title: 'स्थानीय बोलीमै भन्नुहोस्', description: 'जोल्ला क्षेत्रको बोलीसहित स्वाभाविक कुरालाई AI ले सही बुझ्छ।' },
        { title: 'दुई भाषामा निर्देशन', description: 'भियतनामी र नेपालीमा काम निर्देशन तयार हुन्छ।' },
        { title: 'भिडियो वा आवाजमा निर्देशन', description: 'जाँच गरिएको भिडियो नभएमा निर्देशन पढ्नुहोस् वा सुन्नुहोस्।' },
        { title: 'नवीनतम परिमाण अपडेट', description: 'खेत मालिकले पुष्टि गरेको परिमाण मात्र अपडेट हुन्छ।' },
      ],
    },
    cta: { title: 'अब फार्मको सञ्चार सजिलो हुन्छ', description: 'जटिल इनपुट चाहिँदैन। बोलेर काम दिनुहोस् र सही रूपमा पुर्‍याउनुहोस्।', button: 'अहिले सुरु गर्नुहोस्' },
    how: {
      title: 'प्रयोग विधि',
      steps: [
        { title: 'बोलेर काम निर्देशन दिनुहोस्', description: 'प्याजको काम, परिमाण र स्थान भन्नुहोस्।' },
        { title: 'खेत मालिकले जाँच गर्नुहोस्', description: 'AI ले अस्पष्ट कुरा अनुमान गर्दैन।' },
        { title: 'भाषा र पठाउने तरिका छान्नुहोस्', description: 'सँगै हेर्ने, लिंक वा आजको टोली QR छान्नुहोस्।' },
        { title: 'नवीनतम निर्देशन खोल्नुहोस्', description: 'कामदारले आफ्नै भाषामा नवीनतम निर्देशन हेर्छ।' },
      ],
    },
    footer: { copyright: '© 2026 बाटमेओरी। सर्वाधिकार सुरक्षित।', terms: 'प्रयोगका सर्तहरू', privacy: 'गोपनीयता नीति', contact: 'सम्पर्क' },
  },
};
