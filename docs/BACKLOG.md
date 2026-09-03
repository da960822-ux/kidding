# 밭머리 P0 백로그

원본 상세 백로그는 legacy reference다. ZIP 기준 P0는 아래 vertical slice만 완료한다.

| 코드 | 우선순위 | 항목 | DoD | 선행조건 | 주담당 |
|---|---|---|---|---|---|
| P0-01 | P0 | 양파·딸기 ontology 8코드 | family 일치 allowlist·JSON Schema·BE semantic validation 일치 | 없음 | AI |
| P0-02 | P0 | AI 사전생성 LOW 영상 8개 | 8개 후보의 provenance·사람 검수 `APPROVED` manifest, public worker delivery URL | P0-01 | AI |
| P0-03 | P0 | PIN session/CORS/CSRF | Secure cookie, exact Origin, rate limit | 없음 | BE |
| P0-04 | P0 | audio→WorkDraft sync | 10MiB/60초, schema/risk reject | P0-01,P0-03 | BE |
| P0-05 | P0 | structure/translation | unknown 보존, source, vi/ne | P0-01 | AI |
| P0-06 | P0 | owner confirm | delivery mode/language, override, safety gate, v1 | P0-04,P0-05 | BE |
| P0-07 | P0 | owner storyboard | summary·ambiguity·source·delivery branch 표시 | P0-06 | FE |
| P0-08 | P0 | 정적 영상·TTS 표시 | video 또는 text+TTS, captions | P0-02,P0-05 | FE |
| P0-09 | P0 | CO_PRESENT briefing | PIN cookie, vi/ne, 최신 version | P0-06,P0-08 | BE |
| P0-10 | P0 | REMOTE anonymous link | 언어별 24h hash link, 최신 PUBLISHED | P0-06 | BE |
| P0-11 | P0 | remote mobile | 링크 접근, vi/ne, polling/focus refresh | P0-10 | FE |
| P0-12 | P0 | quantity audio parse | 비영속 READY/AMBIGUOUS | P0-03,P0-05 | AI |
| P0-13 | P0 | direct quantity confirm | version+idempotency, v2 | P0-12 | BE |
| P0-14 | P0 | contract negative checks | 401/409/422/HIGH/UNKNOWN/expiry PASS | P0-03..P0-13 | BE |
| P0-15 | P0 | two-branch mobile E2E | CO_PRESENT·REMOTE 각 3회, 20망→15망 | P0-07..P0-14 | FE |
| P0-16 | P0 | 오늘 작업팀 QR·개별 배정 | 24시간 익명 QR join, 별명·vi/ne, owner roster, 최신 WorkSession 배정 | P0-03,P0-06 | BE |
| P0-17 | P0 | 오늘 작업팀 mobile E2E | 두 근로자 QR join·언어별 개인 최신 지시 확인 | P0-16 | FE |
| P1-01 | P1 | 농장주 계정관리 | 공유 PIN을 개인 계정으로 대체 | P0 완료 | BE |
| P1-02 | P1 | SMS link 전송 | consent·실패 처리 포함 | P1-01 | BE |
| P1-03 | P1 | 기관 매칭/다중 테넌트 | 기관·농장·권한·RLS 별도 설계 | P0 완료 | BE |
| P1-04 | P1 | 양파·딸기 이외 작물·추가 언어 | ontology·dataset·eval 별도 통과 | P0 완료 | AI |
