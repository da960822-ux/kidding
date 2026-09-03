# 밭머리 도메인 언어

밭머리는 농장주의 구두지시를 근로자가 실행할 수 있는 최신 작업상태로 바꾸는 맥락이다. 이 문서는 제품 용어만 정의하며 구현 세부사항은 다루지 않는다.

## 작업

**WorkSession**  
하나의 장소에서 수행할 오늘 작업과 그 최신 상태.
_Avoid_: job, assignment (`assignment`는 WorkerLink 응답 DTO에만 사용)

**WorkDraft**  
농장주 확인 전 AI가 해석한 작업 제안. 확정된 작업이 아니다.
_Avoid_: final task

**WorkVersion**  
농장주 확인으로 고정된 WorkSession의 불변 상태. 최초 확인은 `v1`, 명확한 수량 변경 확인은 다음 정수 버전이다.
_Avoid_: revision (UI 표시는 `v1` 가능)

**TaskStep**  
WorkVersion 안에서 순서가 있는 하나의 실행 단계.
_Avoid_: action, instruction (일반 문장)

**task_code**  
TaskStep의 정규 행위를 식별하는 대문자 snake case 코드. P0 허용값은 양파의 `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`와 딸기의 `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, `STRAWBERRY_PACKING`이다. non-null 코드는 같은 WorkState의 `task_family`와 반드시 일치한다.
`task_code:null`은 새 코드가 아니라, 농장주가 전달을 선택한 비안전 미지원 작업을 뜻한다.
_Avoid_: crop code, free-text action

**task_family**
P0 작업 대상 작물. `ONION` 또는 `STRAWBERRY`만 허용한다. 새 작물은 free-text나 별칭으로 추가하지 않고, ontology·schema·BE allowlist·영상 manifest·평가를 함께 통과해야 한다.

**quantity**  
작업 대상의 수치와 단위 묶음. P0 예시는 `20`과 `망`이다.
_Avoid_: amount (금액 의미와 혼동)

## 상태와 변경

**DRAFT**  
아직 농장주 확인을 받지 않은 WorkDraft 상태. P0 WorkVersion 값이 아니다.

**AI interpretation**  
AI 판정은 `READY`, `AMBIGUOUS`, `UNSUPPORTED`다. 모호함은 owner가 보완하거나 미확정 상태로 전달할지 결정하는 상태이며 WorkVersion lifecycle이 아니다.

**Owner confirmation**  
농장주가 제안을 맞다고 확인하는 행위. P0에서는 확인 기록과 `PUBLISHED` 전환을 한 원자적 동작으로 처리한다.

**PUBLISHED**  
근로자에게 전달 가능한 최신 WorkVersion 상태.

**SUPERSEDED**  
더 높은 버전으로 대체되어 근로자 최신 화면에서 제외된 상태.

**QuantityChangePreview**  
변경 음성을 해석해 농장주에게 보여주는 비영속 수량 후보와 `expected_version`. 농장주 확인 전에는 저장하지 않고 WorkVersion으로 부르지 않는다.
_Avoid_: proposal record, version, update (확정 변경과 혼동)

**Latest Published**  
특정 WorkSession에서 현재 가장 높은 `PUBLISHED` 버전. WorkerLink는 이 상태를 조회한다.

## 언어·근거·영상

**GuidePhrase**  
정부 「우리 농장 소통가이드」에서 가져올 한국어 작업·안전 표현의 정규 항목.

**GuideTranslation**  
GuidePhrase에 연결된 언어별 공식 번역. source page/url/license와 사람 검수가 있어야 공식으로 부른다.

**OFFICIAL_GUIDE**  
검수된 GuideTranslation을 사용했다는 translation source.

**AI_TRANSLATION**  
공식 GuideTranslation MISS 뒤 provider-neutral 번역을 사용했다는 source. 일반 작업표현에만 P0 fallback으로 허용한다.

**VisualAsset**  
하나의 task_code에 매칭되는 사전 생성 작업영상과 그 provenance·검수 정보.

**provenance**  
자산 생성 경로. P0 영상 값은 `AI_GENERATED_PREGENERATED`다.

**review_status**  
영상 검수 상태 `PENDING`, `APPROVED`, `REJECTED`.

**safety_level**  
영상 위험 등급 `LOW` 또는 `HIGH`. `HIGH` 자산은 게시할 수 없다.

## 전달

**WorkerLink**  
WorkSession과 하나의 선택 언어(`vi|ne`)를 연결하는 익명 24시간 유효 browser 링크. 공개 URL은 `/w/{token}`이며 로그인 없이 열고 JSON assignment를 통해 고정 버전이 아닌 Latest Published를 보여준다.

**TodayWorkTeam**
Asia/Seoul의 오늘 날짜에만 유효한 익명 작업팀. 농장주가 QR 하나를 열고, 참가자는 같은 QR에서 별명과 `vi|ne`만 제출한다. 영구 근로자 명부나 계정이 아니다.

**TeamMember**
TodayWorkTeam에 속한 임시 참가자. 별명·선택 언어·참가 시각만 가지며, 해당 브라우저의 서명 cookie로만 자기 배정을 읽는다.
_Avoid_: Worker (영구 고용인·계정을 뜻함)

**TeamAssignment**
TeamMember와 WorkSession의 연결. 근로자 화면은 연결된 WorkSession의 Latest Published를 읽으므로 수량 버전은 고정하지 않는다.

**Delivery mode**  
P0 owner의 전달 선택. `CO_PRESENT`는 owner cookie briefing에서 언어를 고르고 같이 본다. `REMOTE`는 언어 하나로 익명 WorkerLink를 발급한다.

**Executable step**  
비어 있지 않은 title과 description을 가진 TaskStep. allowlisted `task_code` 또는 owner가 승인한 non-safety `task_code:null` fallback이 있다. 빈 `steps[]`는 executable step이 없는 blocking draft다.

**Risk assessment**  
AI extraction과 deterministic rule을 합친 `LOW|HIGH|UNKNOWN` 안전 판정. 하나라도 HIGH면 HIGH, HIGH 없이 하나라도 UNKNOWN이면 UNKNOWN, 모두 LOW일 때만 LOW다. `safety_level`은 VisualAsset 전용이며 risk assessment와 혼용하지 않는다.

**Clarification**  
확정 전에 AI가 한 번에 하나만 묻는 질문. 답은 기존 WorkDraft에 병합한다. 질문을 보완하지 않고 진행할 때는 owner override를 남긴다.

**Ambiguity**  
AI가 추측하지 않고 `UNSPECIFIED` 또는 `null`로 남긴 필드. `field`, `message`, `blocking`, `kind`를 가진다.

**Override reason**  
non-blocking ambiguity를 그대로 전달할 때 owner가 고르는 `EXPERIENCED_WORKER`, `IN_PERSON_BRIEFING`, `OWNER_ACCEPTED_OTHER` 중 하나.

**Demo Fallback**  
네트워크·provider 장애 때 쓰는 고정 fixture. 화면에 `DEMO FALLBACK` badge를 표시하며 live AI 결과로 가장하지 않는다.

**legacy task code**
현재 two-crop allowlist에서 retired된 stored TaskStep code. immutable WorkVersion에서만 저장된 값 그대로 읽으며, 새 WorkDraft·publish·quantity-confirm에는 쓸 수 없다. reset·rewrite·자동 remap하지 않는다.

**WorkerBriefing**
CO_PRESENT, remote, TodayWorkTeam assignment가 같은 immutable WorkVersion에서 읽는 언어별 DTO. transcript, raw audio, risk assessment, token hash, owner/farm/member identity는 포함하지 않는다.
