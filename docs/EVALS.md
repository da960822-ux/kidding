# AI·제품 평가

## 고정 평가 세트

P0 release gate는 서로 섞지 않는 두 tier다.

- **Transcript tier:** 비식별 양파·딸기 지시 JSONL 33건(`dataset_version` 필수). 두 작물의 정상 사투리/장소·대상, 한국어 수량 표현(`스무 망`, `이십 망`, `20망`), 수량 변경 5건, 모호 지시 5건 이상을 포함하고 각 8개 task_code를 최소 한 번씩 다룬다. production/수집 원음은 저장하지 않고 transcript와 gold 구조만 보관한다.
- **STT smoke tier:** `evals/audio/manifest.jsonl`과 PII 없는 합성 한국어 WAV 3건. 33건 구조화 지표의 분모에 넣지 않으며 STT 입력 경로만 확인한다.

합성 fixture는 Windows `Microsoft Heami` `ko-KR` TTS로 생성한다. `synthetic:true`, voice/provider metadata, 원문 SHA-256, WAV duration과 expected case를 manifest에 기록한다. 이 fixture는 사람 녹음이 아니다.

## 지표

| 지표 | 계산 | P0 기준 |
|---|---|---:|
| Schema validity | retry 포함 valid contract output / 30 | 100% |
| Step accuracy | gold 단계와 sequence/task 의미 일치 건 / 30 | ≥90% |
| task_code accuracy | gold task_code와 일치한 단계 / 전체 단계, family 일치 포함 | ≥90%; family mismatch 0건 |
| Ambiguity preservation | 모호 입력의 unknown 보존 및 `AMBIGUOUS` 판정 | 추측 0건 |
| Ambiguity override safety | non-blocking만 reason과 audit을 남겨 전달 | 누락 0건; safety override 0건 |
| Input-grounded safety | 원문에 명시된 안전문구만 구조화 | invented safety 0건 |
| Official-guide HIT | 검수된 HIT에서 `OFFICIAL_GUIDE` 선택 건 / HIT 건 | 100% |
| Quantity change | 5개 변경에서 expected before/after 일치 | 5/5 |
| Translation provenance | 각 언어별 공식 번역이 검수된 source snapshot과 일치 | 100% |
| STT smoke | 합성 WAV 3건의 file/header/duration/STT expected case PASS; `stt-smoke-001`의 `창고 앞 밭` 보존 | 3/3 |
| Contract negative cases | auth/exact Origin, 409, 422, HIGH/UNKNOWN, empty steps, 24h/reissue, transcript non-disclosure, public web readiness, `/w/{token}` assignment, explicit mock opt-in fixtures | 100% PASS |
| Mobile E2E | `CO_PRESENT` owner briefing과 `REMOTE` 익명 링크 두 branch의 휴대폰 2대 흐름 성공 회수 | 각 3회 연속 |

추가 관찰: translation meaning preservation, video match accuracy, TTS success, latency P50/P95, token usage. 추가 지표는 gate를 낮추지 않는다.

## 비교 실험

- Baseline: STT 후 바로 번역.
- Pipeline: STT→사투리 정규화→구조화→guide lookup→공식 우선/fallback 번역.
- Prompt: 새 publish는 current two-crop `structure-v2`/`ontology-v2`를 지키는 prompt를 평가한다. retired code가 든 stored-version fixture는 legacy read preservation regression만 맡으며 새 publish candidate가 아니다.
- Provider/model은 환경변수 후보로만 기록한다. 제품 계약이나 API schema에 provider 이름을 넣지 않는다.

각 결과에 `experiment_id`, dataset/prompt contract version, provider/model metadata, raw metric CSV, 실패 input ID를 기록한다. evaluation run은 `dataset_version`, prompt contract version, audio manifest SHA-256와 `metrics.csv`, `failures.jsonl`, `stt-smoke-results.jsonl`을 함께 남긴다. 결과 없는 실험은 `미실행`으로 남긴다.

## 안전·출시 차단

schema validity, step/task_code, ambiguity preservation, input-grounded safety, official HIT, translation provenance, quantity, STT smoke, mobile E2E, contract negative cases 중 하나라도 기준 미달이면 P0 release를 차단한다. [Safety Policy](SAFETY_POLICY.md)의 HIGH/UNKNOWN risk, HIGH asset, 검수되지 않은 안전 번역, invented government source, anonymous remote transcript 노출도 즉시 차단 사유다. 실패 시 FE/BE/AI 중 해당 주담당이 재현·재검증한다.

current contract negative set은 retired task code new write, family mismatch, legacy-code quantity confirm, worker response의 transcript/risk-assessment/token-hash 비노출, production `PUBLIC_WEB_BASE_URL` 누락, browser `/w/{token}` assignment와 명시적 mock opt-in을 모두 검증해야 한다.

## 역할

AI가 prompt·구조화/번역·guide/asset 검수와 두 evaluation tier 데이터를, BE가 schema·safety·version·anonymous link·release gate를, FE가 두 delivery branch의 실기기 화면·fallback·E2E 증거를 맡는다. 각 항목의 primary owner는 FE/BE/AI 중 하나다.
