# 밭머리 제품 명세

## 한 줄 정의

밭머리는 농장주의 전라도 사투리 지시를 작업 단계로 구조화하고, 검수된 정부 가이드 표현과 사전 생성·사람 검수된 양파 작업영상을 조립해 베트남어·네팔어 작업 스토리보드로 전달한다. 지시가 명확히 바뀌면 두 delivery branch의 최신 수량을 반영한다.

## P0 불변 범위

- 작물: 양파 vertical 하나
- 전달 언어: `vi`, `ne`
- 변경: 수량 변경만 자동 반영. 예: `20망`에서 `15망`.
- 영상: AI가 사전 생성하고 사람이 검수한 파일만 사용. 생성 시 `provenance`, `review_status`, `safety_level` 기록. `HIGH`는 게시 금지.
- 화면: 랜딩 다음 역할 선택, 오늘 작업팀 QR 생성·참여·팀원 목록, 농장주 음성 입력·확인·전달, `CO_PRESENT` owner 폰 briefing, `REMOTE` 익명 개인 링크. 로그인 화면은 없다.
- 배포 전제: React/Vite/Tailwind, FastAPI, PostgreSQL(Supabase 가능), Vercel(프론트), Railway(API).

P1: 농장주 회원가입/계정관리, SMS, 질문, 추가 작물·언어, 오프라인 캐시, 통계, 급여·출퇴근.

## 핵심 흐름

역할 선택 뒤 농장주는 오늘 작업팀 참여 QR을 생성할 수 있다. 근로자 참여 UI는 첫 화면에서 QR 스캔 또는 참여 링크와 국적만 받고, 다음 화면에서 이름 또는 별명을 받는다. 국적은 베트남(`VN`)·필리핀(`PH`)·라오스(`LA`)·캄보디아(`KH`)·태국(`TH`)·네팔(`NP`)·미얀마(`MM`)·몽골(`MN`) 중 하나다. 안내 언어는 랜딩에서 선택한 지원 언어 `vi|ne`를 이어받으며 국적이 안내 언어를 자동 결정하지 않는다. 최종 참여 요청은 별명·국적·안내 언어를 함께 보낸다. 참여 정보는 오늘 작업팀 범위에만 존재하며 개인 계정을 만들지 않는다. 농장주 화면은 참여자를 별명·국적·안내 언어로 표시한다.

랜딩 이후 역할 선택과 웹앱 화면의 모든 글자는 랜딩보다 3pt 크게 표시한다.

1. 농장주가 음성을 녹음한다.
2. STT가 transcript를 반환한다.
3. AI가 사투리를 정규화하고 `task_code`, 단계, 수량, 장소, 안전, 완료조건을 구조화한다. AI 판정은 `READY`, `AMBIGUOUS`, `UNSUPPORTED`다. 추측하지 않고 누락·모호 값은 `UNSPECIFIED` 또는 `null`로 유지한다.
4. 농장주가 한국어 요약과 `ambiguities[]`를 확인하고 필요한 보완을 audio-only로 말한다. 빈 `steps`는 blocking `TASK` draft로 남기며 게시할 수 없다. [Safety Policy](SAFETY_POLICY.md)에 따라 LOW 비안전 미지원 작업만 reason을 남겨 전달할 수 있다. `SAFETY` ambiguity, HIGH·UNKNOWN 위험, schema invalid, 실행 단계 없음은 override할 수 없다.
5. 정부 가이드 공식 번역 HIT는 `OFFICIAL_GUIDE`; 일반 작업표현 MISS는 `AI_TRANSLATION` fallback으로 표시한다. 각 언어별 번역에는 검수된 source snapshot을 보존한다. 안전표현은 검수된 source가 없거나 위험도가 높으면 자동 게시하지 않는다.
6. `APPROVED`이고 `safety_level: LOW`인 AI 사전 생성 영상을 단계에 매칭한다. 영상이 없으면 텍스트+TTS를 사용한다.
7. 역할 선택에서 농장주를 고르면 자동 데모 세션이 발급된다. owner confirm 뒤 delivery branch를 고른다. `CO_PRESENT`는 `vi|ne` 선택 후 demo owner session briefing에서 video+TTS를 재생한다. `REMOTE`는 `vi|ne` 선택 후 익명 24시간 링크를 한 번 발급한다.
8. remote link는 발급 24시간 후 만료된다. 유효 링크와 owner briefing은 고정 버전이 아니라 최신 `PUBLISHED`를 매번 조회한다. 두 화면은 5초 polling하고 visibility/focus 복귀 시 즉시 재조회한다. 응답 `version` 증가 시 화면과 TTS를 교체한다.
9. 수량 변경 audio parse는 저장하지 않고 `READY|AMBIGUOUS`, 수량 후보, `expected_version`을 반환한다. 별도 proposal record를 만들지 않는다. 농장주가 READY 후보와 `expected_version`을 직접 확인할 때만 새 immutable version을 저장한다. 최초 확인은 immutable `v1` `PUBLISHED`, 변경 확인은 `v2`를 만든다. 최신 버전만 근로자에게 보인다.

10. confirm은 link를 만들지 않는다. remote link는 owner의 단일 create/reissue API에서만 raw URL을 한 번 반환한다. 24시간 뒤 만료된 화면은 재발급 안내를 보이고, `CO_PRESENT` briefing은 demo owner session cookie로 최신 상태를 읽는다. 근로자 응답은 장소·수량·마감·안전·메모·단계·배지를 선택 언어로만 반환하며 한국어 fallback을 금지한다.

## AI 원칙과 ambiguity

`AI는 추측하지 않는다. 결정은 농장주가 한다.` `ambiguities[]` 원소는 `field`, `message`, `blocking`, `kind`(`SAFETY|TASK|LOCATION|QUANTITY|TIME|OTHER`)를 가진다. `blocking:false`면 owner가 `PUBLISH_AS_IS` 또는 `SUPPLEMENT`를 선택할 수 있다. `PUBLISH_AS_IS`는 `ambiguity_override:true`, 허용된 `override_reason`, `overridden_at`을 감사 기록한다. LOW 비안전 미지원 작업 외에는 override하지 않으며, delivery 화면에는 `확인이 필요한 지시` 배지와 `UNSPECIFIED`/null 필드를 보여준다.

## 역할과 인계물

| 주체 | 책임 | 인계물 |
|---|---|---|
| FE | 녹음·확인·스토리보드·두 delivery branch UI, 접근성, fallback 표시 | API 요청/응답에 맞는 모바일 화면, 재현 영상 |
| BE | 인증 쿠키, WorkSession/버전/익명 link 저장, 최신 PUBLISHED resolve, safety gate | REST API, DB 제약, 상태·오류 코드 |
| AI | provider-neutral STT/구조화/번역/TTS, 추측 없는 판정, 언어별 source snapshot·영상 검수, 평가 | 버전 고정 prompt, 검증된 JSON, asset/source manifest, 평가 결과 |

## 성공 기준

휴대폰 2대와 공개 HTTPS에서 3회 연속: 음성→4단계 이상 스토리보드→영상/TTS→`CO_PRESENT` owner 폰 briefing과 `REMOTE` 익명 링크의 `vi` 또는 `ne` 전달→`20망`에서 `15망` 변경→두 branch 최신 화면 `15망`.
