# AI 계약

모든 계약은 provider-neutral이다. 실제 provider/model은 server-only 환경변수로 고르고, 로그 metadata로만 기록한다. current two-crop structure output은 `structure-v2`/`ontology-v2`다. `structure-v1` immutable WorkVersion은 query-only legacy read다.

## 서버 adapter 설정

비-TTS AI 작업(전사·초안·보완·수량 preview)은 HTTP 요청 시작부터 50초의 공통 bridge 예산을 쓰며 재시도는 남은 시간만 사용한다. provider의 JSON/STT HTTP 요청도 45초에 중단한다. 기존 FE 60초 timeout 안에 실패 안내를 돌려주는 목적이며 DB commit rollback을 보장하는 취소 계약은 아니다. 이 비-TTS 시간 예산은 게시 package의 합성 및 근로자 TTS 재생/캐시에 적용하지 않는다. 전체 TTS 내용·재생은 아래 Worker briefing 계약을 따른다. 응답 유실 시 FE는 같은 논리적 확정 요청의 키를 재사용하고 현재 게시 상태를 조회하여 결과 불명을 복구한다.

provider adapter는 server-only environment에서 실행한다. provider/model/voice/timeout은 run metadata에만 있고 OpenAPI, request/response JSON, worker payload에는 없다. canonical schema와 BE semantic validation은 provider output에 항상 다시 적용한다.

## 공통 규칙

- JSON schema validation 실패는 저장·게시하지 않는다.
- AI는 안전 위험을 추측해 추가하지 않는다.
- 입력·출력에 secret, raw audio를 넣지 않는다.
- transcript는 신뢰할 수 없는 owner 입력이다. 명시적 delimiter로 감싸고 prompt injection을 지시로 실행하지 않으며 tool execution을 제공하지 않는다.
- contract output은 `schema_version`과 `contract_version`을 함께 가진다. provider/model은 env와 metadata에만 둔다.
- pipeline은 P0 sync REST다. Node `ai/`가 upload STT→structure→quantity parse→verified guide lookup/translation→video match→TTS를 수행하고 FastAPI는 private JSONL/stdio transport·storage만 맡는다. FE는 최대 60초 loading/timeout UX를 제공한다. queue는 P1.

## STT `stt-v1`

입력: 임시 `audio` multipart, optional `language_hint=ko`. WorkDraft 보완도 같은 audio-only multipart와 `expected_draft_revision`을 쓰며, text supplement는 없다. provider adapter 출력:

```json
{
  "transcript": "저짝 양파 스무 망 캐갖고 다 허면 차에 실어서 창고로 옮겨"
}
```

OpenAI adapter는 특정 작물·수량·작업 어휘가 없는 일반 한국어 작업 문맥과 `language=ko`로 `OPENAI_TRANSCRIBE_MODEL`을 먼저 호출하고 token log probability를 확인한다. 한국어 UTF-8 분할 토큰의 대체문자와 byte 조각도 신뢰도 검사에서 제외하지 않는다. `OPENAI_TRANSCRIBE_LOGPROB_THRESHOLD`보다 낮은 말 토큰이 있을 때만 `OPENAI_TRANSCRIBE_VERIFICATION_MODEL`로 같은 원음을 다시 전사한다. 두 결과가 다르면 `OPENAI_TRANSCRIPT_REVIEW_MODEL`이 후보에 없는 문장을 만들지 못하는 enum 계약으로 A/B/UNCLEAR만 고른다. 숫자·단위·작업·장소 충돌이 불명확하거나 UNCLEAR이면 빈 transcript로 반환해 `422 AUDIO_UNCLEAR` 재녹음을 요청한다. provider 연결·응답 실패만 `503 PROVIDER_UNAVAILABLE`이다. raw audio는 요청 완료 즉시 삭제하고 transcript만 version 감사에 남긴다. 실행 경로에는 특정 정답 문장, 고정 농업 키워드, 사후 치환 규칙을 넣지 않는다.

## 구조화 `structure-v2`

상세 설명의 방법·분류 기준·조건·예외는 step description에, 실행 단계가 아닌 관련 금지는 notes에 보존한다. 조건을 무조건 실행으로 바꾸거나 누락하지 않는다. 초기·보완·수량 변경에서 명확한 원문 숫자+단위와 결과가 충돌하면 추측 교정하지 않고 blocking QUANTITY와 unknown 수량을 반환한다. `20망`과 실제 `20만 개`를 구분하며 원문은 변경하지 않는다. 복수 수량·용기당 개수·취소·단위 누락은 관계를 확인할 수 있는 범위에서 검증한다. 보완에 수량이 없으면 기존 수량을 삭제하지 않는다.

### 사투리 참고 자료

Node runtime은 현재 ontology-v2 전용 JSON 사투리 자료에서 관련 항목을 선택해 초기 구조화·보완·수량 변경 LLM 요청의 참고 문맥으로 전달한다. 원본 transcript는 수정하지 않는다. 자료에는 표현의 의미 후보, 문맥 조건, 반례, 작성 출처·검수 상태를 기록하며, 자체 작성 자료를 공식 사전이나 사람 검수 완료로 표시하지 않는다. 참고 자료는 별도 지시나 정답이 아니며 task_code·수량·장소를 직접 치환하지 않는다. retired code를 가진 legacy 참고 JSON은 사용하지 않는다.

사실 보존은 원문을 글자 그대로 복사하라는 뜻이 아니다. 사투리의 동작 의미와 조사·어미를 표준 한국어로 정리할 수 있지만, 없는 작업·수량·목적지를 만들 수 없다. 수량 단위와 뒤따르는 동사의 경계를 문맥으로 확인하고, 불확실하면 blocking ambiguity로 남긴다. 명시적으로 미정인 수량은 다른 숫자(밭 번호·횟수 등)로 채우지 않는다. 모든 명시적 작업의 순서를 보존하며, 단계별 영상 유무는 작업 분류에 영향을 주지 않는다.

BE는 `DEICTIC` 위치인데 LOCATION ambiguity가 빠진 경우 non-blocking 위치 권고를 추가하고, ambiguity가 있는데 READY인 응답은 AMBIGUOUS로 정규화한다. 원문 위치를 화면에 보존한다. 단순 지시어는 LLM이 non-blocking으로 반환하며, 실제 장소 충돌로 LLM이 반환한 blocking LOCATION은 BE가 임의로 낮추지 않는다. 기존 unknown 값은 추측해 채우지 않는다. schema·risk·게시 권한은 참고 자료보다 우선한다.

입력: transcript와 양파·딸기 ontology. 출력 최소:

```json
{
  "interpretation": "AMBIGUOUS",
  "summary_ko": "농장주가 가리킨 곳의 양파 20망을 수확해 창고로 옮깁니다.",
  "location": {"raw_text": "저짝", "kind": "DEICTIC", "canonical_name": null},
  "task_family": "ONION",
  "quantity": {"value": 20, "unit": "망"},
  "deadline": null,
  "safety": [],
  "notes": null,
  "steps": [
    {"sequence": 1, "task_code": "ONION_HARVEST", "title_ko": "양파 수확", "description_ko": "양파를 수확한다", "unsupported_reason": null}
  ],
  "ambiguities": [
    {"field": "location", "message": "'저짝'은 현장에서 농장주가 가리킨 위치 확인이 필요합니다.", "blocking": false, "kind": "LOCATION"}
  ],
  "schema_version": "2",
  "contract_version": "structure-v2",
  "ontology_version": "ontology-v2"
}
```

`interpretation`은 `READY`, `AMBIGUOUS`, `UNSUPPORTED` 중 하나다. `ambiguities[]` 원소는 `field`, `message`, `blocking`, `kind`(`SAFETY|TASK|LOCATION|QUANTITY|TIME|OTHER`)를 가진다. AI는 추측하지 않고 unknown을 `UNSPECIFIED` 또는 `null`로 둔다. 실행할 단계가 없으면 blocking; 대상·장소가 불명확하면 ambiguity; 수량은 언급됐지만 값 또는 단위가 모호할 때만 질문한다. `DEICTIC` 자체는 non-blocking LOCATION 권고이며 owner가 현장 설명 전달 버튼으로 reason을 선택할 수 있다. 실제 장소 후보 충돌이나 실행 불가능을 근거로 한 blocking LOCATION은 보존한다. `deadline`/`notes`는 선택이므로 질문하지 않는다. 질문은 한 번에 하나, 답변은 기존 draft에 merge한다. non-blocking ambiguity는 owner가 `PUBLISH_AS_IS` 또는 `SUPPLEMENT`를 선택할 수 있다. unsupported non-safety task는 `task_code:null`/`UNSUPPORTED` marker와 video null로 남겨 text+TTS fallback을 허용한다. safety ambiguity는 강제 gate다.

모든 step과 ambiguity는 transcript에 실제로 있는 표현에 근거해야 한다. transcript에 없는 단어나 목적지를 ambiguity message, summary, step에 만들지 않는다. 운반은 명시된 이동 동사와 목적지가 모두 있을 때만 `*_TRANSPORT`로 분류한다. 컨테이너에 넣는 표현만으로 운반을 추론하지 않는다. `TASK`, `QUANTITY`, `SAFETY` ambiguity는 blocking이며 단순 현장 지시어의 `LOCATION` 권고만 non-blocking으로 반환한다.

P0 task_code는 양파의 `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`와 딸기의 `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, `STRAWBERRY_PACKING`이다. 각 non-null step은 출력 `task_family`와 일치해야 하며, BE가 이를 다시 검증한다. unsupported non-safety task는 `task_code:null`과 `unsupported_reason`으로 반환한다. owner override 뒤 BE가 `delivery_mode: TEXT_TTS|TEXT`로 보존한다. 안전·HIGH·schema invalid·no executable step은 override할 수 없다. safety는 입력에 명시된 것만 보존한다.

LLM은 영상·TTS URL이나 `delivery_mode`를 만들지 않는다. 초안은 구조화만 하며 게시 시 Node가 검수 manifest와 번역을 결합해 WorkerBriefing을 만들고 BE가 검증·저장한다. owner 미디어 필드를 채우려고 저장된 structure를 다시 쓰지 않는다.

한 지시에 두 작물의 실행 작업이 있으면 `AMBIGUOUS`, 빈 `steps`, blocking `TASK`로 작물 선택/분리를 요청한다. required `task_family`에는 원문에 있는 첫 실행 작물을 임시 표현하되 게시 가능한 선택으로 취급하지 않는다. 부정문에만 등장한 작물은 제외한다. 명시적으로 수량을 모른다고 하거나 결정하지 않았다고 한 경우는 수량 자체를 생략한 경우와 구분하며, unknown과 blocking `QUANTITY`를 함께 보존한다. 숫자 없는 용기 명사·이미 완료된 동작의 관형형은 수량 요구가 아니다. 명확한 숫자+용기 단위는 수확·운반 목표량이 될 수 있으며 별도 포장 동작이나 용기별 용량 확인을 요구하지 않는다.

## 수량 변경 `quantity-change-v1`

입력은 owner cookie로 받은 audio와 `expected_version`이다. sync REST parse는 저장하지 않고 다음만 반환한다.

```json
{"interpretation":"READY","quantity":{"value":15,"unit":"망"},"expected_version":1,"ambiguities":[],"schema_version":"1","contract_version":"quantity-change-v1"}
```

불명확하면 `interpretation: AMBIGUOUS`, `quantity:null`, 한 개의 `ambiguities[]`를 반환한다. preview는 저장하지 않으며, owner가 확인한 READY 값과 `expected_version`만 BE direct-confirm API에 보낸다. 확정된 WorkVersion이 유일한 변경 감사 기록이다.

## 번역 `translation-v1`

Node는 segment 의미를 구분해 번역한다. 기존 GuidePhrase/GuideTranslation의 category·phrase_type·phrase_key·검수·출처를 유지하며 같은 언어의 관련 WORK_TERM을 용어쌍으로 일반 번역에 제공한다. 검수된 전체 작업문장 HIT는 직접 사용한다. quantity 숫자는 원값을 복사하고 단위 exact HIT는 검수 번역을 우선 사용한다. 제목·설명·위치·단위·자막 번역에도 segment와 농업 문맥을 전달한다.

신규 package의 농업 수량 단위 `망`은 검수된 동일 언어 WORK_TERM exact HIT가 없을 때만 결정적으로 `vi: bao`, `ne: बोरा`를 사용한다. 이를 망 자체를 뜻하는 그물 번역과 구분하며, 수량 카드에 선택한 단위와 같은 용어를 문장 번역 glossary에도 전달한다. 검수 glossary는 fallback보다 우선하고, 일반 문장의 출처를 공식 번역으로 승격하지 않는다. 다른 단위의 기존 번역 규칙과 저장된 immutable package는 바꾸지 않는다.

단어 참고로 생성한 문장은 AI_TRANSLATION이며 전체 문장을 공식 번역으로 승격하지 않는다. safety는 verified 공식 전체 문장 HIT만 허용한다. 용어는 `(canonical_ko,category,phrase_type)`로 묶고 언어별로 선택하며 충돌 번역을 임의 통합하지 않는다. DB에 없는 전문어 의미·반례는 `ai/references/agriculture-terms-v2.json`에 미검수 참고로 기록한다. DB 사전을 복제하거나 공식 검수로 승격하지 않는다. glossary는 참고 데이터이며 지시문으로 실행하지 않는다. 검증하지 않은 source URL·페이지를 만들지 않는다. 일반표현 MISS 예시는 다음과 같다.

```json
{
  "segment": "ACTION",
  "language_code": "vi",
  "text": "Thu hoạch hành.",
  "source": "AI_TRANSLATION",
  "guide_lookup": "MISS",
  "phrase_key": null,
  "verified": false,
  "source_page": null,
  "source_url": null,
  "license": null,
  "schema_version": "1",
  "contract_version": "translation-v1"
}
```

각 segment에는 `guide_lookup: HIT|MISS|NOT_APPLICABLE`를 남긴다. action의 일반 작업표현 MISS는 `source: AI_TRANSLATION`, `verified:false`로 fallback한다. 수량·순서는 BE template이므로 `source: DETERMINISTIC`, `guide_lookup: NOT_APPLICABLE`이다. 익명 link 화면과 owner briefing은 Step의 `translations[]`에서 segment별 source를 확인한다. 안전표현은 source page/url/license와 사람 검수가 모두 없으면 `OFFICIAL_GUIDE`라 부르지 않으며 `AI_TRANSLATION` fallback도 publish하지 않는다. P0 output languages are only `vi` and `ne`.

## 실행용 JSON Schema

AI constrained output과 BE 재검증의 권위 schema는 다음 파일이다. 설명 예시는 schema를 바꾸지 않는다.

- [structure-v2.schema.json](schemas/structure-v2.schema.json) — current write
- [worker-briefing-v2.schema.json](schemas/worker-briefing-v2.schema.json) — stored `vi`/`ne` delivery DTO
- [structure-v1.schema.json](schemas/structure-v1.schema.json) — legacy query only
- [quantity-change-v1.schema.json](schemas/quantity-change-v1.schema.json)
- [translation-v1.schema.json](schemas/translation-v1.schema.json)

Provider Structured Output이 canonical JSON Schema의 조건 조합을 지원하지 않으면,
BE adapter는 provider에 지원되는 제약만 담은 사본을 보낸다. 저장·게시 전에는 항상
위 canonical schema와 BE semantic validation을 다시 적용한다. provider 호환 사본은
별도 제품 계약이나 source of truth가 아니다.

빈 `steps[]`는 `AMBIGUOUS`이면서 `blocking:true`, `kind:TASK` ambiguity가 하나 이상인 경우에만 허용하는 blocking draft다. `READY`와 `UNSUPPORTED`에는 하나 이상의 executable step이 필요하다.

## 안전 판정 `safety-policy-v1`

AI가 위험을 낮추거나 안전 문구를 만들어 내지 않는다. BE는 validated structure, segment provenance, 선택된 visual asset의 판정을 합친다. 하나라도 HIGH면 HIGH, HIGH 없이 하나라도 UNKNOWN이면 UNKNOWN, 모두 LOW일 때만 LOW다. 게시 행렬은 [SAFETY_POLICY](SAFETY_POLICY.md)가 권위다. `risk_assessment`는 owner draft와 version audit에만 포함하며 worker response에는 포함하지 않는다.

## TTS `tts-v1`

입력: 아래 규칙으로 조립한 게시 대상 WorkerBriefing의 전체 locale text, `language_code`(`vi|ne`), voice settings. 출력: 재생 가능한 `audio_url` 또는 실패 상태. publish 시 text content hash로 생성·cache하며 text를 source of truth로 둔다. 별도 LLM 요약·재작성 없이 번역된 표시 텍스트를 그대로 조립한다. 실패하면 text를 표시한다.

## Worker briefing `worker-briefing-v2`

`worker-briefing-v2`는 `vi` 또는 `ne` 하나의 locale 전용 delivery DTO다. `context.location_display`, quantity unit, `deadline`, `notes`, `steps[].title`, `steps[].description`, `safety[].text`, `video[].captions_text`는 모두 선택된 locale로만 보낸다. source Korean 또는 다른 locale의 fallback을 그대로 보내면 package validation이 실패한다.

`context.safety[]`는 worker에게 표시할 현지화된 안전 문구다. 각 문구의 provenance는 기존 `source_detail[]`에 `segment:"SAFETY"`, `step_sequence:null`로 같은 배열 순서에 보존한다. safety는 검수된 `OFFICIAL_GUIDE` HIT(`verified:true`, page/url/license 포함)여야 하며, 안전 번역 MISS는 package를 만들거나 게시할 수 없다. step action provenance는 `step_sequence`과 source step 순서를 보존한다.

`steps[]`는 published WorkVersion의 모든 step을 같은 수와 배열 순서로 보존한다. video match 또는 TTS 실패는 step을 삭제하거나 재정렬하지 않으며 delivery mode만 `TEXT_TTS` 또는 `TEXT`로 낮춘다. 신규 package의 전체 TTS input은 아래 항목에서 비어 있지 않은 문자열만 골라 줄바꿈(`\n`)으로 합친다. 항목 내용은 요약·재작성하지 않는다.

1. `context.location_display`
2. `context.quantity`가 객체일 때만 `${value} ${unit}`; `null` 또는 문자열이면 생략
3. `context.deadline`
4. `context.safety[]` 전체를 배열 순서대로
5. `steps[]` 전체를 저장된 배열 순서대로 각각 `${title} ${description}`
6. `context.notes`

예를 들어 검수 단위 HIT가 없는 `quantity:{value:20,unit:"망"}`의 새 package는 `vi`에서 `20 bao`, `ne`에서 `20 बोरा`를 두 번째 항목으로 읽는다. 마감·메모가 null이면 빈 줄이나 대체 문구를 만들지 않는다. Worker DTO의 `tts.text_hash`는 이 exact UTF-8 text의 64자리 SHA-256으로 UI에 표시하지 않는다. Node↔BE private `tts_transport`는 exact `text`, `text_hash`, audio bytes를 보관하며, BE 신규 package 검증과 browser 전체 음성 fallback은 동일한 조립 규칙을 사용한다.

`context.notes`는 기존 메모 필드 그대로 유지하며 금지·주의 문구의 휴리스틱 분류나 `safety` 이동을 하지 않는다. FE는 시작 전 첫 화면·단계 화면·CO_PRESENT 화면에서 메모 전체를 펼침 없이 표시한다. 단계 음성은 안전 문구 전체, 현재 단계의 `${title} ${description}`, 메모의 비어 있지 않은 항목을 줄바꿈으로 합친다.

기존 immutable package와 저장 음성은 수정하지 않는다. browser는 현재 표시 package로 조립한 전체 텍스트의 hash와 저장된 `tts.text_hash`가 일치할 때만 저장 음성을 전체 듣기에 사용한다. 불일치·검증 불가·재생 실패 시 같은 전체 텍스트를 기기 음성으로 읽고, 기기 음성도 미지원이면 선택 언어 글 안내와 재시도를 유지한다. 신규 생성 검증 규칙을 과거 package 조회의 차단 조건으로 적용하지 않는다.

worker DTO에는 transcript, raw audio, `risk_assessment`, identity/owner audit field, token/cache key를 넣지 않는다. `tts.text_hash`만 cache validation용 opaque hash로 허용하며 UI는 이를 표시하지 않는다. `session_id`와 version은 published briefing 식별을 위한 허용 field다.

## 영상 매칭 `visual-match-v1`

현재 전달 정책은 신규 양파 운반(`ONION_TRANSPORT`) package의 영상만 제외하고 같은 작업 코드·텍스트·TTS를 유지한다. 이 설정은 `ai/references/delivery-policy-v2.json`의 데이터로 관리하며 동작 표현 치환이나 task_code 변경에 사용하지 않는다. 다른 단계 영상과 이미 저장된 immutable briefing package는 변경하지 않는다.

입력: allowlisted `task_code`; 출력: `visual_asset_id` 또는 `null`. asset은 `provenance: AI_GENERATED_PREGENERATED`, `review_status: APPROVED`, `safety_level: LOW`일 때만 매칭·게시한다. HIGH는 생성·기록 가능하지만 게시 금지. P0 영상은 기계 정지 수작업뿐이며 운전·회전날·농약·고소작업을 포함하지 않는다.

## FE/BE/AI 인계

FE는 계약 schema와 60초 timeout, owner source/review badge, worker의 `출처 보기`, ambiguity/safety badge를 표시한다. BE는 server-side schema·allowlist·safety gate·expected version을 재검증하고 transcript를 worker 응답에서 제거한다. AI는 계약 version·input/output ID·provider/model metadata를 평가 log에 넘긴다.

## current two-crop contract

[structure-v2.schema.json](schemas/structure-v2.schema.json)가 current two-crop write contract다. 신규 AI draft와 publish는 `structure-v2`/`ontology-v2`의 8개 current code만 쓰고 non-null code를 `task_family`와 일치시킨다. structure와 supplement prompt는 retired `ONION_COLLECT`, `BAGGING`, `LOADING`, `WAREHOUSE_TRANSPORT`, `STACKING` 및 allowlist 밖 code를 새 output에서 금지한다. `structure-v1` WorkDraft와 immutable WorkVersion은 query-only legacy read path에서 stored code를 remap하지 않고 보존하며 legacy quantity preview/confirm은 `LEGACY_READ_ONLY`다. current publish와 quantity regeneration은 완성된 `worker-briefing-v2` `vi`·`ne` package를 정확히 둘 다 생성한다. worker response에는 계속 transcript, raw audio, risk assessment, token hash, owner audit field를 넣지 않는다.

Node private JSONL bridge operation은 `TRANSCRIBE_AUDIO`, `BUILD_OWNER_DRAFT_V2`, `MERGE_SUPPLEMENT_V2`, `PARSE_QUANTITY_CHANGE`, `BUILD_WORKER_PACKAGES_V2`다. `TRANSCRIBE_AUDIO` payload는 identity-free `audio_base64`, optional `filename`, `content_type`, `language_hint`만 받고 decoded 10 MiB와 audio MIME allowlist를 검사한다. `PARSE_QUANTITY_CHANGE`는 transcript와 trusted `expected_version`만 받고, 명확한 `열두 망으로 맞춰`를 `READY`, `{value:12, unit:"망"}`, 빈 ambiguities로 해석한다. STT bridge 응답은 `{transcript}`이며 raw audio와 transcript는 log나 worker DTO에 넣지 않는다.
