# 실험 로그

## 기록 규칙

2026-09-04 화면·영상·사전·수량 개선은 로컬 회귀와 DB 읽기 조사에 기반한다. 기존 DB에는 guide_phrases 100행/번역 100행이 있고 canonical 51개 중 49개가 양언어를 가진다. WORK_TERM은 canonical 25개 중 23개가 양언어를 가진다. 이 관찰은 원문 PDF의 독립 검수를 뜻하지 않는다. 신규 사전의 실제 모델 성능 이득은 별도 동일조건 평가 전까지 미검증이며, 당시 개선·실험은 근로자 TTS를 제외했다. 후속 전체 음성 조립·메모 노출·망 단위 보완은 별도 회귀로 검증하며 이 과거 실험의 음성 품질 결과로 합산하지 않는다.

각 실험은 `experiment_id`, 날짜, 입력 데이터셋 버전, prompt 계약 버전, provider/model 환경값, 결과, 실패 사례, 결정으로 기록한다. provider/model은 교체 가능한 실험 메타데이터이며 제품 계약에 포함하지 않는다.

## E-20260904-DETAIL 실제 상세 지시 텍스트 smoke

- 날짜/범위: 2026-09-04, 자체 작성 양파 상세 지시 1건. 1번 밭·20망·흙 털기·줄기 손질·상한 것과 작은 것 분리·창고 입구 그늘·던지지 말기·비 올 때 젖은 양파 나중 운반·오전 11시 마감을 포함했다.
- 구성: 현재 환경의 OpenAI `gpt-5.6-terra`, `prompt-structure-005`와 `translation-v1`; 기존 DB guides 100행/assets 8개를 읽었다. 실제 runtime의 구조화와 vi/ne package 번역을 사용하고 합성 함수만 FALLBACK stub으로 대체했다. STT/TTS와 DB 쓰기는 실행하지 않았다.
- 관찰: READY, 수량 20망, 단계 6개. 두 언어 출력에 분리·금지·조건과 장소/마감이 남았다. 단계 1~4는 기존 검수 영상에 연결됐고 선별 두 단계는 같은 공통 영상을 사용한다. 운반 두 단계는 현행 정책대로 영상이 없다.
- 시간: 구조화 13.253초, 구조화부터 양언어 텍스트 package까지 24.978초. 1회 측정이며 운영 P50/P95나 개선 전후 비교 결과가 아니다.
- 결정/한계: 상세 지시 출력 경로를 실제 모델로 smoke 확인했다. 원어민 검수나 사전 성능 향상 평가, 음성 인식과 TTS 검증으로 주장하지 않는다. 모델 출력은 고정 정답 fixture로 승격하지 않는다.

## E-001 구조화 경로 비교

### 2026-09-04 단일 상세 지시 지연 탐색

동일 한국어 입력의 직접 Node runtime 계측에서 기본 설정 구조화 15.540초, 양언어 텍스트 package 9.646초를 관측했다. Responses 47회 중 번역 46회였고 최대 동시 요청은 14였다. STT/TTS/Python/DB/게시 시간은 제외했다.

동일 모델·prompt·schema에서 구조화 effort만 low로 바꾼 단일 실행은 4.473초였다. 입력 3,207토큰은 같고 출력/추론은 기본 1,430/838에서 low 524/0으로 줄었다. 기본은 입력 cache 3,204 HIT, low는 HIT 0이었다. 20망·장소·마감·방법·분리·금지·비 조건이 source 출력에 남았다. 두 작물의 전체 품질 게이트 통과로 주장하지 않는다.

원래 6단계 구조를 고정한 언어별 묶음+none 실험은 번역 40회를 2회로 줄였으나 package 11.725→11.359초에 그쳤다. vi 4.254초, ne 11.270초였다. 호출 수 감소를 latency 개선으로 동일시하지 않는다. 각 비교는 n=1이며 새 설정을 제품 기본값으로 적용하지 않았다. 적용 순서와 한계는 `docs/superpowers/plans/2026-09-04-latency-reduction.md`에 기록한다.

- 가설: STT 후 사투리 정규화·구조화를 거치면 STT 직후 번역보다 단계와 수량 보존이 높다.
- 비교: `STT→translation` baseline vs `STT→normalize→structure→guide lookup→translation` pipeline.
- 데이터: `docs/EVALS.md`의 비식별 양파·딸기 transcript JSONL 33건. 실제 데이터는 수집 후 dataset version을 기록한다.
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

- 입력: `evals/audio/manifest.jsonl`의 PII 없는 합성 한국어 WAV 3건. 이 tier는 33 transcript 구조화 평가와 분리한다.
- 고정: Windows `Microsoft Heami` `ko-KR` voice, manifest의 text hash와 WAV duration.
- 측정: 파일 존재·WAV header·duration, STT non-empty, fixture별 expected case assertion.
- 합격 게이트: 3/3 PASS. 결과는 run artifact의 STT smoke JSONL에 남긴다.
- 주담당: AI. 인계: manifest hash와 실패 fixture ID.

## E-005 한국어 STT model 비교

- 날짜: 2026-09-04
- 입력: `stt-smoke-001`, `language=ko`, prompt 없음.
- `gpt-4o-transcribe`: `창고 아파트에서 양파 스무 망을 수확해서 창고로 옮겨.`
- `gpt-transcribe`: `창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨.`
- 결정: 문구 치환 없이 `OPENAI_TRANSCRIBE_MODEL=gpt-transcribe`를 사용한다. model은 server-only 환경변수로 유지한다.

## E-006 일반화된 한국어 수량 힌트

- 날짜: 2026-09-04
- 입력: `stt-smoke-001`, `language=ko`, 특정 숫자·단위 예시가 없는 한국어 농작업 prompt.
- 결과: transcript `창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨.`, 구조 수량 `{value: 20, unit: "망"}`, live E2E PASS.
- 결정: 운영 prompt에는 특정 수량 표현이나 결과 치환을 넣지 않는다. `스무 망`·`이십 망`·`20망`은 평가 데이터에서만 회귀 검증한다.

## E-007 확신 기반 2단계 한국어 STT

- 날짜: 2026-09-04
- 입력: `stt-smoke-001`~`003`, `language=ko`, 특정 작물·수량·작업 어휘가 없는 일반 작업 문맥 prompt.
- 결과: 기준 `gpt-transcribe`는 세 fixture의 원문을 보존했다. `gpt-4o-transcribe` 단독은 `창고 앞 밭`을 높은 확신으로 `창고 아파트`로 오인식하여 기준 모델로 사용하지 않는다.
- 결정: 기준 모델 token log probability가 `-0.5`보다 낮을 때만 `gpt-4o-transcribe`로 같은 원음을 재검증한다. 결과가 다르면 작은 텍스트 모델이 두 후보 중 문맥상 명백한 하나만 선택하며, 새 문장을 생성하지 못하게 한다. 불명확하면 `AUDIO_UNCLEAR`로 재녹음을 요청한다.

## E-008 사투리 참고 JSON과 문맥 연결

- 날짜: 2026-09-04
- 구현: 양파·딸기 현장어 16개 의미 묶음/96개 표현을 데이터로 관리하고 초기 구조화·보완·수량 변경에 관련 항목 최대 8개만 전달한다. 원문 치환·벡터 DB·추가 LLM 호출은 없다. 출처에서 관찰한 의미와 미검수 후보를 분리한다.
- 동일 모델/입력 비교: 기존 47개 텍스트+3개 합성 smoke의 부분 필드 통과는 43/50에서 47/50, 새 합성 음성 7개는 4/7에서 6/7. 이 통합 진단 집계는 정규 release tier나 전체 의미 정확도가 아니다.
- 추가 평가: 최종 prompt의 새 표현 5/6, 발음 표기 변형 음성 1/4. 전사 손실, 출발 위치 혼동, 명시적으로 미정인 수량의 확인 질문 누락이 남아 있다. 기존 수량/단계 통과만으로 실제 발화 성공을 선언하지 않는다.
- 결정: JSON·문맥 연결은 반영하되 AI 품질 release 승인은 보류한다. 단위·모의 E2E 통과는 실제 농장주 음성 품질 검증을 대신하지 않는다.
- 증거: [사투리 문맥 비교·출처 검토](../evals/results/2026-09-04-dialect-context-review.md). 원시 입력·결과·모델·prompt/사전 hash를 각 run 디렉터리에 보존했다. 최종 출처 정정 뒤 Node 53/53 통과; 해당 메타데이터 정정 이전의 live 점수임을 보고서에 명시했다.

## E-009 reconnect 후 working tree 감사·사투리 회귀

- 날짜: 2026-09-04. 기존 사전·runtime 연결·운반 영상 제외·Docker references 변경을 보존하고 이어서 작업했다.
- 재현 및 수정: 한국어 UTF-8 분할 토큰이 STT 신뢰도 검사에서 빠지는 결함, 명시적 수량 미정 질문 누락, 위치 권고의 추가 입력 강제, 실제 위치 충돌의 blocking 완화, 위치 불명확 때 이해한 단계까지 삭제하는 schema 오류를 다뤘다. 표현을 task_code로 강제 치환하지 않았다.
- 최종 controlled text: 동일 prompt·모델·23개 입력 × 3회, 사전 문맥 on 69/69, off 69/69. 두 군 모두 단일 bridge 시도이며 source hash 불변을 확인했다. 이 세트에서 사전 자체의 추가 효과는 입증되지 않았다.
- 일반화: 사전에 없는 표현 9개 × 3회는 두 군 모두 27/27. 5개 입력은 참고 항목도 매칭되지 않는다. 기존 텍스트 47개는 47/47.
- 잔여 실패: 합성 사투리 음성 7개 × 2회 12/14, 별도 STT smoke 2/3. `캐서`의 동작 누락과 `저짝 밭`의 잘못된 고유 장소 전사가 남는다. 전사 prompt·검토 prompt·검토 모델의 추가 실험도 일관된 개선을 보이지 않아 운영 설정에는 적용하지 않았다.
- 검증: Node 55/55, BE 78/78, browser 39/39, 전체 9/9 suites. 텍스트 필드 성공과 실제 사람 음성 정확도를 구분하며 STT release 승인은 계속 보류한다.
- 증거와 재현: [작업 재개 감사·최종 평가](../evals/results/2026-09-04-dialect-resume-review.md). 기존 실패 결과는 보존했다.

## 변경·재현 규칙

## E-010 구조화 추론 강도 축소와 장소 생략 회귀

- 날짜: 2026-09-04. 동일 `gpt-5.6-terra`의 구조화 요청만 `medium`에서 `low`로 바꾼 선행 단일 비교는 같은 입력·prompt·schema에서 15,533ms에서 4,473ms였다. 한 번의 호출이므로 운영 p50/p95나 전체 처리시간으로 일반화하지 않는다.
- 적용: 초기 초안과 보완 `structure-v2`만 server-only `OPENAI_STRUCTURE_REASONING_EFFORT=low`를 사용한다. STT·전사 검토·수량 변경·번역·TTS에는 reasoning 값을 보내지 않는다.
- 적용 후 live 구조화 3건: 장소 생략 4,272ms, 수량·순서·금지 복합지시 4,534ms, 실제 장소 후보 충돌 2,718ms. 장소 생략은 `READY`/`UNSPECIFIED`/LOCATION 질문 없음, 복합지시는 20망과 수확·선별·운반 순서 및 두 금지사항 보존, 실제 동·서 밭 충돌은 blocking LOCATION이었다.
- 범위: 비식별 텍스트 입력의 구조화 호출만 측정했다. STT·번역·TTS·DB·HTTP 전체 경로와 원어민 검수는 포함하지 않았다.

## E-011 `만`/`망` 경계 재검증

- 재현: 공백 없이 합성한 `저쪽 밭 양파 스무망 캐갖고…` WAV를 현재 STT→구조화 경로에서 3회 실행했다.
- 수정: 고유어 수사 뒤 `만`이 붙은 고확신 전사도 독립 재전사 대상으로 올린다. 두 후보에도 경계가 남으면 `AUDIO_UNCLEAR`로 닫고 `망`으로 사후 치환하지 않는다. 실제 `이십만 개`는 이 추가 경로를 타지 않는다.
- 결과: 세 실행 모두 전사는 `스무 망`, 구조 수량은 `20망`이었다. 전체 구조 평가는 2/3이었고 나머지 1건은 수량이 아니라 `저쪽 밭`을 NAMED로 처리한 기존 위치 변동 실패였다. 합성 음성이므로 실제 화자 정확도 주장은 하지 않는다.
- 증거: [반복 결과](../evals/results/dialect-20260904T041246156925Z/results.jsonl), Node 경계 단위 회귀 3건, 전체 자동 검증 9/9 suites.

결과 없는 항목은 `미실행`으로 남기고 추정 점수를 쓰지 않는다. production/수집 원음은 저장하지 않으며 입력은 비식별 텍스트/정답 구조만 보관한다. `evals/audio/`의 PII 없는 합성 TTS WAV만 재현 fixture로 보관한다. FE는 동일 run의 화면 캡처를, BE는 request/version ID를, AI는 prompt·provider 환경값을 넘겨야 한 실험으로 인정한다.

current runs record `structure-v2`/`ontology-v2`; retired-code fixtures remain preservation fixtures, not new publish data. Migration regression은 legacy data/asset reference가 reset·rewrite·자동 remap 없이 queryable임을 기록한다.
