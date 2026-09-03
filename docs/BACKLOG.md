# 밭머리 P0 백로그

이 문서의 P0/P1만 현재 실행 순서의 권위다.

| 코드 | 우선순위 | 항목 | DoD | 선행조건 | 주담당 |
|---|---|---|---|---|---|
| P0-01 | P0 | AI 계약·양파 ontology | 6개 task code와 3개 JSON Schema가 예제·안전정책과 일치 | 없음 | AI |
| P0-02 | P0 | AI 사전생성 영상 | 6개 LOW 영상, APPROVED manifest, captions, FE 전달 | P0-01 | AI |
| P0-03 | P0 | AI 처리 pipeline | STT→구조화→vi/ne 번역 source→TTS/영상 match; unknown·안전문구 추가 없음 | P0-01 | AI |
| P0-04 | P0 | owner 인증·audio 입력 | PIN cookie, exact CORS/Origin, rate limit, 10MiB/60초, raw audio 즉시 삭제 | 없음 | BE |
| P0-05 | P0 | draft·보완·확정 | audio-only supplement, schema/Safety gate, override audit, link 없는 v1 confirm | P0-03,P0-04 | BE |
| P0-06 | P0 | version·수량 변경 | 비영속 parse, direct confirm, idempotency·409, v2/latest PUBLISHED | P0-03,P0-05 | BE |
| P0-07 | P0 | 두 전달 API | PIN `CO_PRESENT` brief와 `REMOTE` 24h create/reissue/latest; transcript 비공개 | P0-05 | BE |
| P0-08 | P0 | owner 모바일 UI | 녹음·요약·ambiguity·source·confirm·수량 변경·fallback 표시 | P0-05,P0-06 | FE |
| P0-09 | P0 | 전달 모바일 UI | confirm 뒤 같이 보기/링크로 보내기, vi/ne, video/TTS/text, polling/focus refresh | P0-02,P0-07,P0-08 | FE |
| P0-10 | P0 | 계약 negative checks | 401/409/422, HIGH/UNKNOWN, empty steps, expiry/reissue, transcript 차단 모두 PASS | P0-05–P0-09 | BE |
| P0-11 | P0 | AI 평가 실행 | 30 transcript와 3 synthetic WAV; dataset/prompt/manifest hash·metrics·failures 저장 | P0-03,P0-06 | AI |
| P0-12 | P0 | T-6h feature freeze | canonical 계약 snapshot, 범위 동결, negative check PASS | P0-10 | BE |
| P0-13 | P0 | T-4h 통합 배포 | Railway API `/ready`, Vercel UI, production env 연결 증거 | P0-12 | FE |
| P0-14 | P0 | T-2h 모바일 E2E·데모 lock | 두 branch·두 폰 3회, 20→15망, video/TTS/API fallback 증거 | P0-02,P0-11,P0-13 | FE |
| P1-01 | P1 | 농장주 계정관리 | 공유 PIN을 개인 계정으로 대체 | P0 완료 | BE |
| P1-02 | P1 | SMS link 전송 | consent·실패 처리 포함 | P1-01 | BE |
| P1-03 | P1 | 추가 작물·언어 | ontology·dataset·eval 별도 통과 | P0 완료 | AI |
| P1-04 | P1 | async queue | sync latency 측정 후 도입 | P0 완료 | BE |
| P1-05 | P1 | offline cache | 최신 버전·만료 정책 정의 후 | P0 완료 | FE |
