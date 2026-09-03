# 실험 로그

## 기록 규칙

각 실험은 `experiment_id`, 날짜, 입력 데이터셋 버전, prompt 계약 버전, provider/model 환경값, 결과, 실패 사례, 결정으로 기록한다. provider/model은 교체 가능한 실험 메타데이터이며 제품 계약에 포함하지 않는다.

`structure-v1`/기존 양파 6-code 결과는 legacy read와 과거 prompt 회귀 기록이다. 현재 신규 publish의 실험은 `structure-v2`/`ontology-v2`, 양파·딸기 8개 code, family/code 일치를 기록해야 하며 v1 결과를 합산하거나 release 근거로 전용하지 않는다.

## E-001 구조화 경로 비교

- 가설: STT 후 사투리 정규화·구조화를 거치면 STT 직후 번역보다 단계와 수량 보존이 높다.
- 비교: `STT→translation` baseline vs `STT→normalize→structure→guide lookup→translation` pipeline.
- 데이터: legacy 비교는 일반 구어체 `transcript-v1`과 전라도 지역어 합성 `transcript-jeolla-v1`을 보존한다. current publish 비교는 양파·딸기 8개 code를 포함한 별도 `structure-v2` dataset version을 사용한다. 실제 화자 데이터는 수집·검수 후 별도 dataset version을 기록한다.
- 측정: parse success, field exact match, `task_code` accuracy, quantity accuracy, ambiguity preservation, latency P50/P95.
- 합격 게이트: quantity accuracy 100%, 모호 입력 임의 확정 0건. 나머지 수치는 실행 결과로 채우고 수집 전 수치를 만들지 않는다.
- 주담당: AI. 인계: `docs/EVALS.md` 결과표와 실패 입력 ID.

## E-002 공식 표현 우선 비교

- 가설: 검수된 정부 가이드 HIT 우선이 자유번역보다 공식 표현 일치율과 안전 추적성을 높인다.
- 비교: 자유 AI 번역 vs `guide_phrases`/`guide_translations` HIT 우선 + 일반 표현 AI fallback.
- 측정: official hit precision, 언어별 번역 source snapshot completeness, work-term meaning preservation, safety gate violations.
- 규칙: 각 언어별 번역 row에 `source_url`, `source_page`, `license`, 사람 검수 `verified`가 없으면 공식으로 세지 않는다. URL/페이지/번역은 데이터 수집 gate 후 기록한다.
- 주담당: AI. 인계: 검수 manifest와 `docs/DATA_MODEL.md` import 상태.

## E-003 prompt 버전 비교

- legacy 후보: `prompt-structure-001`부터 `prompt-structure-004`, `prompt-quantity-change-001`부터 `prompt-quantity-change-002`는 `structure-v1` 결과 비교용으로 보존한다.
- current 후보: 신규 publish는 `structure-v2`/`ontology-v2`와 family/code 일치를 출력하는 prompt를 동일 rubric으로 비교한다. retired code가 있는 v1 fixture는 legacy preservation regression만 맡는다.
- 실행 모델: Luna baseline 실패 후 현재 비교 모델은 OpenAI Responses API의 `OPENAI_MODEL=gpt-5.6-terra`다. 이는 실험 metadata이며 제품 계약이나 API schema의 provider invariant가 아니다.
- 비교 순서: `gpt-5.6-terra`를 Luna와 동일한 P0 release gate로 평가하고, Terra도 기준 미달일 때만 같은 조건에서 `gpt-5.6-sol`을 비교한다.
- 고정: 동일 dataset, prompt version, decoding 설정, provider/model 환경값, 평가자 rubric. 일반 구어체와 전라도 지역어 결과는 합산하지 않는다.
- 측정: valid JSON rate, field exact match, task_code accuracy, ambiguity preservation, token usage, latency.
- 결정: 승자는 정확도·안전 gate를 모두 통과하고 비용/지연이 허용되는 버전. 결과 전에는 release 모델을 선언하지 않는다.
- 주담당: AI. 인계: prompt 파일 버전과 결과 CSV.

### E-003-R1 Luna baseline 결과 (2026-09-03)

- 조건: `transcript-v1` 30건, `prompt-structure-001`, `prompt-quantity-change-001`, `OPENAI_MODEL=gpt-5.6-luna`.
- 결과: JSON parse 30/30, canonical schema valid 23/30(76.67%), whole-object exact match 5/30(16.67%).
- 실패 분석: schema invalid 7건은 모두 DEICTIC location의 `AMBIGUOUS`/non-blocking `LOCATION` 규칙 누락이다. exact mismatch 18건은 모두 interpretation·step sequence/task_code·safety가 일치했으며 주로 summary/title/description 문구 차이다. 별도 의미 차이는 unit 확장 2건, location 축약 2건, 불필요 ambiguity 일부다.
- 결정: Luna baseline은 schema validity 100% gate를 통과하지 못했다. 이 결과는 일반 구어체 baseline이며 전라도 지역어 성능을 증명하지 않는다. gold와 충돌하던 위치 예시를 바로잡은 `prompt-structure-002`로 고정한다. `transcript-jeolla-v1`에서 Luna를 먼저 실행한 뒤 gate 미달일 때 같은 조건으로 `gpt-5.6-terra`, 필요하면 `gpt-5.6-sol`을 비교한다. whole-object exact match는 관찰값이며 task_code/quantity/ambiguity gate를 대신하지 않는다.

### E-003-R2 전라도 지역어 합성 tier (미실행)

- 조건: `transcript-jeolla-v1` 30건, `prompt-structure-002`, `prompt-quantity-change-001`, `OPENAI_MODEL=gpt-5.6-terra`.
- 데이터 성격: 국립국어원 지역어 자료를 근거로 만든 합성 회귀셋. 실제 전라도 화자 녹음·전사가 아니며 원어민 검수 상태는 `PENDING`이다.
- 실행 순서: `gpt-5.6-terra`, gate 미달 시 `gpt-5.6-sol`.
- 결과: 미실행.

### E-003-R3 작업 분해 보수성 회귀 (미실행)

- 조건: `transcript-v1` 30건, `prompt-structure-003`, `prompt-quantity-change-001`, `OPENAI_MODEL=gpt-5.6-terra`.
- 가설: `모아 놔`/`모아둬`/`한데 놔`/`캐서 놔`에서 결과 상태를 `STACKING` step으로 과잉 생성하지 않는다. 명시적 `쌓아`는 계속 `STACKING`으로 보존한다.
- 평가 우선순위: `semantic_match_rate`가 0.90(27/30) 이상이어야 한다. `exact_match_rate`는 summary/title/description 문구 차이를 포함한 관찰값이다.
- 결과: 미실행.

### E-003-R4 전라도 지역어 prompt-003 결과 (2026-09-03)

- 조건: `transcript-jeolla-v1` 30건, `prompt-structure-003`, `prompt-quantity-change-001`, `OPENAI_MODEL=gpt-5.6-terra`.
- 결과: JSON parse 30/30, schema valid 30/30, semantic 18/30(60.00%), exact 4/30(13.33%), semantic failure 12건, exact mismatch 26건. 원어민 검수는 `PENDING`이므로 이 synthetic 결과만으로 출시 근거를 만들지 않는다.
- 실패 분석: `notes` 명시 qualifier 누락·과잉 8건(`마른 양파`, `손으로`, recalled-context hallucination), `망`을 `망 자루`로 확장 2건, `몇 망`을 non-blocking으로 처리 1건, `열두 망으로 맞춰` quantity change를 `AMBIGUOUS`로 처리 1건. `STACKING` 과잉 생성은 semantic failure에 없었다.
- 결정: contract schema와 semantic comparator는 약화하지 않는다. 위 네 root cause만 대상으로 `prompt-structure-004`, `prompt-quantity-change-002`를 만들었다. 동일 Jeolla tier를 새 prompt pair로 재실행해 27/30 gate를 다시 판정한다.

## E-004 synthetic STT smoke

- 입력: `evals/audio/manifest.jsonl`의 PII 없는 합성 한국어 WAV 3건. 이 tier는 30 transcript 구조화 평가와 분리한다.
- 실행 baseline: OpenAI Audio Transcriptions API의 `gpt-4o-transcribe`를 사용한다. 별도 `faster-whisper` 모델 배포 작업은 P0 범위에서 제외한다.
- 고정: Windows `Microsoft Heami` `ko-KR` voice, manifest의 text hash와 WAV duration.
- 측정: 파일 존재·WAV header·duration, STT non-empty, fixture별 expected case assertion.
- 합격 게이트: 3/3 PASS. 결과는 run artifact의 STT smoke JSONL에 남긴다.
- 주담당: AI. 인계: manifest hash와 실패 fixture ID.

## 변경·재현 규칙

결과 없는 항목은 `미실행`으로 남기고 추정 점수를 쓰지 않는다. production/수집 원음은 저장하지 않으며 입력은 비식별 텍스트/정답 구조만 보관한다. `evals/audio/`의 PII 없는 합성 TTS WAV만 재현 fixture로 보관한다. FE는 동일 run의 화면 캡처를, BE는 request/version ID를, AI는 prompt·provider 환경값을 넘겨야 한 실험으로 인정한다.
