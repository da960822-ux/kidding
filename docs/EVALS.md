# AI·제품 평가

## 고정 평가 세트

P0 release gate는 서로 섞지 않는 두 tier다.

- **Transcript tier:** 비식별 양파·딸기 지시 JSONL 33건(`dataset_version` 필수). 두 작물의 정상 사투리/장소·대상, 한국어 수량 표현(`스무 망`, `이십 망`, `20망`), 수량 변경 5건, 모호 지시 5건 이상을 포함하고 각 8개 task_code를 최소 한 번씩 다룬다. production/수집 원음은 저장하지 않고 transcript와 gold 구조만 보관한다.
- **STT smoke tier:** `evals/audio/manifest.jsonl`과 PII 없는 합성 한국어 WAV 3건. 33건 구조화 지표의 분모에 넣지 않으며 STT 입력 경로만 확인한다.

합성 fixture는 Windows `Microsoft Heami` `ko-KR` TTS로 생성한다. `synthetic:true`, voice/provider metadata, 원문 SHA-256, WAV duration과 expected case를 manifest에 기록한다. 이 fixture는 사람 녹음이 아니다.

## 지표

| 지표 | 계산 | P0 기준 |
|---|---|---:|
| Schema validity | retry 포함 valid contract output / 33 | 100% |
| Step accuracy | gold 단계와 sequence/task 의미 일치 건 / 33 | ≥90% |
| task_code accuracy | gold task_code와 일치한 단계 / 전체 단계, family 일치 포함 | ≥90%; family mismatch 0건 |
| Ambiguity preservation | 모호 입력의 unknown 보존 및 `AMBIGUOUS` 판정 | 추측 0건 |
| Ambiguity override safety | non-blocking만 reason과 audit을 남겨 전달 | 누락 0건; safety override 0건 |
| Input-grounded safety | 원문에 명시된 안전문구만 구조화 | invented safety 0건 |
| Official-guide HIT | 검수된 HIT에서 `OFFICIAL_GUIDE` 선택 건 / HIT 건 | 100% |
| Quantity change | 5개 변경에서 expected before/after 일치 | 5/5 |
| Translation provenance | 각 언어별 공식 번역이 검수된 source snapshot과 일치 | 100% |
| STT smoke | 합성 WAV 3건의 file/header/duration/STT expected case PASS; `stt-smoke-001`의 `창고 앞 밭` 보존 | 3/3 |
| Contract negative cases | farm code+PIN auth/exact Origin, farm 격리, session expiry/logout, 409, 422, HIGH/UNKNOWN, empty steps, WorkerLink 24h/reissue, transcript non-disclosure, public web readiness, `/w/{token}` assignment, explicit mock opt-in fixtures | 100% PASS |
| Deployment cookie | Vercel preview browser login and team join each retain its `HttpOnly` cookie on a following same-origin `/api` request; API upstream never appears in browser URL | 100% PASS |
| Today team QR | 같은 farm/work_date의 POST 재호출·GET 복원이 같은 URL이고 명시적 재발급만 URL을 변경; 이전 URL 즉시 거부 | 100% PASS |
| Worker package locale/provenance | `vi`·`ne` 각각 location/quantity/deadline/notes/safety/caption locale purity, safety verified provenance, 모든 source step 수·순서 보존 | 100% PASS |
| Worker disclosure/TTS | worker DTO에 transcript/risk/identity/token/cache key 없음, `tts.text_hash` UI 비표시; TTS가 safety와 모든 step을 source order로 포함 | 100% PASS |
| Mobile E2E | `CO_PRESENT` owner briefing과 `REMOTE` 익명 링크 두 branch의 휴대폰 2대 흐름 성공 회수 | 각 3회 연속 |

추가 관찰: translation meaning preservation, video match accuracy, TTS success, latency P50/P95, token usage. 추가 지표는 gate를 낮추지 않는다.

## 비교 실험

전체 제품 흐름의 운영 통합 검증은 [2026-09-04 full workflow E2E](../evals/results/2026-09-04-full-workflow-e2e.md)에 기록한다. 실제 녹음 업로드·STT·게시 전 수정·vi/ne 영상/TTS·QR 해독·개별 배정·확인·수량 새 버전·모든 전달 화면 갱신을 검증했다. 농장주 current/home/team의 오래된 표시를 수정했으며, 합성 음성 기반 자동 검증과 실기기·사람 검수의 한계를 구분한다.

최신 실행 결과는 [2026-09-04 작업 재개 감사·최종 평가](../evals/results/2026-09-04-dialect-resume-review.md)에 기록한다. 최종 텍스트 통과와 별개로 합성 STT 실패가 남아 있으므로 음성 품질 release gate는 미통과다.

사전 효과는 같은 prompt·모델·dataset에서 참고 문맥만 켜고 끈 반복 실행으로 분리한다. 비교에 사용한 파일 hash를 호출 전에 고정하고, 새 전라도 표현의 사전 미포함 여부를 기록한다. 원문 위치·단계 순서·수량/단위·필수 질문·불필요한 blocking을 검사한다. `9번 밭`과 `아홉 번 밭`처럼 동일 의미인 허용 표기는 gold에 명시하고 기존 결과 파일은 수정하지 않는다. STT 실패는 인식 실패와 안전한 재녹음 요구를 나누어 기록한다.

사투리 참고 JSON 도입 전후는 동일한 고정 입력·모델로 비교한다. 기존 실패 원시 결과는 덮어쓰지 않는다. 사전에 넣지 않은 새 표현, 명시적으로 미정인 수량, 번호가 있는 장소, 단위·동사 경계, 복합 작업 순서, 영상 없는 운반을 평가한다. STT와 구조화 결과를 따로 기록하고, 합성 음성 결과를 실제 사람 발음 정확도로 보고하지 않는다. 일부 필드만 통과한 사례는 전체 의미 성공으로 집계하지 않는다.

- Baseline: STT 후 바로 번역.
- Pipeline: STT→사투리 정규화→구조화→guide lookup→공식 우선/fallback 번역.
- Prompt: 새 publish는 current two-crop `structure-v2`/`ontology-v2`를 지키는 prompt를 평가한다. retired code가 든 stored-version fixture는 legacy read preservation regression만 맡으며 새 publish candidate가 아니다.
- Provider/model은 환경변수 후보로만 기록한다. 제품 계약이나 API schema에 provider 이름을 넣지 않는다.

각 결과에 `experiment_id`, dataset/prompt contract version, provider/model metadata, raw metric CSV, 실패 input ID를 기록한다. evaluation run은 `dataset_version`, prompt contract version, audio manifest SHA-256와 `metrics.csv`, `failures.jsonl`, `stt-smoke-results.jsonl`을 함께 남긴다. 결과 없는 실험은 `미실행`으로 남긴다.

## 안전·출시 차단

schema validity, step/task_code, ambiguity preservation, input-grounded safety, official HIT, translation provenance, quantity, STT smoke, mobile E2E, contract negative cases 중 하나라도 기준 미달이면 P0 release를 차단한다. [Safety Policy](SAFETY_POLICY.md)의 HIGH/UNKNOWN risk, HIGH asset, 검수되지 않은 안전 번역, invented government source, anonymous remote transcript 노출도 즉시 차단 사유다. 실패 시 FE/BE/AI 중 해당 주담당이 재현·재검증한다.

current contract negative set은 서로 다른 두 농장 코드의 데이터 격리, 잘못된 PIN, owner session 만료·로그아웃·복귀, 같은 농장/날짜의 QR 안정성, 명시적 QR 재발급과 이전 URL 폐기, retired task code new write, family mismatch, legacy-code quantity confirm, worker response의 transcript/risk-assessment/identity/token/cache key 비노출과 TTS hash UI 비표시, locale leakage, unverified safety provenance, TTS safety/step omission, production `PUBLIC_WEB_BASE_URL` 누락, Vercel same-origin `/api` rewrite에서 owner·TeamMember cookie 유지, browser URL의 upstream 비노출, browser `/w/{token}` assignment와 명시적 mock opt-in을 모두 검증해야 한다. `backend/live_e2e.py`의 수동 Cookie header 재전송은 이 browser 검증을 대신할 수 없다.

## 역할

AI가 prompt·구조화/번역·guide/asset 검수와 두 evaluation tier 데이터를, BE가 schema·safety·version·anonymous link·release gate를, FE가 두 delivery branch의 실기기 화면·fallback·E2E 증거를 맡는다. 각 항목의 primary owner는 FE/BE/AI 중 하나다.
