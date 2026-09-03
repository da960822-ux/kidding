# 실험 로그

## 기록 규칙

각 실험은 `experiment_id`, 날짜, 입력 데이터셋 버전, prompt 계약 버전, provider/model 환경값, 결과, 실패 사례, 결정으로 기록한다. provider/model은 교체 가능한 실험 메타데이터이며 제품 계약에 포함하지 않는다.

## E-001 구조화 경로 비교

- 가설: STT 후 사투리 정규화·구조화를 거치면 STT 직후 번역보다 단계와 수량 보존이 높다.
- 비교: `STT→translation` baseline vs `STT→normalize→structure→guide lookup→translation` pipeline.
- 데이터: `docs/EVALS.md`의 비식별 양파·딸기 transcript JSONL 30건. 실제 데이터는 수집 후 dataset version을 기록한다.
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

- 후보: 새 publish는 current two-crop `structure-v2`/`ontology-v2`를 지키는 prompt pair를 비교한다. historical prompt와 retired-code stored-version fixture는 legacy preservation regression용이며 새 publish 후보가 아니다.
- 고정: 동일 dataset, decoding 설정, provider/model 환경값, 평가자 rubric.
- 측정: valid JSON rate, field exact match, task_code accuracy, ambiguity preservation, token usage, latency.
- 결정: 승자는 정확도·안전 gate를 모두 통과하고 비용/지연이 허용되는 버전. 결과 전에는 기본값을 선언하지 않는다.
- 주담당: AI. 인계: prompt 파일 버전과 결과 CSV.

## E-004 synthetic STT smoke

- 입력: `evals/audio/manifest.jsonl`의 PII 없는 합성 한국어 WAV 3건. 이 tier는 30 transcript 구조화 평가와 분리한다.
- 고정: Windows `Microsoft Heami` `ko-KR` voice, manifest의 text hash와 WAV duration.
- 측정: 파일 존재·WAV header·duration, STT non-empty, fixture별 expected case assertion.
- 합격 게이트: 3/3 PASS. 결과는 run artifact의 STT smoke JSONL에 남긴다.
- 주담당: AI. 인계: manifest hash와 실패 fixture ID.

## 변경·재현 규칙

결과 없는 항목은 `미실행`으로 남기고 추정 점수를 쓰지 않는다. production/수집 원음은 저장하지 않으며 입력은 비식별 텍스트/정답 구조만 보관한다. `evals/audio/`의 PII 없는 합성 TTS WAV만 재현 fixture로 보관한다. FE는 동일 run의 화면 캡처를, BE는 request/version ID를, AI는 prompt·provider 환경값을 넘겨야 한 실험으로 인정한다.

current runs record `structure-v2`/`ontology-v2`; retired-code fixtures remain preservation fixtures, not new publish data. Migration regression은 legacy data/asset reference가 reset·rewrite·자동 remap 없이 queryable임을 기록한다.
