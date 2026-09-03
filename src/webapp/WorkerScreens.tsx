import { AlertCircle, ArrowLeft, ArrowRight, Camera, Check, ChevronLeft, ChevronRight, Clock3, History, Link2Off, UserRound, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { AssignmentReceipt, LegacyWorkerBriefing, TeamMember, V2WorkerBriefing, V2WorkerStep, WorkerAssignment, WorkerBriefingBadge } from './contracts';
import type { AppScreen, ScreenProps, WorkerLocale } from './model';
import type { Locale } from '../types';
import { ActionButton, Callout, FactRow, PageHeading, Panel, PanelHeader, ProgressBar, StatusBadge } from './ScreenUI';

interface WorkerScreenProps extends ScreenProps { screen: AppScreen; token: string | null; locale: WorkerLocale; entryLocale: Locale; setLocale: (locale: WorkerLocale) => void; }
const labels = {
  vi: { latest: 'Công việc mới nhất', today: 'Công việc hôm nay', location: 'Địa điểm', amount: 'Số lượng', deadline: 'Hoàn thành', note: 'Ghi chú', safety: 'An toàn', listen: 'Nghe hướng dẫn', view: 'Xem từng bước', prev: 'Trước', next: 'Tiếp theo', workList: 'Quay lại danh sách công việc', fallback: 'Không có video đã kiểm duyệt. Hãy đọc hoặc nghe hướng dẫn.', unsupported: 'Công việc này nằm ngoài phạm vi hướng dẫn đã kiểm duyệt. Hãy đọc hoặc nghe chỉ dẫn đã được chủ nông trại xác nhận. Nếu chưa rõ, hãy hỏi chủ nông trại trước khi làm.', unavailable: 'Không thể mở đường dẫn', expired: 'Đường dẫn đã hết hạn. Hãy xin chủ nông trại gửi lại đường dẫn mới.', invalid: 'Không thể truy cập. Hãy kiểm tra đường dẫn hoặc hỏi chủ nông trại.', stale: 'Không thể kiểm tra hướng dẫn mới nhất. Nội dung bên dưới có thể đã cũ.', retry: 'Thử lại', updated: 'Có hướng dẫn mới. Hãy xem lại từ bước đầu tiên.', audioFailed: 'Không thể phát giọng nói. Hãy đọc nội dung bên dưới.', needs: 'Cần xác nhận với chủ nông trại', demo: 'NỘI DUNG DEMO', waiting: 'Hãy chờ chủ nông trại gửi hướng dẫn.', legacyTitle: 'Hướng dẫn công việc cũ', legacyDescription: 'Chỉ xem', legacyNotice: 'Đây là hướng dẫn cũ đã lưu. Số lượng chưa được cập nhật.' },
  ne: { latest: 'नयाँ काम', today: 'आजको काम', location: 'स्थान', amount: 'परिमाण', deadline: 'समय सीमा', note: 'टिप्पणी', safety: 'सुरक्षा', listen: 'निर्देशन सुन्नुहोस्', view: 'चरणहरू हेर्नुहोस्', prev: 'अघिल्लो', next: 'अर्को', workList: 'काम सूचीमा फर्कनुहोस्', fallback: 'जाँच गरिएको भिडियो छैन। निर्देशन पढ्नुहोस् वा सुन्नुहोस्।', unsupported: 'यो काम जाँच गरिएका निर्देशनको दायराबाहिर छ। खेत मालिकले पुष्टि गरेको निर्देशन पढ्नुहोस् वा सुन्नुहोस्। अस्पष्ट भए काम गर्नुअघि खेत मालिकलाई सोध्नुहोस्।', unavailable: 'लिङ्क खोल्न सकिएन', expired: 'लिङ्कको म्याद सकिएको छ। खेत मालिकसँग नयाँ लिङ्क माग्नुहोस्।', invalid: 'पहुँच गर्न सकिएन। लिङ्क जाँच्नुहोस् वा खेत मालिकलाई सोध्नुहोस्।', stale: 'नयाँ निर्देशन जाँच्न सकिएन। तलको जानकारी पुरानो हुन सक्छ।', retry: 'फेरि प्रयास', updated: 'नयाँ निर्देशन आएको छ। पहिलो चरणदेखि फेरि हेर्नुहोस्।', audioFailed: 'आवाज बजाउन सकिएन। तलको निर्देशन पढ्नुहोस्।', needs: 'खेत मालिकसँग पुष्टि गर्नुहोस्', demo: 'डेमो सामग्री', waiting: 'खेत मालिकको निर्देशन पर्खनुहोस्।', legacyTitle: 'पुरानो काम निर्देशन', legacyDescription: 'हेर्न मात्र', legacyNotice: 'यो पहिले सुरक्षित गरिएको पुरानो निर्देशन हो। परिमाण अद्यावधिक भएको छैन।' },
};

const badgeText = (locale: WorkerLocale, badge: WorkerBriefingBadge) => {
  const t = labels[locale];
  const messages: Record<WorkerBriefingBadge, string> = { AMBIGUITY: t.needs, UNSUPPORTED: t.unsupported, DEMO_FALLBACK: t.demo, TEXT_TTS_FALLBACK: t.fallback };
  return messages[badge];
};
const playableVideo = (assignment: V2WorkerBriefing, step: V2WorkerStep) => assignment.video.find((video) => video.step_sequence === step.sequence) ?? null;
const quantityText = (value: V2WorkerBriefing['context']['quantity']) => typeof value === 'object' && value ? `${value.value} ${value.unit}` : '—';
const captionsUrl = (text: string) => `data:text/vtt;charset=utf-8,${encodeURIComponent(`WEBVTT\n\n00:00.000 --> 23:59.000\n${text.replace(/\n/g, ' ')}`)}`;
const briefingSpeechText = (briefing: V2WorkerBriefing) => [...briefing.context.safety, ...briefing.steps.flatMap((step) => [step.title, step.description])].join('. ');

function SafetySources({ briefing }: { briefing: V2WorkerBriefing }) {
  const sources = briefing.source_detail.filter((source) => source.segment === 'SAFETY' && source.source === 'OFFICIAL_GUIDE' && source.verified && source.source_url && source.source_page && source.license);
  if (!sources.length) return null;
  const label = briefing.language_code === 'vi' ? 'Nguồn an toàn đã kiểm tra' : 'प्रमाणित सुरक्षा स्रोत';
  const page = briefing.language_code === 'vi' ? 'Trang' : 'पृष्ठ';
  return <div className="mt-4 rounded-2xl bg-[#F5F8F3] p-4"><strong className="text-base">{label}</strong><div className="mt-2 grid gap-2">{sources.map((source) => <a key={`${source.source_url}-${source.source_page}`} href={source.source_url!} target="_blank" rel="noreferrer" className="font-extrabold text-deep underline underline-offset-4">{label} · {page} {source.source_page}</a>)}</div></div>;
}

function BriefingAudioButton({ briefing }: { briefing: V2WorkerBriefing }) {
  const locale = briefing.language_code; const t = labels[locale]; const [speaking, setSpeaking] = useState(false); const [failed, setFailed] = useState(false); const audio = useRef<HTMLAudioElement | null>(null);
  const stop = () => { audio.current?.pause(); audio.current = null; window.speechSynthesis.cancel(); setSpeaking(false); };
  const browserSpeech = () => {
    if (!window.speechSynthesis) { setFailed(true); setSpeaking(false); return; }
    const speech = new SpeechSynthesisUtterance(briefingSpeechText(briefing));
    speech.lang = locale === 'vi' ? 'vi-VN' : 'ne-NP'; speech.onend = () => setSpeaking(false); speech.onerror = () => { setSpeaking(false); setFailed(true); };
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech);
  };
  const play = async () => {
    if (speaking) { stop(); return; }
    setFailed(false); setSpeaking(true); window.speechSynthesis.cancel();
    if (!briefing.tts.audio_url) { browserSpeech(); return; }
    const next = new Audio(briefing.tts.audio_url); audio.current = next; next.onended = () => setSpeaking(false); next.onerror = browserSpeech;
    try { await next.play(); } catch { browserSpeech(); }
  };
  useEffect(() => stop, [briefing.session_id, briefing.version]);
  const label = locale === 'vi' ? 'Nghe toàn bộ hướng dẫn' : 'पूरा निर्देशन सुन्नुहोस्';
  const stopLabel = locale === 'vi' ? 'Dừng nghe' : 'सुन्न बन्द गर्नुहोस्';
  return <div><ActionButton className="w-full" onClick={play}><Volume2 className={`h-5 w-5 ${speaking ? 'animate-pulse' : ''}`} />{speaking ? stopLabel : label}</ActionButton>{failed && <p role="alert" className="mt-3 text-base font-extrabold text-[#8A302B]">{t.audioFailed}</p>}</div>;
}

function SpeakButton({ step, audioUrl, locale, safety = [], className = '' }: { step: V2WorkerStep; audioUrl: string | null; locale: WorkerLocale; safety?: string[]; className?: string }) {
  const [speaking, setSpeaking] = useState(false); const [failed, setFailed] = useState(false); const audio = useRef<HTMLAudioElement | null>(null);
  const browserSpeech = () => { if (!window.speechSynthesis) { setFailed(true); setSpeaking(false); return; } const speech = new SpeechSynthesisUtterance([...safety, step.title, step.description].join('. ')); speech.lang = locale === 'vi' ? 'vi-VN' : 'ne-NP'; speech.onend = () => setSpeaking(false); speech.onerror = () => { setSpeaking(false); setFailed(true); }; window.speechSynthesis.cancel(); window.speechSynthesis.speak(speech); };
  const play = async () => { setFailed(false); setSpeaking(true); window.speechSynthesis.cancel(); audio.current?.pause(); if (!audioUrl) { browserSpeech(); return; } const next = new Audio(audioUrl); audio.current = next; next.onended = () => setSpeaking(false); next.onerror = browserSpeech; try { await next.play(); } catch { browserSpeech(); } };
  useEffect(() => () => { audio.current?.pause(); window.speechSynthesis.cancel(); }, [step.sequence, step.description]);
  return <div className={className}><ActionButton className="w-full" onClick={play}><Volume2 className={`h-5 w-5 ${speaking ? 'animate-pulse' : ''}`} />{labels[locale].listen}</ActionButton>{failed && <p role="alert" className="mt-3 text-base font-extrabold text-[#8A302B]">{labels[locale].audioFailed}</p>}</div>;
}

const entryCopy = {
  ko: { firstTitle: '작업팀 찾기', firstDescription: '농장주의 QR을 스캔하고 안내 언어를 선택하세요.', profileTitle: '이름을 알려주세요', profileDescription: '농장주가 알아볼 수 있는 이름이나 별명을 적어주세요.', name: '이름 또는 별명', nameHint: '예: 응우옌', language: '안내 언어', scan: 'QR 코드 스캔', retryCamera: '카메라 다시 시도', stop: '카메라 닫기', link: '팀 참여 링크 또는 코드', next: '다음', back: '이전', join: '오늘 작업팀 들어가기', joined: '작업팀에 들어왔어요', wait: '농장주의 작업 지시를 기다려주세요.', camera: '카메라를 사용할 수 없습니다. 아래에 링크나 코드를 입력하세요.', cameraHttps: '카메라는 HTTPS 또는 localhost에서만 사용할 수 있습니다.', cameraDenied: '카메라 권한이 꺼져 있습니다. 주소창의 카메라 권한을 허용해주세요.', cameraMissing: '이 기기에서 사용할 수 있는 카메라를 찾지 못했습니다.', cameraBusy: '카메라가 다른 앱에서 사용 중입니다. 화상회의나 카메라 앱을 닫고 다시 시도해주세요.', cameraSystem: '카메라 장치를 시작하지 못했습니다. Windows 카메라 앱에서도 열리지 않으면 카메라 설정과 드라이버를 확인해주세요.', firstError: '올바른 참여 코드를 확인해주세요.', expiredError: '참여 시간이 끝났습니다. 농장주에게 오늘 QR을 새로 열어달라고 요청해주세요.', unavailableError: '서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.', networkError: '연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요.', nameError: '이름 또는 별명을 입력해주세요.' },
  vi: { firstTitle: 'Tìm nhóm làm việc', firstDescription: 'Quét mã QR của chủ nông trại và chọn ngôn ngữ hướng dẫn.', profileTitle: 'Cho chúng tôi biết tên của bạn', profileDescription: 'Nhập tên hoặc biệt danh để chủ nông trại nhận ra bạn.', name: 'Tên hoặc biệt danh', nameHint: 'Ví dụ: Nguyễn', language: 'Ngôn ngữ hướng dẫn', scan: 'Quét mã QR', retryCamera: 'Thử lại camera', stop: 'Đóng camera', link: 'Đường dẫn hoặc mã tham gia', next: 'Tiếp theo', back: 'Quay lại', join: 'Tham gia nhóm hôm nay', joined: 'Bạn đã vào nhóm', wait: 'Hãy chờ chủ nông trại gửi hướng dẫn.', camera: 'Không thể dùng camera. Hãy nhập đường dẫn hoặc mã bên dưới.', cameraHttps: 'Camera chỉ hoạt động trên HTTPS hoặc localhost.', cameraDenied: 'Quyền camera đang bị chặn. Hãy cho phép camera trên thanh địa chỉ.', cameraMissing: 'Không tìm thấy camera trên thiết bị này.', cameraBusy: 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng camera hoặc họp video rồi thử lại.', cameraSystem: 'Không thể khởi động camera. Nếu ứng dụng Camera của Windows cũng không mở được, hãy kiểm tra cài đặt và trình điều khiển camera.', firstError: 'Kiểm tra mã tham gia.', expiredError: 'Mã đã hết hạn. Hãy xin chủ nông trại mở mã QR mới cho hôm nay.', unavailableError: 'Dịch vụ đang bận. Hãy thử lại sau.', networkError: 'Không thể kết nối. Hãy kiểm tra mạng rồi thử lại.', nameError: 'Hãy nhập tên hoặc biệt danh.' },
  ne: { firstTitle: 'काम टोली खोज्नुहोस्', firstDescription: 'खेत मालिकको QR स्क्यान गरी निर्देशन भाषा छान्नुहोस्।', profileTitle: 'तपाईंको नाम लेख्नुहोस्', profileDescription: 'खेत मालिकले चिन्न सक्ने नाम वा उपनाम लेख्नुहोस्।', name: 'नाम वा उपनाम', nameHint: 'उदाहरण: रमेश', language: 'निर्देशन भाषा', scan: 'QR कोड स्क्यान', retryCamera: 'क्यामेरा फेरि प्रयास', stop: 'क्यामेरा बन्द', link: 'टोली लिङ्क वा कोड', next: 'अर्को', back: 'अघिल्लो', join: 'आजको टोलीमा सामेल', joined: 'तपाईं टोलीमा सामेल हुनुभयो', wait: 'खेत मालिकको निर्देशन पर्खनुहोस्।', camera: 'क्यामेरा चलाउन सकिएन। तल लिङ्क वा कोड लेख्नुहोस्।', cameraHttps: 'क्यामेरा HTTPS वा localhost मा मात्र चल्छ।', cameraDenied: 'क्यामेरा अनुमति रोकिएको छ। ब्राउजरमा अनुमति दिनुहोस्।', cameraMissing: 'यो उपकरणमा क्यामेरा भेटिएन।', cameraBusy: 'क्यामेरा अर्को एपले प्रयोग गरिरहेको छ। क्यामेरा वा भिडियो बैठक एप बन्द गरेर फेरि प्रयास गर्नुहोस्।', cameraSystem: 'क्यामेरा सुरु भएन। Windows Camera एपमा पनि नखुले क्यामेरा सेटिङ र ड्राइभर जाँच्नुहोस्।', firstError: 'सहभागिता कोड जाँच्नुहोस्।', expiredError: 'QR को म्याद सकिएको छ। खेत मालिकसँग आजको नयाँ QR माग्नुहोस्।', unavailableError: 'सेवा अहिले उपलब्ध छैन। केहीबेरपछि फेरि प्रयास गर्नुहोस्।', networkError: 'जडान हुन सकेन। नेटवर्क जाँचेर फेरि प्रयास गर्नुहोस्।', nameError: 'नाम वा उपनाम लेख्नुहोस्।' },
};
const extractToken = (value: string, kind: 'team' | 'work') => value.trim().match(new RegExp(`/${kind === 'team' ? 'team' : 'w'}/([^/?#]+)`))?.[1] ?? (value.trim().length >= 32 ? value.trim() : '');

const releaseCamera = (video: HTMLVideoElement | null) => {
  if (video?.srcObject instanceof MediaStream) video.srcObject.getTracks().forEach((track) => track.stop());
  if (video) video.srcObject = null;
};

async function openCamera() {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (initialError) {
    if (initialError instanceof DOMException && ['NotAllowedError', 'SecurityError', 'NotFoundError'].includes(initialError.name)) throw initialError;
    const cameras = (await navigator.mediaDevices.enumerateDevices?.().catch(() => []))?.filter((device) => device.kind === 'videoinput') ?? [];
    let lastError = initialError;
    for (const camera of cameras) {
      try { return await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: camera.deviceId } }, audio: false }); }
      catch (cause) { lastError = cause; }
    }
    throw lastError;
  }
}

function WorkerEntry({ entryLocale, workerLocale, setLocale }: { entryLocale: Locale; workerLocale: WorkerLocale; setLocale: (locale: WorkerLocale) => void }) {
  const directToken = extractToken(window.location.href, 'team'); const [phase, setPhase] = useState<'team' | 'profile'>(directToken ? 'profile' : 'team'); const [value, setValue] = useState(directToken); const [name, setName] = useState(''); const [error, setError] = useState(''); const [joined, setJoined] = useState<TeamMember | null>(null); const [scanning, setScanning] = useState(false); const [cameraFailed, setCameraFailed] = useState(false); const [loading, setLoading] = useState(false); const [copyLocale, setCopyLocale] = useState<Locale>(directToken ? workerLocale : entryLocale); const video = useRef<HTMLVideoElement | null>(null); const scanner = useRef<{ destroy: () => void; start: () => Promise<void> } | null>(null); const t = entryCopy[copyLocale]; const selectLocale = (next: WorkerLocale) => { setLocale(next); setCopyLocale(next); };
  const stop = () => { scanner.current?.destroy(); scanner.current = null; releaseCamera(video.current); setScanning(false); };
  const useQr = (data: string) => { const workToken = extractToken(data, 'work'); const teamToken = extractToken(data, 'team'); stop(); if (data.includes('/w/') && workToken) window.location.assign(`/w/${encodeURIComponent(workToken)}`); else if (teamToken) { setValue(teamToken); setError(''); } else setError(t.firstError); };
  const cameraError = (cause: unknown) => { const message = String(cause).toLowerCase(); const name = cause instanceof DOMException ? cause.name : ''; setCameraFailed(true); setError(name === 'NotAllowedError' || name === 'SecurityError' || message.includes('permission') ? t.cameraDenied : name === 'NotFoundError' || name === 'OverconstrainedError' || message.includes('not found') ? t.cameraMissing : message.includes('in use') ? t.cameraBusy : name === 'NotReadableError' || name === 'AbortError' || message.includes('could not start video source') || message.includes('trackstarterror') || message.includes('0xa00f') || message.includes('driver') ? t.cameraSystem : t.camera); };
  useEffect(() => {
    if (!scanning || !video.current) return;
    const target = video.current; let cancelled = false;
    void openCamera().then(async (stream) => {
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      target.srcObject = stream;
      const { default: QrScanner } = await import('qr-scanner');
      if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
      const current = new QrScanner(target, ({ data }) => useQr(data), { returnDetailedScanResult: true });
      scanner.current = current;
      await current.start();
    }).catch((cause) => { if (cancelled) return; stop(); cameraError(cause); });
    return () => { cancelled = true; if (scanner.current) { scanner.current.destroy(); scanner.current = null; } releaseCamera(target); };
  }, [scanning, copyLocale]);
  const scan = () => {
    if (scanning) { stop(); return; }
    if (!window.isSecureContext) { setCameraFailed(true); setError(t.cameraHttps); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setCameraFailed(true); setError(t.camera); return; }
    setCameraFailed(false); setError(''); setScanning(true);
  };
  const next = () => { const token = extractToken(value, 'team'); if (!token) { setError(t.firstError); return; } stop(); setError(''); setPhase('profile'); };
  const join = async () => { const token = extractToken(value, 'team'); if (!name.trim()) { setError(t.nameError); return; } if (!token) { setPhase('team'); setError(t.firstError); return; } setLoading(true); setError(''); try { setJoined(await api.joinTodayTeam(token, { display_name: name.trim(), language_code: workerLocale })); stop(); window.location.assign('/worker/my'); } catch (reason) { setError(reason instanceof ApiError ? reason.code === 'LINK_EXPIRED' ? t.expiredError : reason.status === 429 || reason.status >= 500 ? t.unavailableError : t.firstError : t.networkError); } finally { setLoading(false); } };
  if (joined) return <div className="mx-auto max-w-xl py-10 text-center sm:py-20"><span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[#DDE9D8] text-deep"><Check className="h-12 w-12" /></span><h1 className="mt-6 text-3xl font-black">{t.joined}</h1><p className="mt-3 text-xl font-bold">{joined.display_name}</p><p className="mt-4 text-lg font-bold text-muted">{t.wait}</p></div>;
  if (phase === 'profile') return <div className="mx-auto max-w-2xl py-6 sm:py-12"><PageHeading title={t.profileTitle} description={t.profileDescription} action={!directToken ? <ActionButton variant="secondary" onClick={() => { setError(''); setPhase('team'); }}><ArrowLeft className="h-5 w-5" />{t.back}</ActionButton> : undefined} /><Panel><fieldset><legend className="text-lg font-black">{t.language}</legend><div className="mt-3 grid grid-cols-2 gap-3">{(['vi', 'ne'] as const).map((next) => <button key={next} type="button" aria-pressed={workerLocale === next} onClick={() => selectLocale(next)} className={`min-h-14 rounded-xl border px-3 font-black ${workerLocale === next ? 'border-deep bg-sage' : 'border-deep/15 bg-white'}`}>{next === 'vi' ? 'Tiếng Việt' : 'नेपाली'}</button>)}</div></fieldset><span className="mt-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E2F2FF] text-[#236A9E]"><UserRound className="h-8 w-8" /></span><label htmlFor="worker-name" className="mt-5 block text-lg font-black">{t.name}</label><input id="worker-name" value={name} maxLength={30} autoComplete="nickname" autoFocus onChange={(event) => setName(event.target.value)} className="mt-2 min-h-14 w-full rounded-2xl border border-deep/20 px-4 text-lg font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/20" placeholder={t.nameHint} /><ActionButton className="mt-5 w-full" disabled={loading} onClick={join}>{loading ? '…' : t.join}<ArrowRight className="h-5 w-5" /></ActionButton>{error && <p role="alert" className="mt-4 text-base font-extrabold text-[#8A302B]">{error}</p>}</Panel></div>;
  return <div className="mx-auto max-w-2xl py-6 sm:py-12"><PageHeading title={t.firstTitle} description={t.firstDescription} /><Panel><ActionButton className="w-full" variant="secondary" onClick={scan}><Camera className="h-6 w-6" />{scanning ? t.stop : cameraFailed ? t.retryCamera : t.scan}</ActionButton>{scanning && <video ref={video} muted playsInline className="mt-3 aspect-[4/3] w-full rounded-2xl bg-black object-cover" aria-label={t.scan} />}<label htmlFor="team-link" className="mt-5 block text-lg font-black">{t.link}</label><input id="team-link" value={value} onChange={(event) => setValue(event.target.value)} inputMode="url" className="mt-2 min-h-14 w-full rounded-2xl border border-deep/20 px-4 text-base font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/20" placeholder="https://…/team/…" /><ActionButton className="mt-5 w-full" onClick={next}>{t.next}<ArrowRight className="h-5 w-5" /></ActionButton>{error && <p role="alert" className="mt-4 text-base font-extrabold text-[#8A302B]">{error}</p>}</Panel></div>;
}

function WorkerLatest({ assignment, assignments, selectAssignment, go }: { assignment: V2WorkerBriefing; assignments: V2WorkerBriefing[]; selectAssignment: (sessionId: string) => void; go: ScreenProps['go'] }) {
  const locale = assignment.language_code; const t = labels[locale]; const first = assignment.steps[0];
  return <>
    <PageHeading title={t.latest} description={t.today} />
    {assignments.length > 1 && <div role="group" className="mb-4 grid gap-2" aria-label={t.today}>{assignments.map((item) => <button key={item.session_id} type="button" aria-pressed={item.session_id === assignment.session_id} onClick={() => selectAssignment(item.session_id)} className={`min-h-12 rounded-xl border px-4 text-left font-black ${item.session_id === assignment.session_id ? 'border-deep bg-sage' : 'border-deep/15 bg-white'}`}>{item.steps[0]?.title ?? t.today} · {item.context.location_display}</button>)}</div>}
    {assignment.badges.length > 0 && <div className="mb-4 mt-4 flex flex-wrap gap-2">{assignment.badges.map((badge) => <StatusBadge key={badge} tone="yellow">{badgeText(locale, badge)}</StatusBadge>)}</div>}
    <section className="mb-5 rounded-2xl bg-[#E5F0E0] p-6 sm:p-8"><StatusBadge>{locale === 'vi' ? 'Tiếng Việt' : 'नेपाली'}</StatusBadge><h1 className="mt-4 text-2xl font-black sm:text-3xl">{first?.title ?? t.today}</h1><div className="mt-5 grid gap-1 sm:grid-cols-2"><FactRow label={t.location} value={assignment.context.location_display} /><FactRow label={t.amount} value={quantityText(assignment.context.quantity)} /><FactRow label={t.deadline} value={assignment.context.deadline ?? '—'} /><FactRow label={t.note} value={assignment.context.notes ?? '—'} /><FactRow label={t.safety} value={assignment.context.safety.join(' · ') || '—'} last /></div><SafetySources briefing={assignment} /></section>
    <Panel><PanelHeader title={t.today} aside={<StatusBadge tone="blue">{assignment.steps.length}</StatusBadge>} /><ol className="grid gap-3">{assignment.steps.map((step) => <li key={step.sequence} className="flex items-center gap-4 rounded-2xl bg-[#F5F8F3] p-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-deep font-black text-white">{step.sequence}</span><strong className="text-lg leading-7">{step.title}</strong></li>)}</ol>{first && <div className="mt-5 grid gap-3"><BriefingAudioButton briefing={assignment} /><ActionButton variant="secondary" className="w-full" onClick={() => go('worker-step')}>{t.view}<ArrowRight className="h-5 w-5" /></ActionButton></div>}{!first && <Callout>{t.invalid}</Callout>}</Panel>
  </>;
}

function WorkerStepView({ assignment, go }: { assignment: V2WorkerBriefing; go: ScreenProps['go'] }) {
  const locale = assignment.language_code; const t = labels[locale]; const [index, setIndex] = useState(0); const [videoFailed, setVideoFailed] = useState(false); const videoElement = useRef<HTMLVideoElement | null>(null); const playAfterMove = useRef(false); const step = assignment.steps[Math.min(index, assignment.steps.length - 1)]; const video = step ? playableVideo(assignment, step) : null;
  useEffect(() => { setIndex(0); setVideoFailed(false); window.speechSynthesis.cancel(); }, [assignment.version]);
  useEffect(() => setVideoFailed(false), [index, video?.video_url]);
  useEffect(() => { if (!playAfterMove.current || !videoElement.current) return; playAfterMove.current = false; void videoElement.current.play().catch(() => undefined); }, [index, video?.video_url, videoFailed]);
  const move = (offset: number) => { playAfterMove.current = true; setIndex((value) => value + offset); };
  if (!step) return <Callout>{t.invalid}</Callout>;
  return <><PageHeading title={`${locale === 'vi' ? 'Bước' : 'चरण'} ${index + 1} / ${assignment.steps.length}`} description={step.title} action={<ActionButton variant="secondary" onClick={() => go('worker-latest')}><ArrowLeft className="h-5 w-5" />{locale === 'vi' ? 'Danh sách' : 'सूची'}</ActionButton>} /><div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]"><section>{video && !videoFailed ? <video ref={videoElement} key={video.video_url} controls playsInline className="aspect-video w-full rounded-2xl bg-deep object-cover" onError={() => setVideoFailed(true)}><source src={video.video_url} /><track kind="captions" src={captionsUrl(video.captions_text)} srcLang={locale} label={locale} default /></video> : <Callout safe><p className="text-lg">{t.fallback}</p></Callout>}<SpeakButton className="mt-4 w-full" step={step} audioUrl={null} locale={locale} safety={assignment.context.safety} /><div className="mt-2 grid grid-cols-2 gap-2"><ActionButton disabled={index === 0} variant="secondary" onClick={() => move(-1)}><ChevronLeft className="h-5 w-5" />{t.prev}</ActionButton><ActionButton disabled={index === assignment.steps.length - 1} variant="secondary" onClick={() => move(1)}>{t.next}<ChevronRight className="h-5 w-5" /></ActionButton></div></section><Panel className="self-start"><PanelHeader title={step.title} /><p className="text-xl font-extrabold leading-9">{step.description}</p><div className="mt-5"><FactRow label={t.location} value={assignment.context.location_display} /><FactRow label={t.amount} value={quantityText(assignment.context.quantity)} /><FactRow label={t.deadline} value={assignment.context.deadline ?? '—'} last /></div>{assignment.context.safety.length > 0 && <div className="mt-5"><Callout><strong>{t.safety}</strong><p>{assignment.context.safety.join(' · ')}</p></Callout></div>}{video && <p className="mt-4 text-base font-bold text-muted">{video.captions_text}</p>}<div className="mt-6"><ProgressBar value={((index + 1) / assignment.steps.length) * 100} label={locale === 'vi' ? 'Tiến độ các bước' : 'चरण प्रगति'} /></div>{index === assignment.steps.length - 1 && <ActionButton variant="quiet" className="mt-6 w-full" onClick={() => go('worker-latest')}><Check className="h-5 w-5" />{t.workList}</ActionButton>}</Panel></div></>;
}

function LegacyWorkerBriefingView({ assignment }: { assignment: LegacyWorkerBriefing }) {
  const t = labels[assignment.language_code];
  return <><PageHeading title={t.legacyTitle} description={t.legacyDescription} /><Callout><span className="flex gap-2"><History className="h-5 w-5 shrink-0" />{t.legacyNotice}</span></Callout><section className="mt-5 grid gap-4"><FactRow label={t.location} value={assignment.context.location_display} /><FactRow label={t.amount} value={assignment.context.quantity_display} /><ol className="grid gap-3">{assignment.steps.map((step) => <li key={step.sequence} className="overflow-hidden rounded-2xl bg-[#F5F8F3] p-4"><strong className="text-lg">{step.sequence}. {step.title}</strong><p className="mt-2 font-bold text-muted">{step.description}</p>{step.video && <video controls playsInline className="mt-3 aspect-video w-full rounded-xl bg-deep"><source src={step.video.video_url} /></video>}</li>)}</ol></section></>;
}

function LinkError({ locale, code, retry }: { locale: WorkerLocale; code: string; retry?: () => void }) { const t = labels[locale]; const expired = code === 'LINK_EXPIRED'; const Icon = expired ? Clock3 : code === 'ACCESS_DENIED' ? Link2Off : AlertCircle; return <div className="mx-auto max-w-xl py-10 text-center sm:py-20"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#FFF0BF] text-[#805D09]"><Icon className="h-10 w-10" /></div><h1 className="mt-6 text-3xl font-black">{t.unavailable}</h1><p className="mt-4 text-lg font-bold leading-8 text-muted">{expired ? t.expired : t.invalid}</p>{retry && !expired && <ActionButton className="mt-6" onClick={retry}>{t.retry}</ActionButton>}</div>; }

export function WorkerScreenRouter({ screen, go, token, locale, entryLocale, setLocale }: WorkerScreenProps) {
  const [assignments, setAssignments] = useState<WorkerAssignment[]>([]); const [receipts, setReceipts] = useState<AssignmentReceipt[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null); const [errorCode, setErrorCode] = useState(''); const [refresh, setRefresh] = useState(0); const [updated, setUpdated] = useState(false); const [loaded, setLoaded] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false); const [ackError, setAckError] = useState('');
  const generation = useRef(0); const knownVersions = useRef(new Map<string, number>()); const mounted = useRef(true); const currentToken = useRef(token); currentToken.current = token;
  const isTeamMember = token === '__team_member__';
  const assignment = assignments.find((item) => item.session_id === selectedSessionId) ?? assignments[0] ?? null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => { setAssignments([]); setReceipts([]); setSelectedSessionId(null); setLoaded(false); setUpdated(false); setErrorCode(''); setAckError(''); knownVersions.current.clear(); }, [token]);
  useEffect(() => {
    if (screen === 'worker-entry') return;
    if (!token) { setErrorCode('ACCESS_DENIED'); return; }
    let active = true; let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      const request = ++generation.current;
      try {
        const result = isTeamMember ? await api.getMyTeamAssignments() : { assignments: [await api.getAssignment(token)], receipts: [] };
        if (!active || request !== generation.current) return;
        if (result.assignments.some((item) => knownVersions.current.has(item.session_id) && item.version > knownVersions.current.get(item.session_id)!)) { setUpdated(true); window.speechSynthesis.cancel(); }
        knownVersions.current = new Map(result.assignments.map((item) => [item.session_id, item.version]));
        setAssignments(result.assignments); setReceipts(result.receipts); setLoaded(true); setErrorCode('');
        if (result.assignments[0]) setLocale(result.assignments[0].language_code);
      } catch (reason) {
        if (!active || request !== generation.current) return;
        const code = reason instanceof ApiError ? reason.code : 'INTERNAL_ERROR';
        if (['LINK_EXPIRED', 'ACCESS_DENIED', 'UNAUTHORIZED'].includes(code)) { setAssignments([]); setReceipts([]); window.speechSynthesis.cancel(); }
        setErrorCode(code); setLoaded(true);
      } finally { loading = false; }
    };
    void load(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 5000);
    const focus = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', focus); window.addEventListener('focus', focus);
    return () => { active = false; generation.current += 1; window.clearInterval(timer); document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', focus); window.speechSynthesis.cancel(); };
  }, [token, screen === 'worker-entry', refresh, isTeamMember, setLocale]);
  if (screen === 'worker-entry') return <WorkerEntry entryLocale={entryLocale} workerLocale={locale} setLocale={setLocale} />;
  if (errorCode && !assignment) return <LinkError locale={locale} code={errorCode} retry={() => setRefresh((value) => value + 1)} />;
  if (loaded && !assignment) return <div className="mx-auto max-w-xl py-10 text-center sm:py-20"><Clock3 className="mx-auto h-12 w-12 text-deep" /><h1 className="mt-6 text-3xl font-black">{labels[locale].today}</h1><p className="mt-4 text-lg font-bold text-muted">{labels[locale].waiting}</p><ActionButton className="mt-6" variant="secondary" onClick={() => setRefresh((value) => value + 1)}>{labels[locale].retry}</ActionButton></div>;
  if (!assignment) return <div role="status" className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center font-black text-deep">Loading · Đang tải · लोड हुँदैछ</div>;
  if (assignment.contract_version === 'structure-v1') return <LegacyWorkerBriefingView assignment={assignment} />;
  const t = labels[assignment.language_code]; const vi = assignment.language_code === 'vi';
  const pending = assignments.filter((item) => receipts.find((receipt) => receipt.work_session_id === item.session_id)?.acknowledged_version !== item.version);
  const acknowledged = receipts.some((item) => item.work_session_id === assignment.session_id && item.acknowledged_version === assignment.version);
  const acknowledge = async () => {
    if (acknowledging) return;
    setAcknowledging(true); setAckError('');
    try {
      const receipt = await api.acknowledgeAssignment(assignment.session_id, assignment.version);
      if (!mounted.current || currentToken.current !== token) return;
      generation.current += 1;
      setReceipts((items) => [...items.filter((item) => item.work_session_id !== receipt.work_session_id), receipt]);
    } catch (reason) {
      if (!mounted.current || currentToken.current !== token) return;
      if (reason instanceof ApiError && reason.status === 409) { setAckError(vi ? 'Hướng dẫn đã thay đổi. Hãy đọc lại và xác nhận.' : 'निर्देशन बदलिएको छ। फेरि पढेर पुष्टि गर्नुहोस्।'); setRefresh((value) => value + 1); }
      else setAckError(vi ? 'Chưa gửi được xác nhận. Hãy thử lại.' : 'पुष्टि पठाउन सकिएन। फेरि प्रयास गर्नुहोस्।');
    } finally { if (mounted.current) setAcknowledging(false); }
  };
  const v2Assignments = assignments.filter((item): item is V2WorkerBriefing => item.contract_version === 'worker-briefing-v2');
  return <>{(updated || isTeamMember && pending.length > 0) && <div role="status" aria-live="polite" className="mb-5 rounded-2xl bg-[#173F24] p-5 text-lg font-black text-white">{updated && <p>{t.updated}</p>}{isTeamMember && pending.length > 0 && <p>{vi ? `${pending.length} hướng dẫn chưa xác nhận` : `${pending.length} निर्देशन पुष्टि गर्न बाँकी छ`}</p>}</div>}{errorCode && <div role="alert" className="mb-5 rounded-2xl bg-[#FFF0BF] p-5 font-bold text-[#654B16]">{t.stale}<ActionButton variant="secondary" onClick={() => setRefresh((value) => value + 1)}>{t.retry}</ActionButton></div>}{screen === 'worker-step' ? <WorkerStepView key={`${assignment.session_id}-${assignment.version}`} assignment={assignment} go={go} /> : <WorkerLatest assignment={assignment} assignments={v2Assignments} selectAssignment={(id) => { setSelectedSessionId(id); setAckError(''); }} go={go} />}{isTeamMember && <section className="mt-5 rounded-2xl bg-white p-5"><p className="mb-3 font-bold text-muted">{vi ? 'Xác nhận bạn đã hiểu hướng dẫn này. Đây không phải báo hoàn thành công việc.' : 'यो निर्देशन बुझेको पुष्टि गर्नुहोस्। यो काम सम्पन्न भएको सूचना होइन।'}</p><ActionButton className="w-full" disabled={acknowledged || acknowledging || Boolean(errorCode)} onClick={acknowledge}>{acknowledged ? vi ? 'Đã xác nhận hướng dẫn' : 'निर्देशन पुष्टि भयो' : acknowledging ? vi ? 'Đang gửi…' : 'पठाउँदै…' : vi ? 'Tôi đã hiểu hướng dẫn' : 'मैले निर्देशन बुझें'}</ActionButton>{ackError && <p role="alert" className="mt-3 font-bold text-[#8A302B]">{ackError}</p>}</section>}</>;
}
