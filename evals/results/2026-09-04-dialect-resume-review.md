# 사투리 작업 재개 감사·검증 — 2026-09-04

## 결론

기존 working tree를 보존하고 재현된 결함을 이어서 수정했다. 최종 텍스트 회귀는 통과했지만 **STT 품질 release gate는 통과하지 못했다.** 음성에서 사라진 동작이나 밭 번호를 사전으로 추측해 복원하지 않았다.

## 시작 시 감사

`git status --short`, `git diff`, 사투리 파일 수정 시각, 기존 runtime tests와 실제 평가 JSONL을 먼저 확인했다. 초기 working tree에는 인증·배포·UI 등 다른 작업의 변경도 있었다.

| 시작 시 상태 | 확인 결과 | 이번 작업 |
|---|---|---|
| 사투리 JSON·선별기·LLM 연결 | 초기·보완·수량 요청에 이미 연결됨 | 연결 유지; DEICTIC 참고 문구를 비차단 권고로 정정 |
| Docker references 포함 | `.dockerignore` 예외와 `backend/Dockerfile` COPY 존재 | 유지; 실제 Docker 이미지 빌드는 수행하지 않음 |
| 양파 운반 영상 제외 | 코드·text/TTS 유지, 신규 video만 제외하는 정책 구현됨 | 관련 runtime·stored-package 회귀 유지 |
| mixed crop prompt | 양파+딸기를 blocking TASK·빈 단계로 처리하는 기존 수정 존재 | 정순·역순·부정 작물·반복 평가로 확인 |
| DEICTIC 백엔드 | 누락 경고 추가; 모든 LOCATION을 non-blocking으로 내리는 문제 존재 | 실제 장소 충돌의 blocking은 보존; 위치 원문 표시 |
| DEICTIC 화면 | non-blocking이어도 별도 사유 선택 전에는 전달 버튼 비활성 | 현장 설명 전달 버튼 한 번으로 명시적 IN_PERSON_BRIEFING 선택 |
| 실제 AI 평가 | 이전 변경 전후에 prompt·사전·BE가 함께 변함 | 동일 prompt의 사전 문맥 on/off 비교 추가 |
| 미완료 의미 품질 | 수량 미정 질문 누락, STT 동작 손실, 잘못된 단위 경계 | 직접 재현 후 수정·반복 평가; STT 잔여 실패 공개 |

초기 Node 53개가 통과했어도 실제 `수량은 정하지 않았어` 입력은 질문 없이 READY였다. `아홉 번 밭`과 `9번 밭`은 같은 의미이므로 새 회귀 gold에서 두 표기를 명시적으로 허용했다. 원래 gold와 실패 결과는 덮어쓰지 않았다.

## 수정 근거

- **STT 신뢰도 버그:** UTF-8로 분할된 한국어 토큰의 `token`이 `�`이면 기존 문자/숫자 필터가 제외했다. 실제 음성의 `밭` 토큰은 logprob 약 -0.67인데도 재검증이 생략됐다. 대체문자와 비ASCII bytes도 검사하도록 수정했고, 해당 결함을 먼저 실패하는 unit test로 재현했다.
- **수량 판단:** 수량 생략과 명시적 미정·유보를 구분한다. 후자는 unknown과 blocking QUANTITY를 함께 보존한다. 용기 명사나 완료형 관형어를 임의 수량으로 보지 않으며, 명확한 수량+용기 단위를 수확·운반 목표량으로 허용한다.
- **작업·schema:** 모든 긍정 동작을 순서대로 보존한다. 작물 혼합은 임의 한 작물 선택 대신 blocking 초안으로 남긴다. 위치만 불명확할 때 이미 이해한 단계를 삭제하지 않는다. 이 구분이 없을 때 반복 평가에서 NO_EXECUTABLE_STEP 오류가 재현됐다.
- **현장 위치 UX:** `저쪽 밭`·`저짝`·`거기` 자체는 추가 위치 입력 사유가 아니다. 원문과 null canonical location을 유지하며, 위치 권고만 남은 LOW-risk 초안은 `현장에서 장소를 알려주고 전달` 버튼으로 진행한다. 실제 장소 충돌, TASK/QUANTITY/SAFETY, HIGH/UNKNOWN, 실행 단계 없음은 계속 차단한다.
- **평가 공정성:** 최초 비교 harness에서 문맥 on만 BE 재시도를 사용하던 차이를 코드 리뷰로 발견했다. 최종 두 군은 동일 NodeBridge·1회 시도·동일 model/prompt/dataset이다. 결과에 `attempts_per_case`와 실행 전 source hash, 실행 중 변경 여부를 기록한다.

특정 문장 치환, 표현→task_code 강제 매핑, 새 정답 표현의 사전 추가는 하지 않았다. 비교용 `dialectReference:null`은 내부 dependency injection이고 production HTTP/bridge payload에 토글을 추가하지 않았다.

## 최종 검증

| 검증 | 결과 | 증거 |
|---|---:|---|
| 전체 자동 검증 | 9/9 suites | Node 55/55, BE 78/78, browser 39/39, build·contract·기타 gate 포함 |
| 사전 문맥 on, 23개 × 3회 | 69/69 | [raw results](dialect-20260903T211812703551Z/results.jsonl) |
| 사전 문맥 off, 동일 23개 × 3회 | 69/69 | [raw results](dialect-20260903T211919642849Z/results.jsonl) |
| 기존 텍스트 47개 | 47/47 | [기존 평가](dialect-20260903T211858716860Z/results.jsonl)의 audio 없는 행 |
| 기존 합성 STT smoke 3개 | 2/3 | 같은 run의 STT 행, 텍스트 분모와 분리 |
| 사투리 합성 음성 7개 × 2회 | 12/14 | [raw results](dialect-20260903T211842007937Z/results.jsonl) |

최종 비교에서 사전의 추가 성능 이득은 **입증되지 않았다.** 앞선 중간 prompt에서는 on 68/69, off 66/69였으나, 최종 prompt에서는 동일했다. 작은 자체 작성 반복 세트이며 통계적 유의성·실제 화자 정확도를 주장하지 않는다. 표시 점수는 명시된 필드 검사이며 전체 번역 의미의 사람 검수를 대신하지 않는다.

새 표현 9개는 사전 본문에 없고 그중 5개는 선별된 참고 항목도 없다. 최종 두 군 모두 새 표현 27/27을 통과했다. 수량·위치 경고·부정문·미지원 표현을 포함하며 새 표현을 사전에 넣지 않았다. [사전 미포함 및 선택 문맥 감사](2026-09-04-generalization-reference-audit.json).

각 최종 run의 `source_changed_during_run`은 false다. 실행 모델은 `gpt-5.6-terra`, STT는 `gpt-transcribe`, 검증 STT는 `gpt-4o-transcribe`, 검토 모델은 `gpt-4o-mini`이며 server-only 설정을 유지했다. 실행 중 다른 작업이 `57e2037`을 만들었으므로 단순 HEAD 대신 각 run의 source hash가 평가 대상 증거다. 이 세션은 commit/push/deploy/DB write를 수행하지 않았다.

## 남은 실패와 추가 실험

1. `audio-holdout-02`는 마지막 두 번 모두 `캐서`를 `해서`로 전사해 수확 단계가 누락됐다. byte 토큰 수정 후 독립 검증이 실행되는 경우에도 검토 모델이 잘못된 후보를 선택할 수 있고, 신뢰도가 임계값보다 높게 나오는 실행에서는 검증 자체를 건너뛴다. 진단 중 한 번 올바른 `캐서` 후보를 선택한 결과만 골라 성공으로 보고하지 않았다.
2. 최종 `stt-smoke-003`은 `저짝 밭`을 `저작밭`으로 전사했다. 구조화는 이를 NAMED로 받아 경고가 빠졌다. 이는 텍스트 DEICTIC 처리 결함과 별개인 전사 손실이다. 올바른 `저짝 밭` 텍스트로는 비차단 권고가 유지되지만 원음의 정답을 복원했다는 뜻은 아니다.
3. 추가 번호 발음 합성 음성 진단에서는 `일 번 밭`/`이 번 밭`이 `일본 팥`/`이번 박` 등으로 변했다. 이전 prompt 단계의 해당 진단은 1/4였으며, 최신 69/69 텍스트 점수에 합치지 않았다.
4. 원문 그대로 전사하도록 바꾼 STT prompt, 더 엄격한 후보 비교 prompt, 더 강한 검토 모델을 각각 합성 음성 7개로 시험했다. 동작 손실을 일관되게 해결하지 못했고 더 강한 모델도 전사 검증이 실행되지 않으면 효과가 없다. 이 후보들을 운영 기본값에 반영하지 않았다. [전사 후보·토큰·실험 증거](2026-09-04-stt-resume-diagnostics.json).

다음 품질 gate는 실제 화자·마이크·잡음 조건에서 동작과 위치 보존을 평가하고, 신뢰도만으로 재검증 여부를 정하는 정책의 recall/cost를 비교하는 것이다. 현재 결과로 음성 품질 완료나 출시 준비 완료를 선언할 수 없다. 농장주 원음 재생·단계 확인 기능은 유지한다.

## 재현

```powershell
$env:PYTHONIOENCODING = 'utf-8'
pnpm test
& backend/.venv/Scripts/python.exe backend/evaluate_dialect.py evals/dialect-controlled-20260904.jsonl --repeat 3
& backend/.venv/Scripts/python.exe backend/evaluate_dialect.py evals/dialect-controlled-20260904.jsonl --repeat 3 --without-dialect
& backend/.venv/Scripts/python.exe backend/evaluate_dialect.py
& backend/.venv/Scripts/python.exe backend/evaluate_dialect.py tmp/dialect-audio-20260904-run1/manifest.jsonl --repeat 2
```

유료 provider 호출이다. 합성 WAV는 기존 로컬 `tmp`와 `evals/audio`를 사용하며 사람 원음을 저장하지 않는다. 로컬 WAV가 없으면 기존 `scripts/generate-dialect-audio.ps1`로 새 디렉터리에 재생성하고 새 manifest hash를 기록한다. 기존 결과 디렉터리를 덮어쓰지 않는다.
