# 밭머리 P0 백로그

원본 상세 백로그는 legacy reference다. ZIP 기준 P0는 아래 vertical slice만 완료한다.

| 코드 | 우선순위 | 항목 | DoD | 선행조건 | 주담당 |
|---|---|---|---|---|---|
| P0-R10 | P0 | 장소 생략 허용·구조화 추론 축소 | 초기/보완 장소 미지정 유지, 실제 충돌 차단, 구조화만 low, 수량·금지·안전 회귀 통과 | P0-05a | AI |
| P0-R01 | P0 | DB 조회 지연·목록 반복 조회 개선 | event loop 비차단, owner/member 일괄 조회, 권한·만료·현재 version 불변 | P0-16 | BE |
| P0-R02 | P0 | 목표량 변경의 단계·메모 정합성 | 옛 목표량만 안전하게 갱신, 다른 수치 보존, 불명확 시 저장 전 거부 | P0-13 | BE |
| P0-R03 | P0 | DB 용어 사전의 번역 연결·전문어 보완 | 기존 용어 우선, vi/ne 문맥 전달, 공식/안전 gate 유지, 수량 의미 충돌 검사 | P0-05a | AI |
| P0-R04 | P0 | 게시 스토리보드 영상·조회 복구·상세 메모 | 동일 version 영상, stale 응답 무효화, 텍스트 우선, 메모 가시성 | P0-07,P0-08 | FE |
| P0-R05 | P0 | 전체 음성 조립·망 단위 fallback | 위치·객체 수량·마감·안전·전체 단계·메모 exact 조립, 요약 호출 없음, 검수 HIT 우선·MISS 망 bao/बोरा와 문장 glossary 일치 | P0-R03 | AI |
| P0-R06 | P0 | 신규 전체 TTS text/hash 검증 | AI와 같은 조립 규칙, 누락·불일치 422, 과거 immutable package 조회·내용 유지 | P0-R05 | BE |
| P0-R07 | P0 | 시작 전 메모·전체 음성 전달 | notes 전체를 시작 전·단계·CO_PRESENT에 노출, 전체 hash 검증과 기기 fallback, 미지원 글 안내·재시도 | P0-R04,P0-R06 | FE |
| P0-01 | P0 | 양파·딸기 ontology 8코드 | family 일치 allowlist·JSON Schema·BE semantic validation 일치 | 없음 | AI |
| P0-01a | P0 | current contract/legacy preservation | `structure-v2`/`ontology-v2` current 8-code family validation; immutable `structure-v1` legacy version read; never reset·rewrite·remap | P0-01 | BE |
| P0-02 | P0 | AI 사전생성 LOW 영상 8개 | 8개 후보의 provenance·사람 검수 `APPROVED` manifest, worker-delivery URL | P0-01 | AI |
| P0-03 | P0 | 입력 없는 임시 팀 시작·24시간 관리 PIN | 첫 확정과 원자 활성화, 팀 관리 링크+PIN 복귀, 고정24h·Secure cookie·exact Origin·rate limit·팀 격리 | 없음 | BE |
| P0-04 | P0 | audio→WorkDraft sync | 10MiB/60초, schema/risk reject | P0-01,P0-03 | BE |
| P0-04a | P0 | owner WorkDraft 복구 | same-Farm 유효·미확정 v2 GET, no-store, raw audio 미복구, 404/409/422 경계 검사 | P0-04,P0-03 | BE |
| P0-05 | P0 | structure/translation | unknown 보존, vi/ne locale purity, safety verified provenance, worker TTS·caption package | P0-01 | AI |
| P0-05a | P0 | 사투리 참고 사전·문맥 연결 | 출처/미검수 구분, 원문 불변, 초기·보완·수량 경로의 관련 문맥 선택, 고정 실패 및 미사용 표현 평가, 동일 prompt 사전 유무 비교, UTF-8 STT 신뢰도 검사 | P0-05 | AI |
| P0-05b | P0 | 양파 운반 영상 gate | 운반 코드·단계 유지, 승인 LOW 수작업 영상 매칭, 없으면 텍스트·TTS, 기존 immutable package 불변 | P0-05 | AI |
| P0-05c | P0 | STT `만`/`망` 수량 경계 검증 | 고유어 수사+`만` 고확신 결과도 독립 재전사, 미해소 시 AUDIO_UNCLEAR, 치환·실제 `이십만 개` 훼손 없음 | P0-05a | AI |
| P0-06 | P0 | owner confirm | v2 immutable version + vi/ne package atomically publish; delivery is separate, override, safety gate | P0-04,P0-05 | BE |
| P0-07 | P0 | owner storyboard | summary·ambiguity·source·delivery branch 표시, 위치 원문 보존·현장 설명 원클릭 전달 | P0-06 | FE |
| P0-07a | P0 | 개인 음성 지시 | roster에서 사람 선택→새 음성 초안→확인→그 사람에게 즉시 배정, 기존 작업 선택은 재사용 보조 경로 | P0-03,P0-04,P0-06 | FE |
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
| P0-18 | P0 | 현재 UX 오류 회귀 수정 | 근로자 URL·QR 관리정보 비노출·기존 팀 진입·작업별 링크 격리·확정 전 상세·수량 후보/충돌·초안 복구·늦은 응답·로그아웃·전체 음성·작업별 변경 알림 검증 | P0-07,P0-13,P0-17a | FE |
| P0-R11 | P0 | 근로자 영상 전체 프레임·양파 운반 영상 | 모든 영상 원본 비율, 전체 듣기만 표시, 다듬기·운반 승인 영상 각각 매칭 | P0-07 | FE |
| P0-R12 | P0 | 팀 목록 snapshot·배정 결과 불명 복구 | polling 실패에도 기존 배정 가능, timeout-before-commit 동일 작업 재시도, 최종 roster 확인 뒤 실패 | P0-16 | FE |
| P1-02 | P1 | SMS link 전송 | consent·실패 처리 포함 | P1-01 | BE |
| P1-03 | P1 | 기관 매칭/다중 테넌트 | 기관·농장·권한·RLS 별도 설계 | P0 완료 | BE |
| P1-04 | P1 | 양파·딸기 이외 작물·추가 언어 | ontology·dataset·eval 별도 통과 | P0 완료 | AI |
