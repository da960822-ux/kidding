# 밭머리 P0 백로그

원본 상세 백로그는 legacy reference다. ZIP 기준 P0는 아래 vertical slice만 완료한다.

| 코드 | 우선순위 | 항목 | DoD | 선행조건 | 주담당 |
|---|---|---|---|---|---|
| P0-01 | P0 | 양파·딸기 ontology 8코드 | family 일치 allowlist·JSON Schema·BE semantic validation 일치 | 없음 | AI |
| P0-01a | P0 | current contract/legacy preservation | `structure-v2`/`ontology-v2` current 8-code family validation; immutable `structure-v1` legacy version read; never reset·rewrite·remap | P0-01 | BE |
| P0-02 | P0 | AI 사전생성 LOW 영상 8개 | 8개 후보의 provenance·사람 검수 `APPROVED` manifest, worker-delivery URL | P0-01 | AI |
| P0-03 | P0 | 입력 없는 임시 팀 시작·24시간 관리 PIN | 첫 확정과 원자 활성화, 팀 관리 링크+PIN 복귀, 고정24h·Secure cookie·exact Origin·rate limit·팀 격리 | 없음 | BE |
| P0-04 | P0 | audio→WorkDraft sync | 10MiB/60초, schema/risk reject | P0-01,P0-03 | BE |
| P0-04a | P0 | owner WorkDraft 복구 | same-Farm 유효·미확정 v2 GET, no-store, raw audio 미복구, 404/409/422 경계 검사 | P0-04,P0-03 | BE |
| P0-05 | P0 | structure/translation | unknown 보존, vi/ne locale purity, safety verified provenance, worker TTS·caption package | P0-01 | AI |
| P0-05a | P0 | 사투리 참고 사전·문맥 연결 | 출처/미검수 구분, 원문 불변, 초기·보완·수량 경로의 관련 문맥 선택, 고정 실패 및 미사용 표현 평가, 동일 prompt 사전 유무 비교, UTF-8 STT 신뢰도 검사 | P0-05 | AI |
| P0-05b | P0 | 신규 양파 운반 영상 제외 | 운반 코드·단계·텍스트·TTS 유지, 다른 영상과 기존 immutable package 불변 | P0-05 | AI |
| P0-06 | P0 | owner confirm | v2 immutable version + vi/ne package atomically publish; delivery is separate, override, safety gate | P0-04,P0-05 | BE |
| P0-07 | P0 | owner storyboard | summary·ambiguity·source·delivery branch 표시, 위치 원문 보존·현장 설명 원클릭 전달 | P0-06 | FE |
| P0-08 | P0 | 정적 영상·TTS 표시 | video 또는 text+TTS, captions | P0-02,P0-05 | FE |
| P0-09 | P0 | CO_PRESENT briefing | PIN cookie, vi/ne, 최신 version | P0-06,P0-08 | BE |
| P0-10 | P0 | REMOTE anonymous link | 언어별 24h hash browser `${PUBLIC_WEB_BASE_URL}/w/{token}`, JSON assignment로 최신 PUBLISHED | P0-06 | BE |
| P0-11 | P0 | remote mobile | `/w/{token}` 링크 접근, vi/ne, polling/focus refresh; mock은 명시적 opt-in만 허용 | P0-10 | FE |
| P0-12 | P0 | quantity audio parse | 비영속 READY/AMBIGUOUS | P0-03,P0-05 | AI |
| P0-13 | P0 | direct quantity confirm | version+idempotency, current-code validation | P0-12 | BE |
| P0-14 | P0 | contract negative checks | 401/409/422/HIGH/UNKNOWN/expiry, public web readiness, `/w` assignment, legacy read-only PASS | P0-03..P0-13 | BE |
| P0-15 | P0 | two-branch mobile E2E | CO_PRESENT·REMOTE 각 3회, 20망→15망 | P0-07..P0-14 | FE |
| P0-16 | P0 | 24시간 작업팀 QR·개별 배정 | 같은 팀 QR 유지, 명시적 재발급에도 expiry 유지, 별명·vi/ne, owner roster, 최신 WorkSession 배정 | P0-03,P0-06 | BE |
| P0-16a | P0 | 개인별 지시 확인 저장 | member 범위·현재 버전 검증, idempotent 확인 시각, owner 미확인/확인/변경 확인 필요 | P0-16 | BE |
| P0-17a | P0 | 새 배정·변경 알림과 확인 UI | vi/ne 화면 내 알림, 비선택 작업도 감지, 명시 확인, 재접속 미확인 유지, OS 푸시로 오인 금지 | P0-16a | FE |
| P0-17 | P0 | 오늘 작업팀 mobile E2E | 두 근로자 QR join·언어별 개인 최신 지시 확인 | P0-16 | FE |
| P1-01 | P1 | 농장주 계정관리 | 공유 PIN을 개인 계정으로 대체 | P0 완료 | BE |
| P1-02 | P1 | SMS link 전송 | consent·실패 처리 포함 | P1-01 | BE |
| P1-03 | P1 | 기관 매칭/다중 테넌트 | 기관·농장·권한·RLS 별도 설계 | P0 완료 | BE |
| P1-04 | P1 | 양파·딸기 이외 작물·추가 언어 | ontology·dataset·eval 별도 통과 | P0 완료 | AI |
