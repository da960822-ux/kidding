import type { LandingContent, Locale } from './types';

export const landingContent: Record<Locale, LandingContent> = {
  ko: {
    localeName: '한국어',
    tagline: '농사의 시작, 소통이 답이다',
    nav: { about: '서비스 소개', features: '주요 기능', how: '사용 방법', faq: '자주 묻는 질문' },
    start: '시작하기',
    hero: {
      line1: '말하면,',
      line2: '밭머리가 일로 바꿉니다.',
      description: '사투리로 말해도 AI가 작업을 이해하고,\n영상과 다국어로 작업지시를 전달합니다.',
      freeStart: '무료로 시작하기',
      viewGuide: '사용법 보기',
      benefits: ['사투리도 정확하게 이해해요', '다국어로 번역해요', '최신 지시를 바로 전달해요'],
    },
    phone: {
      question: '오늘 무엇을\n시킬까요?', speak: '말로 하기', write: '작업 확인하기', recent: '최근 작업지시',
      more: '더보기', task: '고추밭 두 번째 줄에 물 주기', delivered: '베트남어로 전달됨', time: '오전 9:30',
    },
    features: {
      eyebrow: '밭머리가 특별한 이유', titleBefore: '농장 현장을 더', titleGreen: '편하게,', titleBlue: '정확하게',
      cards: [
        { title: '사투리 그대로 말해도 OK', description: '전라도 사투리를 포함한 자연스러운 말도 AI가 정확하게 이해해요.' },
        { title: '다국어로 한 번에 번역', description: '베트남어, 네팔어, 캄보디아어로 작업 내용을 빠르고 정확하게 전달해요.' },
        { title: '영상으로 더 쉽게 전달', description: '검수된 작업 영상이 있으면 단계별 내용과 함께 보여줘요.' },
        { title: '변경된 지시도 최신으로', description: '수량이 바뀌면 근로자에게 최신\n작업지시를 다시 보여줘요.' },
      ],
    },
    cta: { title: '이제, 농장의 소통이 쉬워집니다', description: '복잡한 입력은 이제 그만!\n말 한마디로 작업을 지시하고, 정확하게 전달하세요.', button: '지금 시작하기' },
    how: {
      title: '사용 방법',
      steps: [
        { title: '말로 지시하기', description: '작업 내용을 평소 말투\n그대로 말해요.' },
        { title: 'AI가 이해하고 번역', description: 'AI가 내용을 정리해\n세 가지 언어로 번역해요.' },
        { title: '근로자에게 전달', description: '번역된 내용을\n근로자에게 전달해요.' },
        { title: '최신 지시 확인', description: '근로자가 바뀐 내용까지\n최신 상태로 확인해요.' },
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
      line1: 'Chỉ cần nói,', line2: 'Batmeori biến lời nói thành công việc.',
      description: 'Dù nói bằng phương ngữ, AI vẫn hiểu công việc\nvà truyền đạt hướng dẫn bằng video và nhiều ngôn ngữ.',
      freeStart: 'Bắt đầu miễn phí', viewGuide: 'Xem cách dùng',
      benefits: ['Hiểu cả tiếng địa phương', 'Dịch sang tiếng Việt, Nepal và Khmer', 'Luôn gửi hướng dẫn mới nhất'],
    },
    phone: {
      question: 'Hôm nay bạn muốn\ngiao việc gì?', speak: 'Nói để nhập', write: 'Kiểm tra công việc', recent: 'Công việc gần đây',
      more: 'Xem thêm', task: 'Tưới hàng ớt thứ hai', delivered: 'Đã gửi bằng tiếng Việt', time: '09:30',
    },
    features: {
      eyebrow: 'Điều làm Batmeori khác biệt', titleBefore: 'Công việc đồng áng', titleGreen: 'thuận tiện hơn,', titleBlue: 'chính xác hơn',
      cards: [
        { title: 'Cứ nói tự nhiên', description: 'AI hiểu cả cách nói tự nhiên và tiếng địa phương Jeolla.' },
        { title: 'Dịch sang ba ngôn ngữ', description: 'Truyền đạt công việc bằng tiếng Việt, tiếng Nepal và tiếng Khmer.' },
        { title: 'Dễ hiểu hơn bằng video', description: 'Hiển thị video công việc đã được kiểm duyệt cùng từng bước.' },
        { title: 'Luôn là hướng dẫn mới nhất', description: 'Khi số lượng thay đổi, người lao động sẽ thấy nội dung mới nhất.' },
      ],
    },
    cta: { title: 'Giờ đây, giao tiếp ở nông trại thật dễ dàng', description: 'Không cần nhập liệu phức tạp.\nChỉ cần nói để giao việc và truyền đạt chính xác.', button: 'Bắt đầu ngay' },
    how: {
      title: 'Cách sử dụng',
      steps: [
        { title: 'Giao việc bằng lời nói', description: 'Nói nội dung công việc theo cách tự nhiên.' },
        { title: 'AI hiểu và dịch', description: 'AI sắp xếp nội dung rồi dịch sang ba ngôn ngữ được hỗ trợ.' },
        { title: 'Gửi cho người lao động', description: 'Gửi hướng dẫn đã dịch cho người lao động.' },
        { title: 'Xem hướng dẫn mới nhất', description: 'Người lao động luôn xem được nội dung đã cập nhật.' },
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
      line1: 'बोल्नुहोस्,', line2: 'बाटमेओरीले त्यसलाई काममा बदल्छ।',
      description: 'स्थानीय बोलीमा भने पनि AI ले काम बुझ्छ\nर भिडियो तथा धेरै भाषामा निर्देशन पुर्‍याउँछ।',
      freeStart: 'निःशुल्क सुरु गर्नुहोस्', viewGuide: 'प्रयोग विधि हेर्नुहोस्',
      benefits: ['स्थानीय बोली पनि बुझ्छ', 'भियतनामी, नेपाली र खमेरमा अनुवाद', 'सधैँ नयाँ निर्देशन पठाउँछ'],
    },
    phone: {
      question: 'आज कुन काम\nलगाउने?', speak: 'बोलेर लेख्नुहोस्', write: 'काम जाँच्नुहोस्', recent: 'हालका काम निर्देशन',
      more: 'थप हेर्नुहोस्', task: 'खुर्सानीको दोस्रो लाइनमा पानी हाल्नुहोस्', delivered: 'नेपालीमा पठाइयो', time: 'बिहान ९:३०',
    },
    features: {
      eyebrow: 'बाटमेओरी किन विशेष छ', titleBefore: 'फार्मको काम अझ', titleGreen: 'सजिलो र', titleBlue: 'सही',
      cards: [
        { title: 'स्थानीय बोलीमै भन्नुहोस्', description: 'जोल्ला क्षेत्रको बोलीसहित स्वाभाविक कुरालाई AI ले सही बुझ्छ।' },
        { title: 'तीन भाषामा अनुवाद', description: 'कामको निर्देशन भियतनामी, नेपाली र खमेरमा पुर्‍याउँछ।' },
        { title: 'भिडियोले अझ सजिलो', description: 'जाँच गरिएको कामको भिडियो प्रत्येक चरणसँग देखाउँछ।' },
        { title: 'सधैँ नयाँ निर्देशन', description: 'परिमाण बदलिँदा कामदारले नयाँ सामग्री देख्छ।' },
      ],
    },
    cta: { title: 'अब फार्मको सञ्चार सजिलो हुन्छ', description: 'जटिल इनपुट चाहिँदैन।\nबोलेर काम दिनुहोस् र सही रूपमा पुर्‍याउनुहोस्।', button: 'अहिले सुरु गर्नुहोस्' },
    how: {
      title: 'प्रयोग विधि',
      steps: [
        { title: 'बोलेर निर्देशन दिनुहोस्', description: 'कामको विवरण स्वाभाविक रूपमा बोल्नुहोस्।' },
        { title: 'AI ले बुझेर अनुवाद गर्छ', description: 'AI ले सामग्री मिलाएर समर्थित तीन भाषामा अनुवाद गर्छ।' },
        { title: 'कामदारलाई पठाउनुहोस्', description: 'अनुवाद गरिएको निर्देशन कामदारलाई पठाउनुहोस्।' },
        { title: 'नयाँ निर्देशन हेर्नुहोस्', description: 'कामदारले सधैँ अद्यावधिक सामग्री देख्छ।' },
      ],
    },
    footer: { copyright: '© 2026 बाटमेओरी। सर्वाधिकार सुरक्षित।', terms: 'प्रयोगका सर्तहरू', privacy: 'गोपनीयता नीति', contact: 'सम्पर्क' },
  },
  km: {
    localeName: 'ភាសាខ្មែរ',
    tagline: 'ការងារកសិកម្មចាប់ផ្តើមពីការទាក់ទងគ្នា',
    nav: { about: 'អំពីសេវាកម្ម', features: 'មុខងារសំខាន់ៗ', how: 'របៀបប្រើ', faq: 'សំណួរញឹកញាប់' },
    start: 'ចាប់ផ្តើម',
    hero: {
      line1: 'គ្រាន់តែនិយាយ,', line2: '밭머리 បម្លែងវាទៅជាការងារ។',
      description: 'ទោះនិយាយជាភាសាតំបន់ ក៏ AI យល់ពីការងារ\nហើយបញ្ជូនសេចក្តីណែនាំជាវីដេអូ និងច្រើនភាសា។',
      freeStart: 'ចាប់ផ្តើមដោយឥតគិតថ្លៃ', viewGuide: 'មើលរបៀបប្រើ',
      benefits: ['យល់សូម្បីតែភាសាតំបន់', 'បកប្រែជាវៀតណាម នេប៉ាល់ និងខ្មែរ', 'បញ្ជូនសេចក្តីណែនាំថ្មីបំផុត'],
    },
    phone: {
      question: 'ថ្ងៃនេះចង់ឱ្យធ្វើ\nការងារអ្វី?', speak: 'និយាយ', write: 'ពិនិត្យការងារ', recent: 'ការងារថ្មីៗ',
      more: 'មើលបន្ថែម', task: 'ស្រោចទឹកជួរម្ទេសទីពីរ', delivered: 'បានបញ្ជូនជាភាសាខ្មែរ', time: 'ម៉ោង 9:30 ព្រឹក',
    },
    features: {
      eyebrow: 'ហេតុអ្វី 밭머리 ពិសេស', titleBefore: 'ការងារកសិដ្ឋានកាន់តែ', titleGreen: 'ងាយស្រួល,', titleBlue: 'ត្រឹមត្រូវ',
      cards: [
        { title: 'និយាយតាមធម្មតាបាន', description: 'AI យល់ពាក្យសម្តីធម្មតា និងភាសាតំបន់ Jeolla។' },
        { title: 'បកប្រែជាបីភាសា', description: 'បញ្ជូនការងារជាភាសាវៀតណាម នេប៉ាល់ និងខ្មែរ។' },
        { title: 'យល់កាន់តែងាយតាមវីដេអូ', description: 'បង្ហាញវីដេអូការងារដែលបានត្រួតពិនិត្យជាមួយជំហាននីមួយៗ។' },
        { title: 'សេចក្តីណែនាំថ្មីបំផុត', description: 'ពេលបរិមាណផ្លាស់ប្តូរ កម្មករនឹងឃើញខ្លឹមសារថ្មីបំផុត។' },
      ],
    },
    cta: { title: 'ឥឡូវនេះ ការទាក់ទងនៅកសិដ្ឋានកាន់តែងាយស្រួល', description: 'មិនចាំបាច់បញ្ចូលព័ត៌មានស្មុគស្មាញទេ។\nគ្រាន់តែនិយាយ ដើម្បីបញ្ជាការងារ និងបញ្ជូនបានត្រឹមត្រូវ។', button: 'ចាប់ផ្តើមឥឡូវនេះ' },
    how: {
      title: 'របៀបប្រើ',
      steps: [
        { title: 'និយាយបញ្ជាការងារ', description: 'និយាយអំពីការងារតាមរបៀបធម្មតា។' },
        { title: 'AI យល់ និងបកប្រែ', description: 'AI រៀបចំខ្លឹមសារ ហើយបកប្រែជាបីភាសាដែលគាំទ្រ។' },
        { title: 'បញ្ជូនទៅកម្មករ', description: 'បញ្ជូនសេចក្តីណែនាំដែលបានបកប្រែទៅកម្មករ។' },
        { title: 'មើលសេចក្តីណែនាំថ្មីបំផុត', description: 'កម្មករអាចមើលខ្លឹមសារដែលបានធ្វើបច្ចុប្បន្នភាពជានិច្ច។' },
      ],
    },
    footer: { copyright: '© 2026 밭머리។ រក្សាសិទ្ធិគ្រប់យ៉ាង។', terms: 'លក្ខខណ្ឌប្រើប្រាស់', privacy: 'គោលការណ៍ឯកជនភាព', contact: 'ទាក់ទង' },
  },
};
