# AI 계약

모든 계약은 provider-neutral이다. 실제 provider/model은 server-only 환경변수로 고르고, 로그 metadata로만 기록한다. current two-crop structure output은 `structure-v2`/`ontology-v2`다. `structure-v1` immutable WorkVersion은 query-only legacy read다.

## 서버 adapter 설정

provider adapter는 server-only environment에서 실행한다. provider/model/voice/timeout은 run metadata에만 있고 OpenAPI, request/response JSON, worker payload에는 없다. canonical schema와 BE semantic validation은 provider output에 항상 다시 적용한다.

## 공통 규칙

- JSON schema validation 실패는 저장·게시하지 않는다.
- AI는 안전 위험을 추측해 추가하지 않는다.
- 입력·출력에 secret, raw audio를 넣지 않는다.
- transcript는 신뢰할 수 없는 owner 입력이다. 명시적 delimiter로 감싸고 prompt injection을 지시로 실행하지 않으며 tool execution을 제공하지 않는다.
- contract output은 `schema_version`과 `contract_version`을 함께 가진다. provider/model은 env와 metadata에만 둔다.
- pipeline은 P0 sync REST에서 호출하는 AI package다. upload/STT→structure와 선택 언어의 guide lookup/translation→video match→TTS 결과를 반환한다. AI package는 route·인증·DB 저장·version transaction을 구현하지 않으며 BE가 결과를 재검증한다. FE는 최대 60초 loading/timeout UX를 제공한다. queue는 P1.

## STT `stt-v1`

입력: 임시 `audio` multipart, filename/MIME(`audio/webm|audio/mp4`), optional `language_hint=ko`. AI facade는 filename/MIME를 STT provider까지 보존한다. WorkDraft 보완도 같은 audio-only multipart와 `expected_draft_revision`을 쓰며, text supplement는 없다. 출력:

```json
{
  "transcript": "저짝 양파 스무 망 캐갖고 다 허면 차에 실어서 창고로 옮겨",
  "language_code": "ko",
  "confidence": null,
  "schema_version": "1",
  "contract_version": "stt-v1"
}
```

provider가 신뢰 가능한 `confidence`를 제공하지 않으면 `null`을 보존한다. 낮은 confidence 또는 빈 transcript면 재녹음한다. raw audio는 요청 완료 즉시 삭제하고 transcript만 version 감사에 남긴다.

## 구조화 `structure-v2`

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

`interpretation`은 `READY`, `AMBIGUOUS`, `UNSUPPORTED` 중 하나다. `ambiguities[]` 원소는 `field`, `message`, `blocking`, `kind`(`SAFETY|TASK|LOCATION|QUANTITY|TIME|OTHER`)를 가진다. AI는 추측하지 않고 unknown을 `UNSPECIFIED` 또는 `null`로 둔다. 실행할 단계가 없으면 blocking; 대상·장소가 불명확하면 ambiguity; 수량은 언급됐지만 값 또는 단위가 모호할 때만 질문한다. `DEICTIC` location ambiguity는 BE가 non-blocking으로 정규화하므로 owner가 현장 설명 reason으로 전달할 수 있다. `deadline`/`notes`는 선택이므로 질문하지 않는다. 질문은 한 번에 하나, 답변은 기존 draft에 merge한다. non-blocking ambiguity는 owner가 `PUBLISH_AS_IS` 또는 `SUPPLEMENT`를 선택할 수 있다. unsupported non-safety task는 `task_code:null`/`UNSUPPORTED` marker와 video null로 남겨 text+TTS fallback을 허용한다. safety ambiguity는 강제 gate다.

P0 task_code는 양파의 `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`와 딸기의 `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, `STRAWBERRY_PACKING`이다. 각 non-null step은 출력 `task_family`와 일치해야 하며, BE가 이를 다시 검증한다. unsupported non-safety task는 `task_code:null`과 `unsupported_reason`으로 반환한다. owner override 뒤 BE가 `delivery_mode: TEXT_TTS|TEXT`로 보존한다. 안전·HIGH·schema invalid·no executable step은 override할 수 없다. safety는 입력에 명시된 것만 보존한다.

LLM은 영상·TTS URL이나 `delivery_mode`를 만들지 않는다. AI는 구조화 JSON만 반환하고 BE가 검수 manifest와 TTS 결과를 결합해 `openapi.yaml`의 DraftState/PublishedWorkState를 만든다.

## 수량 변경 `quantity-change-v1`

AI package 입력은 audio/text와 BE가 인증 후 전달한 `expected_version`이다. cookie/auth 검증은 BE 책임이며 sync parse는 저장하지 않고 다음만 반환한다. Audio facade도 공개 결과에는 transcript를 섞지 않고 `quantity-change-v1`만 반환한다.

```json
{"interpretation":"READY","quantity":{"value":15,"unit":"망"},"expected_version":1,"ambiguities":[],"schema_version":"1","contract_version":"quantity-change-v1"}
```

불명확하면 `interpretation: AMBIGUOUS`, `quantity:null`, 한 개의 `ambiguities[]`를 반환한다. preview는 저장하지 않으며, owner가 확인한 READY 값과 `expected_version`만 BE direct-confirm API에 보낸다. 확정된 WorkVersion이 유일한 변경 감사 기록이다.

## 번역 `translation-v1`

각 step의 action/quantity/order/location/safety를 별도 segment로 만든다. FE가 보낸 `language_code`를 BE가 AI package에 전달하면 해당 언어(`vi|ne`) 하나만 생성한다. action phrase는 검수된 `GuidePhrase` HIT를 우선하고, quantity/order는 AI package의 deterministic template을 사용한다. safety는 VERIFIED OFFICIAL만 사용하며, missing general phrase만 `AI_TRANSLATION` fallback이다. 전체 문장을 하나의 official source로 표시하지 않는다. 실제 검수된 HIT row는 아직 data collection gate이므로 가짜 URL·페이지를 예시에 넣지 않는다. 일반표현 MISS 예시는 다음과 같다.

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

빈 `steps[]`는 executable step이 없는 blocking draft다. `READY`에는 하나 이상의 step이 필요하다.

## 안전 판정 `safety-policy-v1`

AI가 위험을 낮추거나 안전 문구를 만들어 내지 않는다. BE는 validated structure, segment provenance, 선택된 visual asset의 판정을 합친다. 하나라도 HIGH면 HIGH, HIGH 없이 하나라도 UNKNOWN이면 UNKNOWN, 모두 LOW일 때만 LOW다. 게시 행렬은 [SAFETY_POLICY](SAFETY_POLICY.md)가 권위다. `risk_assessment`는 owner draft와 version audit에만 포함하며 worker response에는 포함하지 않는다.

## TTS `tts-v1`

입력: 선택 언어의 검증된 step text, `language_code`(`vi|ne`), voice settings. 출력: audio bytes, text/audio SHA-256, provider metadata 또는 실패 상태. AI package는 `work content hash + language_code` cache key를 반환하고 BE가 필요하면 저장·URL화를 담당한다. text를 source of truth로 두며 실패하면 text를 표시한다.

## 영상 매칭 `visual-match-v1`

입력: allowlisted `task_code`; 출력: `visual_asset_id` 또는 `null`. asset은 `provenance: AI_GENERATED_PREGENERATED`, `review_status: APPROVED`, `safety_level: LOW`일 때만 매칭·게시한다. HIGH는 생성·기록 가능하지만 게시 금지. P0 영상은 기계 정지 수작업뿐이며 운전·회전날·농약·고소작업을 포함하지 않는다.

## FE/BE/AI 인계

FE는 계약 schema와 60초 timeout, owner source/review badge, worker의 `출처 보기`, ambiguity/safety badge를 표시한다. BE는 server-side schema·allowlist·safety gate·expected version을 재검증하고 transcript를 worker 응답에서 제거한다. AI는 계약 version·input/output ID·provider/model metadata를 평가 log에 넘긴다.

## current two-crop contract

[structure-v2.schema.json](schemas/structure-v2.schema.json)가 current two-crop write contract다. 신규 AI draft와 publish는 `structure-v2`/`ontology-v2`의 8개 current code만 쓰고 non-null code를 `task_family`와 일치시킨다. structure와 supplement prompt는 retired `ONION_COLLECT`, `BAGGING`, `LOADING`, `WAREHOUSE_TRANSPORT`, `STACKING` 및 allowlist 밖 code를 새 output에서 금지한다. `structure-v1` WorkDraft와 immutable WorkVersion은 query-only legacy read path에서 stored code를 remap하지 않고 보존하며 legacy quantity preview/confirm은 `LEGACY_READ_ONLY`다. current publish와 quantity regeneration은 완성된 `worker-briefing-v2` `vi`·`ne` package를 정확히 둘 다 생성한다. worker response에는 계속 transcript, raw audio, risk assessment, token hash, owner audit field를 넣지 않는다.

Node private JSONL bridge operation은 `TRANSCRIBE_AUDIO`, `BUILD_OWNER_DRAFT_V2`, `MERGE_SUPPLEMENT_V2`, `PARSE_QUANTITY_CHANGE`, `BUILD_WORKER_PACKAGES_V2`다. `TRANSCRIBE_AUDIO` payload는 identity-free `audio_base64`, optional `filename`, `content_type`, `language_hint`만 받고 decoded 10 MiB와 audio MIME allowlist를 검사한다. `PARSE_QUANTITY_CHANGE`는 transcript와 trusted `expected_version`만 받고, 명확한 `열두 망으로 맞춰`를 `READY`, `{value:12, unit:"망"}`, 빈 ambiguities로 해석한다. 응답은 `{transcript, language_code, confidence, schema_version, contract_version}`이며 raw audio와 transcript는 log나 worker DTO에 넣지 않는다.
