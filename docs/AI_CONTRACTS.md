# AI 계약

모든 계약은 provider-neutral이다. 실제 provider/model은 서버 전용 환경변수로 고르고, 로그의 metadata로만 기록한다. 계약 version은 `stt-v1`, `structure-v1`, `quantity-change-v1`, `translation-v1`, `safety-policy-v1`, `tts-v1`처럼 고정한다.

## 공통 규칙

- JSON schema validation 실패는 저장·게시하지 않는다.
- AI는 안전 위험을 추측해 추가하지 않는다.
- 입력·출력에 secret, raw audio를 넣지 않는다.
- transcript는 신뢰할 수 없는 owner 입력이다. 명시적 delimiter로 감싸고 prompt injection을 지시로 실행하지 않으며 tool execution을 제공하지 않는다.
- contract output은 `schema_version`과 `contract_version`을 함께 가진다. provider/model은 env와 metadata에만 둔다.
- pipeline은 P0 sync REST다. upload/STT→structure→guide lookup/translation→video match 후 draft를 반환한다. FE는 최대 60초 loading/timeout UX를 제공한다. queue는 P1.

## STT `stt-v1`

입력: 임시 `audio` multipart, optional `language_hint=ko`. WorkDraft 보완도 같은 audio-only multipart와 `expected_draft_revision`을 쓰며, text supplement는 없다. 출력:

```json
{
  "transcript": "저짝 양파 스무 망 캐서 손질하고 분류한 다음 집하장까지 손수 옮겨",
  "language_code": "ko",
  "confidence": 0.0,
  "schema_version": "1",
  "contract_version": "stt-v1"
}
```

`confidence`가 낮거나 transcript가 비면 재녹음. raw audio는 요청 완료 즉시 삭제, transcript만 version 감사에 남긴다.

## 구조화 `structure-v1`

입력: transcript와 양파·딸기 ontology. 출력 최소:

```json
{
  "interpretation": "AMBIGUOUS",
  "summary_ko": "농장주가 가리킨 곳의 양파 20망을 수확하고 손질·분류한 뒤 집하장까지 손수 옮깁니다.",
  "location": {"raw_text": "저짝", "kind": "DEICTIC", "canonical_name": null},
  "task_family": "ONION",
  "quantity": {"value": 20, "unit": "망"},
  "deadline": null,
  "safety": [],
  "notes": null,
  "steps": [
    {"sequence": 1, "task_code": "ONION_HARVEST", "title_ko": "양파 수확", "description_ko": "양파를 수확한다", "unsupported_reason": null},
    {"sequence": 2, "task_code": "ONION_TRIMMING", "title_ko": "양파 손질", "description_ko": "양파의 마른 줄기와 뿌리를 손질한다", "unsupported_reason": null},
    {"sequence": 3, "task_code": "ONION_SORTING", "title_ko": "양파 분류", "description_ko": "상한 양파를 골라 분류한다", "unsupported_reason": null},
    {"sequence": 4, "task_code": "ONION_TRANSPORT", "title_ko": "양파 운반", "description_ko": "분류한 양파를 집하장까지 손수 옮긴다", "unsupported_reason": null}
  ],
  "ambiguities": [
    {"field": "location", "message": "'저짝'은 현장에서 농장주가 가리킨 위치 확인이 필요합니다.", "blocking": false, "kind": "LOCATION"}
  ],
  "schema_version": "1",
  "contract_version": "structure-v1"
}
```

`interpretation`은 `READY`, `AMBIGUOUS`, `UNSUPPORTED` 중 하나다. `ambiguities[]` 원소는 `field`, `message`, `blocking`, `kind`(`SAFETY|TASK|LOCATION|QUANTITY|TIME|OTHER`)를 가진다. AI는 추측하지 않고 unknown을 `UNSPECIFIED` 또는 `null`로 둔다. 실행할 단계가 없으면 blocking; 대상·장소가 불명확하면 ambiguity; 수량은 언급됐지만 값 또는 단위가 모호할 때만 질문한다. `deadline`/`notes`는 선택이므로 질문하지 않는다. 질문은 한 번에 하나, 답변은 기존 draft에 merge한다. non-blocking ambiguity는 owner가 `PUBLISH_AS_IS` 또는 `SUPPLEMENT`를 선택할 수 있다. unsupported non-safety task는 `task_code:null`/`UNSUPPORTED` marker와 video null로 남겨 text+TTS fallback을 허용한다. safety ambiguity는 강제 gate다.

P0 task_code는 양파 `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`와 딸기 `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, `STRAWBERRY_PACKING`이다. output의 `task_family`와 non-null `task_code` 접두사가 일치하지 않으면 invalid다. 구 코드를 새 코드로 조용히 매핑하지 않는다. unsupported non-safety task는 `task_code:null`과 `unsupported_reason`으로 반환한다. owner override 뒤 BE가 `delivery_mode: TEXT_TTS|TEXT`로 보존한다. 안전·HIGH·schema invalid·no executable step은 override할 수 없다. safety는 입력에 명시된 것만 보존한다.

LLM은 영상·TTS URL이나 `delivery_mode`를 만들지 않는다. AI는 구조화 JSON만 반환하고 BE가 검수 manifest와 TTS 결과를 결합해 `openapi.yaml`의 DraftState/PublishedWorkState를 만든다.

## 수량 변경 `quantity-change-v1`

입력은 owner cookie로 받은 audio와 `expected_version`이다. sync REST parse는 저장하지 않고 다음만 반환한다.

```json
{"interpretation":"READY","quantity":{"value":15,"unit":"망"},"expected_version":1,"ambiguities":[],"schema_version":"1","contract_version":"quantity-change-v1"}
```

불명확하면 `interpretation: AMBIGUOUS`, `quantity:null`, 한 개의 `ambiguities[]`를 반환한다. preview는 저장하지 않으며, owner가 확인한 READY 값과 `expected_version`만 BE direct-confirm API에 보낸다. 확정된 WorkVersion이 유일한 변경 감사 기록이다.

## 번역 `translation-v1`

각 step의 action/quantity/order/location/safety를 별도 segment로 만든다. action phrase는 검수된 `GuidePhrase` HIT를 우선하고, quantity/order는 BE deterministic template을 사용한다. safety는 VERIFIED OFFICIAL만 사용하며, missing general phrase만 `AI_TRANSLATION` fallback이다. 전체 문장을 하나의 official source로 표시하지 않는다. 실제 검수된 HIT row는 아직 data collection gate이므로 가짜 URL·페이지를 예시에 넣지 않는다. 일반표현 MISS 예시는 다음과 같다.

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

- [structure-v1.schema.json](schemas/structure-v1.schema.json)
- [quantity-change-v1.schema.json](schemas/quantity-change-v1.schema.json)
- [translation-v1.schema.json](schemas/translation-v1.schema.json)

빈 `steps[]`는 executable step이 없는 blocking draft다. `READY`에는 하나 이상의 step이 필요하다.

## 안전 판정 `safety-policy-v1`

AI가 위험을 낮추거나 안전 문구를 만들어 내지 않는다. BE는 validated structure, segment provenance, 선택된 visual asset의 판정을 합친다. 하나라도 HIGH면 HIGH, HIGH 없이 하나라도 UNKNOWN이면 UNKNOWN, 모두 LOW일 때만 LOW다. 게시 행렬은 [SAFETY_POLICY](SAFETY_POLICY.md)가 권위다. `risk_assessment`는 owner draft와 version audit에만 포함하며 worker response에는 포함하지 않는다.

## TTS `tts-v1`

입력: 게시된 step text, `language_code`(`ko|vi|ne`), voice settings. 출력: 재생 가능한 `audio_url` 또는 실패 상태. publish 시 text content hash로 생성·cache하며 text를 source of truth로 둔다. 실패하면 text를 표시한다.

## 영상 매칭 `visual-match-v1`

입력: allowlisted `task_code`; 출력: `visual_asset_id` 또는 `null`. 새 8개 asset은 생성 직후 `provenance: AI_GENERATED_PREGENERATED`, `review_status: PENDING`으로 기록한다. 사람 검수로 `APPROVED`되고 `safety_level: LOW`인 경우에만 매칭·게시한다. HIGH는 생성·기록 가능하지만 게시 금지. `ONION_TRANSPORT`도 차량·동력 장비를 운전하거나 이동시키는 장면이면 HIGH다.

## FE/BE/AI 인계

FE는 계약 schema와 60초 timeout, owner source/review badge, worker의 `출처 보기`, ambiguity/safety badge를 표시한다. BE는 server-side schema·allowlist·safety gate·expected version을 재검증하고 transcript를 worker 응답에서 제거한다. AI는 계약 version·input/output ID·provider/model metadata를 평가 log에 넘긴다.
