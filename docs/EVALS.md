# AI·제품 평가

## 고정 평가 세트

P0 release gate는 서로 섞지 않는 두 tier다. 현재 신규 publish 계약은 `structure-v2`/`ontology-v2`의 양파·딸기 8개 code다. 아래 `structure-v1` fixture와 그 결과는 legacy read 보존 및 과거 prompt 회귀 기록으로만 유지하며, current two-crop publish의 release 근거로 사용하지 않는다.

- **legacy transcript tier:** `ai/evals/transcript-v1.jsonl`의 비식별 양파 지시 30건과 `ai/evals/transcript-jeolla-v1.jsonl`의 전라도 지역어 합성 30건. 표준어·사투리 회귀 및 legacy read 보존을 확인하며 current two-crop publish의 release 근거로 사용하지 않는다.
- **current publish transcript tier:** `structure-v2`/`ontology-v2`의 비식별 양파·딸기 지시 30건. 두 작물, 8개 task_code, 수량 변경 5건, 모호 지시 5건 이상을 포함해야 하며 `task_family`/code 불일치는 0건이어야 한다.
- **STT smoke tier:** `evals/audio/manifest.jsonl`과 PII 없는 합성 한국어 WAV 3건. provider/model은 run metadata로만 기록한다. 30건 구조화 지표의 분모에 넣지 않으며 STT 입력 경로만 확인한다.

합성 fixture는 Windows `Microsoft Heami` `ko-KR` TTS로 생성한다. `synthetic:true`, voice/provider metadata, 원문 SHA-256, WAV duration과 expected case를 manifest에 기록한다. 이 fixture는 사람 녹음이 아니다.

## AI artifact fixture 계약

두 transcript tier는 같은 row 계약을 사용한다. `kind`에 따라 `gold_structure` 또는 `gold_quantity` 하나만 둔다.

```text
id,dataset_version,kind,transcript,gold_structure|gold_quantity
```

`ai/evals/transcript-jeolla-v1.provenance.json`은 지역어 표지별 국립국어원 출처, 보고서 인쇄쪽과 PDF쪽, 표준어 의미와 데이터셋 적용 규칙, case별 실제 사용 표지, `synthetic:true`, 원어민 `review_status`를 기록한다. 모든 case ID가 provenance에 있어야 하며 `review_status: PENDING`인 동안 결과는 실험용이다. 지역·세대별 변이가 있으므로 이 합성 tier를 전라도 전체 화자의 대표 표본으로 간주하지 않는다.

TTS smoke 결과 파일은 `ai/manifests/tts-smoke-v1.jsonl`이다. 각 JSONL row는 다음 field를 가진다. `model`과 `voice`는 실행 평가 metadata이며 public API 계약이 아니다. `contract_version`은 `tts-v1`이다.

```text
id,language_code,text,text_sha256,model,voice,response_format,status,audio_sha256,recorded_at,contract_version
```

## 지표

AI runtime 회귀 테스트는 live provider 평가와 분리한다. injected fake provider로 owner STT→structure, supplement 재해석, quantity preview, `vi|ne` on-demand translation, guide HIT/MISS, safety block, visual eligibility, TTS text fallback, 잘못된 language 거부를 검증한다. 같은 work/language 입력은 동일 cache key를 내야 하며 FE가 provider를 직접 호출하는 경로는 없다.

| 지표 | 계산 | P0 기준 |
|---|---|---:|
| Schema validity | retry 포함 valid contract output / 30 | 100% |
| Semantic case accuracy | interpretation·location·quantity·step code/order·ambiguity·safety가 gold와 일치한 건 / 30 | ≥90% |
| Step accuracy | gold 단계와 sequence/task 의미 일치 건 / 30 | ≥90% |
| task_code accuracy | gold task_code와 일치한 단계 / 전체 단계 | ≥90% |
| Ambiguity preservation | 모호 입력의 unknown 보존 및 `AMBIGUOUS` 판정 | 추측 0건 |
| Ambiguity override safety | non-blocking만 reason과 audit을 남겨 전달 | 누락 0건; safety override 0건 |
| Input-grounded safety | 원문에 명시된 안전문구만 구조화 | invented safety 0건 |
| Official-guide HIT | 검수된 HIT에서 `OFFICIAL_GUIDE` 선택 건 / HIT 건 | 100% |
| Quantity change | 5개 변경에서 expected before/after 일치 | 5/5 |
| Translation provenance | 각 언어별 공식 번역이 검수된 source snapshot과 일치 | 100% |
| STT smoke | 합성 WAV 3건의 file/header/duration/STT expected case PASS | 3/3 |
| Contract negative cases | auth, 409, 422, HIGH/UNKNOWN, empty steps, 24h/reissue, transcript non-disclosure fixtures | 100% PASS |
| Mobile E2E | `CO_PRESENT` owner briefing과 `REMOTE` 익명 링크 두 branch의 휴대폰 2대 흐름 성공 회수 | 각 3회 연속 |

추가 관찰: translation meaning preservation, video match accuracy, TTS success, latency P50/P95, token usage. TTS smoke의 provider/model/voice는 run metadata로 기록한다. 추가 지표는 gate를 낮추지 않는다.

`exact_match_rate`는 summary/title/description/ambiguity message 문구까지 같은지 보는 디버깅 관찰값이다. 문구만 다른 exact mismatch는 `exact-mismatches.jsonl`에 기록하되 `failure_count`와 프로세스 실패에 포함하지 않는다. `failure_count`는 provider·response·JSON·schema 실패와 의미 필드 불일치만 센다.

## 비교 실험

- Baseline: STT 후 바로 번역.
- Pipeline: STT→사투리 정규화→구조화→guide lookup→공식 우선/fallback 번역.
- Prompt: `prompt-structure-001`부터 `prompt-structure-004`와 `prompt-quantity-change-001`부터 `prompt-quantity-change-002`는 legacy `structure-v1` 회귀 기록이다. 신규 publish 후보는 `structure-v2`/`ontology-v2`를 출력하고, retired code를 만들지 않는 prompt만 평가한다.
- `prompt-structure-003`은 작업 분해 보수성 회귀를 검증한다. `모아 놔`/`모아둬`/`한데 놔`/`캐서 놔`의 `놓다·두다`는 앞선 작업의 결과 상태이며, 명시적 `쌓아`/`층층이 쌓아`가 없으면 `STACKING`을 추가하지 않는다. release 판단은 `semantic_match_rate`를 우선하며 0.90(27/30) 이상이어야 한다. `exact_match_rate`는 문구 차이를 포함한 관찰값이다.
- `prompt-structure-004`는 명시된 `notes` qualifier 보존, `망`과 `자루에` 분리, `몇 망` blocking ambiguity를 회귀한다. `prompt-quantity-change-002`는 `열두 망으로 맞춰`처럼 하나의 목표 수량만 말한 변경을 `READY`로 회귀한다. 두 prompt 모두 같은 JSON schema와 semantic comparator를 사용한다.
- Provider/model은 환경변수 후보로만 기록한다. 제품 계약이나 API schema에 provider 이름을 넣지 않는다.

각 결과에 `experiment_id`, dataset/prompt contract version, provider/model metadata, raw metric CSV, 실패 input ID를 기록한다. evaluation run은 실제 입력의 `dataset_version`, prompt contract version, audio manifest SHA-256와 `metrics.json`, `failures.jsonl`, `stt-smoke-results.jsonl`을 함께 남긴다. 결과 없는 실험은 `미실행`으로 남긴다.

## 안전·출시 차단

schema validity, step/task_code/family match, ambiguity preservation, input-grounded safety, official HIT, translation provenance, quantity, STT smoke, mobile E2E, contract negative cases 중 하나라도 기준 미달이면 P0 release를 차단한다. v1 fixture를 새 code로 remap하지 않는 legacy read, two-language briefing package 재생성, team member 복수 assignment의 latest-version resolve도 current contract negative gate다. [Safety Policy](SAFETY_POLICY.md)의 HIGH/UNKNOWN risk, HIGH asset, 검수되지 않은 안전 번역, invented government source, anonymous remote transcript 노출도 즉시 차단 사유다. 실패 시 FE/BE/AI 중 해당 주담당이 재현·재검증한다.

## 역할

AI가 prompt·구조화/번역·guide/asset 검수와 두 evaluation tier 데이터를, BE가 schema·safety·version·anonymous link·release gate를, FE가 두 delivery branch의 실기기 화면·fallback·E2E 증거를 맡는다. 각 항목의 primary owner는 FE/BE/AI 중 하나다.
