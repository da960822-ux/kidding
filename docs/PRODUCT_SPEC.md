# 밭머리 제품 명세

## 한 줄 정의

밭머리는 농장주의 전라도 사투리 지시를 작업 단계로 구조화하고, 검수된 정부 가이드 표현과 사전 생성·사람 검수된 양파·딸기 작업영상을 조립해 베트남어·네팔어 작업 스토리보드로 전달한다. 지시가 명확히 바뀌면 최신 수량을 전달 화면에 반영한다.

## P0 불변 범위

- 작물: 양파·딸기 두 vertical만. 양파는 수확·손질·분류·운반, 딸기는 수확·분류·검수·포장만 허용한다.
- 전달 언어: 베트남어(`vi`)·네팔어(`ne`)
- 변경: 수량 변경만 자동 반영. 예: `20망`에서 `15망`
- 영상: AI가 사전 생성하고 사람이 검수한 파일만 사용. `safety_level: HIGH`는 게시 금지
- 신규 양파 운반 지시는 `ONION_TRANSPORT`로 유지하되 영상 없이 텍스트·음성으로 전달한다. 다른 작업 영상과 기존 확정 version은 변경하지 않는다.
- 전달 방식: `CO_PRESENT` 또는 `REMOTE`
- `CO_PRESENT`: 농장주 PIN 세션의 owner 폰에서 언어를 골라 함께 보기
- `REMOTE`: 언어를 하나 골라 로그인 없는 24시간 익명 browser 링크 `${PUBLIC_WEB_BASE_URL}/w/{token}` 발급. 해당 route는 JSON assignment endpoint로 Latest Published를 읽는다.
- 오늘 작업팀: 농장주가 오늘의 QR 하나를 열고, 근로자는 별명과 `vi|ne`만 제출한다. 농장주는 roster를 보고 사람별로 하나 이상 WorkSession을 배정할 수 있다. 참가자 브라우저는 자기 배정의 Latest Published만 읽는다.
- 농장주 접근: 운영자가 발급한 Farm access code와 Owner PIN을 함께 확인한다. 공개 회원가입·PIN 복구·개인 농장주 계정은 P1이며, PIN이나 PIN 파생값을 QR에 포함하지 않는다.
- 오늘 작업팀 QR은 같은 Farm·같은 Asia/Seoul 작업일 동안 다시 열어도 동일하다. 농장주가 명시적으로 재발급할 때만 이전 QR을 폐기한다.
- 제외: 영구 근로자 등록·계정, 전화번호, SMS, 개인 프로필, 채팅, 국적 수집

P1: 농장주 회원가입/계정관리, SMS, 질문, 양파·딸기 이외 작물·추가 언어, 오프라인 캐시, 통계, 급여·출퇴근, 기관 매칭 관리.

## 배포·보안 경계

Vercel production FE는 `VITE_API_BASE_URL`을 비워 같은 origin의 `/api`를 호출한다. `vercel.ts`는 build-time `API_UPSTREAM_ORIGIN` HTTPS origin으로 `/api/:path*`만 external rewrite한 뒤 SPA fallback을 적용한다. browser mock은 `VITE_USE_MOCK_API=true`인 명시적 개발 선택일 뿐, URL 미설정의 production fallback이 아니다. Render의 `FRONTEND_ORIGINS`, `PUBLIC_WEB_BASE_URL`, `PUBLIC_API_BASE_URL`은 같은 공개 Vercel origin이어야 한다. BE의 `PUBLIC_WEB_BASE_URL`은 `DEMO_FALLBACK=1`이 아닌 환경에서 필수이며 `/ready`와 REMOTE 발급을 차단하는 deployment gate다. owner mutation은 Farm access code와 Owner PIN으로 발급된 farm-scoped signed cookie와 `FRONTEND_ORIGINS` exact Origin으로만 보호하며, 정적 CSRF header는 사용하지 않는다.

## 핵심 흐름

근로자 전달 package는 선택 언어(`vi|ne`)로만 위치·수량 단위·마감·메모·단계·영상 자막·안전 문구를 표시한다. 안전 문구는 검수된 출처를 함께 보이고, TTS는 안전 문구와 모든 작업 단계를 순서대로 읽는다. transcript, 위험 판정, identity/audit 정보, token/cache key와 TTS hash는 근로자 화면에 표시하지 않는다.

1. 농장주가 음성을 녹음한다.
2. STT가 transcript를 반환한다.
3. AI가 사투리를 정규화하고 `task_code`, 단계, 수량, 장소, 안전, 완료조건을 구조화한다. AI 판정은 `READY`, `AMBIGUOUS`, `UNSUPPORTED`다.
4. AI는 모르는 값을 `UNSPECIFIED` 또는 `null`로 보존한다. 농장주는 요약과 모호함을 확인하고 필요한 보완을 음성으로 추가한다. 같은 Farm의 유효하고 아직 확정되지 않은 `structure-v2` WorkDraft는 owner cookie로 다시 열 수 있다. 원음은 복구하지 않으며, 만료·다른 Farm·없는 초안은 같은 `404 NOT_FOUND`, 확정 초안은 `409 VERSION_CONFLICT`, legacy 초안은 `422 LEGACY_READ_ONLY`로 닫는다.
5. 정부 가이드 공식 번역 HIT는 `OFFICIAL_GUIDE`, 일반 작업표현 MISS는 `AI_TRANSLATION`으로 표시한다. 안전표현은 검수된 출처가 없으면 게시하지 않는다.
6. `APPROVED`이고 `safety_level: LOW`인 사전 생성 영상을 매칭한다. 영상이 없으면 텍스트+TTS를 사용한다.
7. 농장주가 `CONFIRM` 또는 허용된 `PUBLISH_AS_IS`를 선택하면 검증된 `structure-v2`/`ontology-v2` WorkVersion v1과 `vi`·`ne` WorkerBriefing package를 원자적으로 `PUBLISHED`한다. confirm request는 delivery 방식·언어·worker 정보를 받지 않으며 익명 링크도 만들지 않는다.
8. 게시 뒤 `CO_PRESENT`는 owner PIN briefing에서 `vi|ne`를 골라 재생한다. `REMOTE`는 별도 발급 API에서 언어를 골라 24시간 익명 `/w/{token}` browser 링크를 만든다. TodayWorkTeam은 QR join에서 worker가 별명·`vi|ne`를 직접 고르고, 농장주는 roster에 각 WorkSession을 하나 이상 배정한다.
9. 유효한 remote 링크는 고정 버전이 아니라 항상 최신 `PUBLISHED` WorkVersion을 읽는다. 링크 만료·재발급 시 기존 링크를 폐기한다.
10. 수량 변경 audio parse는 저장하지 않는다. 농장주가 `quantity`와 `expected_version`을 직접 확인할 때만 새 immutable version을 만든다.

## AI 원칙과 게시 gate

`AI는 추측하지 않는다. 결정은 농장주가 한다.`

- non-blocking ambiguity는 owner가 `PUBLISH_AS_IS`와 reason을 선택할 수 있다.
- `저쪽 밭`, `저짝`, `거기` 같은 현장 지시어만으로 재녹음이나 위치 입력을 강제하지 않는다. 원문 위치와 `canonical_name:null`을 보존한다. 위치 권고만 남은 LOW-risk 초안은 `현장에서 장소를 알려주고 전달` 버튼 한 번으로 `PUBLISH_AS_IS`와 `IN_PERSON_BRIEFING` 사유를 명시적으로 선택한다. 서로 다른 장소 후보가 충돌하거나 실행할 작업을 특정할 수 없는 경우에만 보완을 차단 조건으로 둔다.
- 한 지시에 양파와 딸기의 실행 작업이 모두 있으면 한 작물을 임의 선택하거나 다른 작물 단계를 버리지 않는다. `AMBIGUOUS`·빈 단계·blocking `TASK` 초안으로 작물별 분리를 요청한다. 부정문에만 등장한 작물은 복수 작물 작업으로 세지 않는다.
- safety ambiguity, HIGH/UNKNOWN 위험, schema invalid, 실행 단계 없음은 override할 수 없다.
- 비안전 미지원 작업만 owner reason을 남기고 `task_code: null`, text+TTS로 전달할 수 있다.
- P0 영상은 AI 사전 생성·사람 검수 자산만 사용하며 `ONION_TRANSPORT`에는 차량 운전·차량 이동 장면을 넣지 않는다.

## 역할과 인계물

| 주체 | 책임 | 인계물 |
|---|---|---|
| FE | 음성 입력, 확인, 두 delivery branch, briefing/remote 화면, 접근성, fallback | API 계약에 맞는 모바일 화면, 두 branch 재현 영상 |
| BE | 인증 쿠키, WorkDraft/WorkSession/버전/익명 링크·임시 팀 저장, 최신 resolve, 게시 gate | REST API, DB 제약, 상태·오류 코드 |
| AI | provider-neutral STT/구조화/번역/TTS, 추측 없는 판정, source·영상 검수, 평가 | 버전 고정 prompt, 검증 JSON, source/asset manifest, 평가 결과 |

## 성공 기준

공개 HTTPS와 두 폰에서 3회 연속: 음성→스토리보드→`CO_PRESENT` 언어 briefing→`REMOTE` 언어 링크 또는 오늘 작업팀 QR join·개별 배정→`20망`에서 `15망` 변경→각 화면 최신 버전 확인.

## current publish와 legacy 읽기

새 WorkDraft와 publish는 current two-crop `structure-v2`/`ontology-v2`만 사용한다. `structure-v1` immutable WorkVersion은 읽기·표시·감사만 허용하며 수량 preview·confirm은 `422 LEGACY_READ_ONLY`다. migration은 legacy data와 asset reference를 reset·drop·rewrite·자동 remap하지 않는다. 수량 변경도 새 state와 `vi`·`ne` package를 모두 다시 만든 뒤 하나의 transaction으로 게시한다.
