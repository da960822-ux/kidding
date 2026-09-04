# 화면 전환·근로자 음성·스토리보드·수량 정합성 수정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 농장주·근로자의 화면 지연과 단계 진입 실패를 줄이고, 승인된 영상 및 선택 언어 음성을 전달하며, 수량 변경 후 모든 안내가 같은 수량을 나타내게 한다.

**Architecture:** 기존 React 화면, FastAPI, Node AI bridge, PostgreSQL 저장 구조를 유지한다. 화면 재생 수명 관리, 동기 DB 호출 격리와 일괄 조회, 기존 briefing 재사용, DB에 이미 등록된 용어·번역과 기존 사전 확장부터 적용한다. 새 작업 큐·벡터 DB·단계별 TTS API·범용 미디어 프레임워크는 필요하지 않다.

**Tech Stack:** React 18 / TypeScript / Vite, FastAPI / Python, Node.js, Supabase PostgreSQL, Playwright / node:test / unittest.

**Spec:** `AGENTS.md`, `CONTEXT.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `docs/AI_CONTRACTS.md`, `docs/DATA_MODEL.md`, `docs/SAFETY_POLICY.md`, `docs/FAILURE_MODES.md`, `docs/EVALS.md`, `docs/BACKLOG.md`.

**조사 기준:** 2026-09-04, HEAD `ff68b9595fbaae6849ed3df0108a4e49947f8b49`와 당시 작업 트리. 서브에이전트 3명이 근로자 흐름, 영상/DB, 수량/사전을 조사했고 부모가 화면 전환·서버 지연을 조사했다. 아래는 계획이며 제품 수정·배포 완료 보고가 아니다. 기존 `README.md` 수정과 untracked 사용자 폴더는 보존했다.

**실행 범위 변경:** 이후 사용자가 근로자 TTS를 제외한 병렬 수정을 승인했다. 아래 A의 음성/재생 변경, B의 TTS 텍스트 규격 확장, G의 TTS cache/bridge 재설계는 이번 실행에서 제외한다. B의 원본 수량 문구 정합성, C의 DB 용어/전문어 참고·번역, D의 조회 성능, E의 관리자 영상, F의 비-TTS 요청 예산/결과 불명 복구, 상세 메모 표시를 구현한다. TTS 관련 남은 계획을 완료 처리하지 않는다.

## 실행 결과 — 2026-09-04

- 통합 검증: 기존 사용자 변경(관리 접근/PIN 표시/다른 작업의 음성 수정)을 보존해 원래 작업 폴더에 통합했다. `LIVE_E2E=0 pnpm test` 9/9 suites 통과: 해당 실행의 BE 104개, 브라우저 82개+실제 API wrapper 1개, AI 및 manifest/contract/build 검사 포함. 유료 E2E·배포·DB 쓰기는 실행하지 않았다. 격리 작업의 AI 최종 회귀는 72개 통과했다. 단일 상세 텍스트 모델 smoke와 성능 탐색은 별도 기록이다.

- B/C: 이전 목표 수량의 단계·메모 참조 갱신, 불명확한 참조의 저장 전 거부, 단일 숫자 근거 충돌 차단을 구현했다. 기존 DB 용어를 번역 glossary로 전달하고 누락 전문어 10개의 의미·반례를 미검수 참고자료로 추가했다. 독립 검토에서 보조 개수·복합 숫자·용기 용량의 오해석을 찾아 회귀와 함께 보완했다.
- D/E: 비-TTS 동기 DB 호출을 thread pool에 격리하고 정상 owner 목록 3회/member 목록 6회로 일괄 조회한다. 관리자 스토리보드는 기존 저장 package의 동일 session/version/language 영상만 재생한다. 목록과 roster 독립 로딩, 조회 오류 재시도, polling 중복/이전 화면 응답 차단을 구현했다.
- F/상세 화면: 비-TTS bridge의 50초 공통 예산, provider JSON/STT 45초 중단, 확정 응답 유실의 상태 재조회와 동일 요청 key 보존을 구현했다. 근로자 notes는 첫 화면과 단계 화면에서 바로 보인다. REMOTE 링크는 기존 명시적 재발급 동작을 유지한다.
- 실제 모델 smoke: 상세 양파 지시 한 건을 현재 모델로 구조화하고 vi/ne로 번역했다. 20망·6단계·분리·금지·비 올 때 조건·장소·마감이 출력에 보존됐다. 상세 결과는 `docs/EXPERIMENT_LOG.md`의 E-20260904-DETAIL에 기록했다. 텍스트 입력이며 STT/TTS와 DB 쓰기는 실행하지 않았다.
- 범위 한계: 근로자 TTS와 그에 연결된 미지원 Web Speech 단계 진입 오류는 이번에 수정하지 않았다. 일반적인 자연어 의미 보존, 원어민 검수, 실제 기기 음성·운영 부하·배포는 별도 검증 대상이다. 아래 체크리스트는 최초 계획을 보존하며, 구현 완료 범위는 이 절을 따른다.

## 1. 불변 조건

- 양파·딸기, `vi|ne`, 수량 변경만 P0 범위다. 8개 canonical task code와 family 일치를 유지한다.
- 영상은 사전 AI 생성, 사람 검수 `APPROVED`, `LOW`, current 자산만 사용한다. 신규 `ONION_TRANSPORT` 영상 제외는 정상 정책이다.
- `WorkDraft`는 미확정, `WorkSession`과 언어 package는 확인 이후 원자적으로 게시한다. 기존 immutable version/package를 덮어쓰지 않는다.
- unknown은 `UNSPECIFIED`/`null`, 수량 충돌은 blocking ambiguity다. 큰 수량이라는 이유로 정상 입력을 임의 교정하지 않는다.
- cookie 범위·exact Origin·24시간 만료·버전 충돌·안전 gate를 유지한다. 조회 최적화 때문에 권한 검사나 farm 필터를 제거하지 않는다.
- 안내 듣기·단계 이동은 acknowledgement가 아니다. 명시적으로 표시된 버전을 확인할 때만 receipt를 저장한다.
- 서브에이전트도 필수 문서 순서와 `.agents/skills/ponytail/SKILL.md` full을 적용한다. AI 프롬프트·평가는 해당 프로젝트 스킬을 적용한다.
- 계약 변경은 권위 문서부터 수정하고 구현·예제·실패·검증을 같은 작업에서 완료한다. 이 계획은 새 권위 계약을 대신하지 않는다.

## 2. 확인한 원인과 한계

| ID | 판정 | 증거 | 영향 |
|---|---|---|---|
| F1 | 조건부 오류 재현 | `WorkerScreens.tsx:35,44,58,59,135,170,177,184`에서 Web Speech 지원 확인 없이 `cancel()` 호출 | API 미지원 시 시작 클릭 후 URL은 `/steps/1`이지만 화면 전체가 사라짐 |
| F2 | 재현 | `WorkerScreens.tsx:140`의 `audioUrl={null}` | 서버 TTS가 준비되어 있어도 단계 듣기는 브라우저 음성만 사용 |
| F3 | 재현 | 기존 audio의 `onerror`와 pending `play()` rejection이 화면 이탈 뒤 실행 | 중단한 이전 안내가 다시 시작되고 fallback이 두 번 실행 |
| F4 | 코드 + 지연 주입 재현 | `main.py:588,2046,2461`의 sync Supabase `.execute()`가 async route 안에서 실행 | 한 요청의 DB 대기가 다른 화면 조회와 `/health`까지 지연 |
| F5 | 호출 수 확인 | owner 목록은 인증 제외 `1+2N`, member 목록은 current-v2 기준 `3+3N` DB 조회 | 작업 수·근로자 수·polling 증가에 따라 지연 확대 |
| F6 | 코드 + DB 확인 | `main.py:673`의 owner state는 video null, `OwnerScreens.tsx:146` StorySteps는 아이콘/라벨만 렌더 | 관리자 스토리보드에는 DB 영상이 있어도 플레이어가 없음 |
| F7 | 읽기 전용 DB 확인 | current 영상 8개 모두 APPROVED/LOW, URL HEAD 8개 모두 200. 최근 20 package 모두 TTS READY | 전체 자산 누락이나 TTS 전체 생성 실패로 설명되지 않음 |
| F8 | 정상 fallback 확인 | 최근 2 package는 `ONION_TRANSPORT`만 포함해 video 배열이 비어 있음 | 이 작업에는 DB에 영상이 있어도 신규 노출하면 안 됨 |
| F9 | 검증 공백 재현 | `20망` 원문/요약에 `{value:200000,unit:"개"}` 구조를 넣어도 `validateStructureV2` 통과 | 숫자·단위 의미 충돌을 schema만으로 못 잡음 |
| F10 | 코드 + DB + stub 재현 | `main.py:751`은 quantity만 교체. DB 수량 변경 이력 8건 모두 source steps 동일, 4건은 옛 숫자+단위 잔류 | 새 카드 수량과 단계·음성 수량이 서로 다름 |
| F11 | 코드 확인 | `worker-briefing-v2.mjs:44`는 단위만 번역, provider는 segment 미사용 | `망`의 농업 의미를 잃을 수 있음. 원어민 품질 검증은 별도 필요 |
| F12 | 코드 확인 | frontend 60초 timeout, bridge 호출별 최대 60초 × 2회, provider fetch 자체 timeout 없음 | FE가 포기한 뒤 서버 처리/게시가 계속될 수 있음 |
| F13 | 코드와 계약 불일치 | DATA_MODEL은 TTS cache-first, 구현은 매번 synthesize 후 upsert | 반복 생성·불필요한 대기와 비용 |
| F14 | DB + 코드 확인 | guide_phrases 100행(용어48/작업문장32/안전문장20), translations vi50/ne50. BE는 읽지만 category/phrase_type을 버리고 Node는 문장 전체 일치만 조회 | DB에 이미 있는 단어가 문장 속에 등장해도 일반 번역의 참고자료로 전달되지 않음 |

재현 및 측정 해석:

- 정상 Chromium의 단계 진입은 오류 없이 성공했다. Web Speech API를 제거하면 `Cannot read properties of undefined (reading 'cancel')`와 빈 화면이 재현됐다. 사용자 기기의 실제 API 지원 여부는 아직 확인하지 않았다.
- 동일 READY audio URL에서 전체 듣기는 `new Audio(URL)`, 단계 듣기는 `speechSynthesis.speak()`만 호출하는 것을 계측했다.
- DB 호출당 30ms를 주입한 테스트에서 owner 목록 1/5/10건은 3/11/21회 조회였고, 함께 실행한 health 완료가 약 105/352/659ms까지 밀렸다. 운영 서비스 지연 측정값이 아니라 event-loop blocking 증거다.
- 실제 TTS GET은 vi 200/audio-mpeg/82,560 bytes/883ms, ne 200/audio-mpeg/106,368 bytes/541ms였다. 각 1회 읽기 결과이며 p95나 재생 품질을 뜻하지 않는다.
- DB에서 비교 가능한 수량 변경 7쌍의 vi/ne TTS hash는 모두 달랐다. 그런데 source steps 4건에 옛 수량이 남았다. **hash가 바뀌었다는 검사만으로 올바른 음성을 보장할 수 없다.** stub 재현에서는 hash가 아예 같게 남는 경우도 확인했다.
- 실제 `20망 → 20만개` 사고의 원음·transcript·구조 JSON을 특정하지 못했다. STT 오인식인지 구조화 오류인지 아직 구분할 수 없다. FE 수량 포맷터는 값과 단위를 연결할 뿐 숫자를 변환하지 않는다.
- `render.yaml`에 free/singapore 설정이 있으나 현재 배포 인스턴스의 cold start나 지역 왕복이 주원인이라는 증거는 없다. 운영 revision·요청 timing을 확인한 뒤 판단한다.
- DB 사전은 언어별 WORK_TERM 24행, WORK_INSTRUCTION 16행, SAFETY 10행이 연결되어 있다. 예시는 물 `Nước / पानी`, 땅 `Đất / जमिन`, 잡초뽑기 `Nhổ cỏ / गोडमेल`다. 모두 DB상 verified=true 및 source page/URL/license 필드를 갖췄지만 이번에 원문 PDF의 사람 검수를 독립 확인하지 않았다. 데이터 존재·구조 검증과 출처의 실제 정확성 검증을 구분한다.
- canonical 기준으로 전체 51개 중 49개, WORK_TERM 25개 중 23개가 vi/ne 둘 다 있다. `씨앗뿌리기`는 ne만, `씨앗`은 vi만이며 서로 다른 뜻이므로 합치지 않는다. `망·포대·상자·양파·딸기·수확·선별·포장·꼭지·줄기`는 정확 일치와 포함 검색 모두 없었다. 기존 기초 사전 활용과 이 P0 특수용어 보완이 모두 필요하다.

## 3. 계약 불일치 정리

다음 변경은 각 구현 작업의 첫 단계다. 현재 계약 파일을 이번 조사 중 고치지는 않았다.

1. `openapi.yaml:112`는 draft에서 번역·영상 매칭까지 한다고 설명하지만 현재 draft는 구조화만 한다. PRODUCT_SPEC의 게시 시 vi/ne package 생성 흐름을 기준으로, 초안과 게시 후 미디어의 책임을 명확히 한다. 이번 해결 대상은 **게시 후 관리자 스토리보드의 실제 영상 표시**다. 확인 전 영상 미리보기를 제공한다고 약속하지 않는다.
2. `AI_CONTRACTS.md`의 BE deterministic quantity/order 번역 설명은 Node 소유 원칙 및 실제 구현과 다르다. Node가 검수 단위 매핑·수량 표현을 만들고 BE가 검증·저장하는 책임으로 정리한다.
3. 전체 TTS가 safety+steps만 읽는 현 계약에는 수량이 빠질 수 있다. 최신 수량 안내를 보장하도록 **안전 문구, 존재하는 context(위치·수량·마감·메모), 모든 단계** 순서를 제안한다. unknown context를 추측해 읽지 않는다. Node exact text와 BE expected text 검증을 함께 바꾼다. DTO 필드 추가는 필요 없다.
4. 시작 클릭은 단계 화면 진입과 전체 번역 안내 재생을 요청한다. 전체 음성 1개를 단계별 음성처럼 표시하지 않는다. 재생 실패가 화면 이동을 막지 않고, 현지어 오류·재시도·텍스트를 제공한다.
5. cache-first, timeout과 uncertain mutation 복구의 구현을 문서와 맞춘다. HTTP queue/202 계약은 추가하지 않는다.

영향 문서: PRODUCT_SPEC(행동), ARCHITECTURE(Node/BE·미디어 경계), AI_CONTRACTS(exact TTS·단위·private bridge), DATA_MODEL(cache와 immutable 저장), FAILURE_MODES(불일치·미지원·지연), EVALS/EXPERIMENT_LOG(검증), BACKLOG(작업별 단일 주담당). DTO나 새 오류가 변할 때만 OpenAPI/schema를 확장한다. 사전 자체 작성 항목은 공식 번역·사람 검수 완료로 표시하지 않는다.

## 4. 실행 순서와 주담당

| 작업 | 우선순위 | 주담당 | 선행 | 완료 조건 |
|---|---|---|---|---|
| A. 단계 진입과 음성 수명 복구 | P0 | FE | 해당 행동 계약 정리 | 미지원 브라우저 화면 유지, 서버 TTS 우선, 구음성 재시작 없음 |
| B. 수량 변경의 전체 안내 정합성 | P0 | BE | 수량/TTS 계약 정리 | 카드·source steps·vi/ne·TTS 일치, 기존 version 불변 |
| C. DB 농업 사전 연결과 수량 근거 검증 | P0 | AI | 단위 책임 계약 정리 | 기존 DB 용어 활용, 망/만 대조군·보완·변경 검증 통과 |
| D. DB 지연·중복 조회 줄이기 | P0 | BE | 측정 기준 고정 | event loop 비차단, 목록 조회 수 상수화, 권한 불변 |
| E. 관리자 스토리보드 영상 표시 | P1 | FE | 초안/게시 경계 정리, A | 기존 briefing에서 영상 표시, 제외/실패 fallback |
| F. timeout·결과 불명 복구 | P1 | BE | D | 60초 경계에서 중복 작업·뒤늦은 성공 오인 방지 |
| G. 실제 TTS cache-first | P1 | BE | B, F | 동일 text+language HIT는 provider 호출 0회 |
| H. 실제 기기·전체 경로 검증 | P0 출시 gate | FE | A~G | 아래 출시 조건 모두 충족 |

A와 D는 독립적으로 진행할 수 있다. B/C/G는 `ai/index.mjs`, package builder, `backend/app/main.py`를 공유하므로 파일 소유권을 나누거나 순서대로 통합한다. 각 행은 협업자와 무관하게 primary owner 한 명만 둔다.

## 5. A — 단계 진입과 음성 재생

**Files:** `src/webapp/WorkerScreens.tsx`, `src/webapp/OwnerScreens.tsx`, `tests/webapp/ux-hardening.spec.ts`, `tests/webapp/version-propagation.spec.ts`. 동일 로직이 두 화면에 필요할 때만 작은 `src/webapp/briefing-audio.ts`로 추출한다.

**Consumes:** 기존 `V2WorkerBriefing.tts.audio_url`, `session_id`, `version`, `language_code`.
**Produces:** 같은 package를 재생하는 화면 수명보다 긴 단일 재생 상태. 새 HTTP/AI 계약 없음.

- [ ] 현재 실패 조건을 regression으로 먼저 추가한다. 기존 성공 speech stub 외에 API 없음, READY audio, pending play, error+reject를 넣는다.

```ts
// 최신 안내를 연 기존 fixture에서 실행한다.
await page.evaluate(() => Object.defineProperty(window, 'speechSynthesis', {
  configurable: true, value: undefined,
}));
await page.getByRole('button', { name: 'Bắt đầu bước 1' }).click();
await expect(page.getByRole('heading', { name: /^Bước 1 \/ / })).toBeVisible();
// pageerror를 수집하여 오류가 0건인지 별도로 검사한다.
```

- [ ] 모든 `cancel/speak/getVoices`와 `SpeechSynthesisUtterance` 존재를 확인한다. 지원되는 서버 audio를 재생하기 전에 브라우저 speech 기능이 필수여서는 안 된다.
- [ ] 재생 상태를 WorkerScreenRouter 또는 해당 수명을 가진 작은 hook에 둔다. 시작 클릭 handler 안에서 `Audio.play()`를 요청하고 즉시 `go('worker-step')`한다. promise 완료나 video 로드를 기다리지 않는다. 버튼 unmount cleanup이 정상 재생을 끊지 않게 한다.
- [ ] 단계 화면에도 전체 안내 듣기/정지/재시도를 둔다. `audioUrl={null}`에 의존하는 기존 단계 음성을 제거하거나, 브라우저 전용 보조 기능임을 명확히 분리한다. 이번 기본안은 전체 안내 하나다.
- [ ] 근로자의 요약 화면과 단계 화면에서 모두 선택 언어의 서버 TTS를 들을 수 있어야 한다. 정상 READY 음성을 브라우저 TTS로 대체하지 않는다. 사용자의 TTS 필수 요구는 정상 재생 경로의 완료 기준이며, provider 장애 시 텍스트 fallback을 금지하거나 게시 안전 계약을 임의 변경하는 뜻으로 확대하지 않는다.
- [ ] session/version/language와 재생 generation으로 늦은 이벤트를 거부한다. stop은 pause, callbacks 해제, generation 증가를 수행한다. `onerror`와 `play().catch()` 중 fallback은 한 번만 실행한다.
- [ ] 화면 이탈·다른 배정·새 version·언어 변경은 기존 audio/video를 멈춘다. 동일 version polling은 현재 단계와 정상 재생을 보존한다. 새 version 수신은 첫 단계와 재확인 안내로 돌아가며 자동 acknowledgement는 하지 않는다.
- [ ] OwnerBriefScreen도 같은 지원 검사와 stale callback 처리를 적용한다. 영상 소리와 안내가 겹치지 않게 재생 시작 시 경쟁 미디어를 정지한다. 영상은 `playsInline`, controls와 자막을 유지한다.
- [ ] Run: `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts tests/webapp/version-propagation.spec.ts`. vi/ne, speech 없음, audio 차단, 네트워크 오류에서 화면·텍스트가 유지되는지 확인한다.

## 6. B — 수량 변경 시 예전 지시 제거

**Files:** `backend/app/main.py:751,1395,1535,2170`, `ai/lib/worker-briefing-v2.mjs`, `backend/test_main.py`, `ai/tests/worker-briefing-v2.test.mjs`, `tests/webapp/version-propagation.spec.ts`, 3절 해당 계약 문서.

**Consumes:** `QuantityChangeConfirmRequest.quantity/expected_version`, 이전 immutable structure.
**Produces:** 일관된 다음 structure와 정확히 두 locale package, 기존 원자 publish RPC 입력.

- [ ] `20망 → 15망`에서 source description에 `20망`이 있는 실패 fixture와, description에 수량이 전혀 없는 fixture를 각각 만든다. 전자는 예전 문구 잔류, 후자는 TTS의 수량 누락을 잡는다.
- [ ] 수량의 권위는 `state.quantity`다. 단계의 작업 대상량 참조도 새 값으로 맞춘다. 새 초안에서는 전체 목표량을 context에 두고 단계별 용량/횟수 등 별개의 숫자는 보존하는 계약을 명시한다.
- [ ] 기존 단계는 이전 목표량과 단위가 명확히 일치하는 대상 표현만 수정한다. `20` 전역 치환, 모든 `망/포대/자루` 통합은 금지한다. `20번 밭`, `20시`, `한 상자에 20개씩`은 목표량 변경으로 고치지 않는다. 목표량 참조인지 판별할 수 없는 문장은 그대로 게시하지 않고 기존 `422 SCHEMA_INVALID`로 수량 변경을 거부하고 새 지시 작성 안내를 준다. 새 오류 코드가 필요하면 OpenAPI부터 바꾼다.
- [ ] Node TTS를 3절 순서로 만들고 `worker_tts_text()`도 같은 규칙을 적용한다. 숫자는 번역 모델에 재해석시키지 않는다. translated unit·context·모든 step으로부터 exact text/hash를 검증한다.
- [ ] 두 언어 모두 text 내용에 새 수량이 있는지, 이전 목표량이 없는지 검증한다. hash 변화만 보지 않는다. 다음 assertion은 기존 `work/services` fixture에 추가 가능한 핵심 회귀다.

```js
const first = await buildWorkerPackagesV2(work, ['vi', 'ne'], services);
const next = await buildWorkerPackagesV2({
  ...work, version: 2, quantity: { value: 15, unit: '망' },
}, ['vi', 'ne'], services);
for (const locale of ['vi', 'ne']) {
  assert.equal(next[locale].briefing.context.quantity.value, 15);
  assert.match(next[locale].tts_transport.text, /15/);
  assert.doesNotMatch(next[locale].tts_transport.text, /20/);
  assert.notEqual(first[locale].briefing.tts.text_hash, next[locale].briefing.tts.text_hash);
}
```

- [ ] 기존 version/package는 수정 전후 deep-equal이어야 한다. 번역 실패·TTS fallback·버전 conflict에서 부분 version이 생기지 않아야 한다. TTS provider 실패는 텍스트 fallback을 허용하지만, 텍스트 자체의 수량 불일치는 게시하면 안 된다.
- [ ] Run: `node --test ai/tests/worker-briefing-v2.test.mjs`, `$env:PYTHONPATH='backend'; backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_main.py'`, `pnpm exec playwright test tests/webapp/version-propagation.spec.ts`.

## 7. C — DB 농업 사전 재사용·단위 사전 보완·의미 검증

**Files:** `backend/app/main.py:1288`, `backend/test_main.py`, `ai/references/dialect-v2.json`, `ai/lib/dialect-reference.mjs`, `ai/index.mjs`, `ai/lib/structure-v2-contract.mjs`, `ai/lib/worker-briefing-v2.mjs`, `ai/lib/openai-provider.mjs`, `ai/prompts/prompt-structure-005.md`, `ai/prompts/prompt-structure-supplement-002.md`, `ai/prompts/prompt-quantity-change-001.md`, `ai/tests/dialect-reference-runtime.test.mjs`, `ai/tests/structure-runtime-v2.test.mjs`, `ai/tests/worker-briefing-v2.test.mjs`, `ai/tests/openai-provider.test.mjs`, `evals/quantity-units-20260904.jsonl`.

**Consumes:** 기존 DB `guide_phrases`/`guide_translations`, 원본 transcript, 보완 시 기존 structure, 수량 변경의 trusted expected_version.
**Produces:** DB 용어를 참고한 vi/ne 번역, 현재 READY/AMBIGUOUS 계약과 원문 불변 사전 문맥. 새 검색 서비스 없음.

- [ ] 번역 사전은 DB를 먼저 사용한다. `current_verified_guides()`의 select와 반환값에서 `category`, `phrase_type`, `phrase_key`를 유지하고 기존 private `guides` payload로 전달한다. 현재 자료를 JSON에 복사해 두 개의 원본으로 관리하지 않는다.
- [ ] Node는 전체 문장 exact HIT와 단어 참고를 구분한다. WORK_INSTRUCTION exact HIT는 검수 출처 조건을 충족할 때 기존 직접 번역 경로를 유지한다. WORK_TERM은 현재 언어와 한국어 입력에 관련된 용어만 골라 `translate`에 `glossary`로 전달한다. 수량 단위가 단어와 정확히 일치하면 DB의 해당 단위 번역을 우선 사용한다.
- [ ] provider의 `translate({languageCode,text,segment,glossary})`가 segment와 용어쌍을 실제 프롬프트에 넣도록 바꾼다. glossary는 구분자로 감싼 참고 데이터이며 지시문으로 실행하지 않는다. 제목·설명·위치·수량 단위·영상 자막에 같은 정책을 적용하고, 출력은 vi/ne 한 언어로 검증한다.
- [ ] 용어 참고로 새로 번역한 문장은 AI_TRANSLATION이다. 단어 하나의 공식 출처가 문장 전체의 OFFICIAL_GUIDE 근거가 되지 않는다. SAFETY는 기존 verified 전체 문장 HIT만 허용하며 glossary로 안전 fallback을 만들지 않는다.
- [ ] `(canonical_ko, category, phrase_type)`로 용어를 묶고 언어별 번역과 원본 phrase_key를 보존한다. 현재 category/phrase_type 충돌은 없지만 새 데이터의 중복·동음이의와 번역 충돌은 검사한다. 번역이 서로 충돌하면 임의 첫 행 선택을 하지 않는다. 씨앗/씨앗뿌리기처럼 한쪽 언어만 있는 다른 표제어를 합치지 않는다. P0 밖 작업의 용어가 있다는 이유로 새 task code를 허용하지 않는다.
- [ ] 부족한 양파·딸기 용어와 단위만 기존 테이블에 추가하는 데이터 인계 목록을 만든다. DB write 전에 `supabase-postgres-best-practices`를 읽고 기존 source/review 제약을 보존한다. source 검증을 통과하지 못하는 자체 용어는 기존 공식 데이터에 verified=true로 넣지 않는다. 자체 참고자료가 필요하면 아래 사전 JSON 경로를 사용하고 권위 계약에 용도를 명시한다.

- [ ] 최초/보완/수량변경 모두 사용하는 `createRuntime` 경로에서 provider stub이 원문과 다른 수량을 반환하는 회귀를 먼저 만든다. schema 구조 검증과 원문 의미 검증을 구분한다.
- [ ] 기존 JSON 자료에 농업 용기 의미, 수사/단위 경계, 반례, 검수 상태를 확장한다. 우선 망·포대·자루·상자·바구니·개를 구분한다. 팩·무게·소수 허용은 현재 integer 계약과 실제 검수 범위를 확인한 뒤 별도로 다룬다.
- [ ] `만` 한 글자를 무조건 substring 검색하지 않는다. 기존 selector에 숫자와 단위가 만나는 문맥 조건을 최소한으로 추가하고 최대 8개 제한에서 단위 항목이 밀려나는지도 검사한다.
- [ ] 명확한 숫자+단위와 output이 충돌하면 수량 unknown, blocking QUANTITY로 남긴다. 보완의 현재 지시와 기존 structure를 함께 고려하고, 새 발화에 기존 수량이 없다는 이유만으로 지우지 않는다. schema invalid는 기존 422를 유지한다.
- [ ] `20만 개`가 원문이면 이를 `20망`으로 바꾸지 않는다. 원음이 이미 잘못 전사된 경우 사전으로 정답을 복구했다고 주장하지 않는다. 현재 STT 계약의 고정 농업 키워드/정답 힌트/사후 치환 금지는 유지한다.
- [ ] 단위 번역은 기존 DB의 검수된 작은 매핑을 우선 사용한다. 누락 단위는 농업 의미와 segment를 포함한 provider 번역 후 검증하되 공식 표시를 하지 않는다. 부족한 단위의 의미·반례 참고자료를 추가할 경우 기존 참고 JSON의 책임을 문서화하거나 `ai/references/quantity-units-v2.json`을 제안하고 AI_CONTRACTS에 먼저 연결한다. 정부 가이드 provenance와 혼용하지 않는다.
- [ ] 회귀 fixture에 DB의 WORK_TERM을 넣고, 전체 문장 exact MISS라도 provider가 관련 glossary를 받는지 검사한다. 예를 들어 물이 포함된 비안전 문장에는 vi 요청에 Nước, ne 요청에 पानी를 전달하고 반대 언어는 전달하지 않는다. 사전 없음·중복 충돌·미검수·단위 용어·자막·안전문장 MISS도 각각 검사한다. 최종 번역과 TTS 입력이 같은 문구인지 검증한다.
- [ ] 아래 대조군을 기존 평가 형식의 JSONL에 추가한다. 실제 발화 음성과 텍스트를 별도 채점한다.

| 입력/조건 | 기대 |
|---|---|
| `양파 20망`, `20 망`, `스무 망`, `이십 망` | value 20, unit 망 |
| `양파 20만 개`, `이십만 개` | value 200000, unit 개. 망으로 교정 금지 |
| `20망 말고 15망` | 변경 후보 15망 |
| `2번 밭에서 20망` | 위치 2번 밭, 수량 20망 |
| `몇 망인지 몰라` | unknown + blocking QUANTITY |
| `망에 담아`, `만큼`, `하지만` | 근거 없는 수량 생성 금지 |
| `상자 10개` | 명시된 용기 수 보존, 개수/상자 관계 손실 금지 |
| `한 상자에 20개씩` | 전체 목표량 20개로 단정 금지 |
| `양파 20망 캐서 창고로 옮겨` | 20망과 실행 작업 순서 보존 |
| 비수량 보완, 두 수량 충돌, 단위 누락 | 기존 값 유지 조건/질문 조건을 각각 확인 |

- [ ] Run: `node --test ai/tests/dialect-reference-runtime.test.mjs ai/tests/structure-runtime-v2.test.mjs ai/tests/worker-briefing-v2.test.mjs`. 실제 provider 평가는 동일 모델·prompt·입력·재시도 수로 사전 유무를 비교하고 새로운 결과 디렉터리에 기록한다.
- [ ] 합격: 핵심 대조군 value/unit exact match, 정상 만 숫자 오교정 0, unknown 추측 0, 변경 후 예전 목표량 잔류 0. 작은 합성 데이터 통과를 모든 실제 농업 음성 정확도로 일반화하지 않는다.

### 상세 작업 설명의 보존 검증

현재 구조는 순서가 있는 steps와 공통 location/quantity/deadline/notes를 표현한다. 조건 분기, 단계별 서로 다른 목표량·장소·마감의 독립 필드는 없다. 상세 설명은 description 또는 notes의 문장으로 보존될 수 있지만 분기 실행이나 여러 수량의 자동 변경이 보장되는 구조는 아니다. 입력 음성은 요청당 60초 이하이며 긴 녹음을 자동 분할하는 계약은 없다.

- [ ] 30~60초 상세 지시 fixture에 실행 행동, 방법, 선별 기준, 예외, 금지사항, 목표량, 장소, 마감을 각각 표시해 누락/추가/의미 반전 여부를 채점한다. 단계 개수나 요약 유사도만 평가하지 않는다.
- [ ] 예: `A밭 양파 20망을 수확해. 작은 것과 큰 것을 나누고, 상한 것은 오른쪽 바구니에 따로 모아. 젖은 것은 다른 양파와 섞지 마. 오전 11시까지 해.`에서 작은/큰 분류, 상한 것의 목적지, 섞지 말라는 금지, 시간, 목표량이 owner 확인·worker 텍스트·전체 TTS 모두에 남아야 한다. 이는 평가용 지시이며 공식 농작업 방법으로 제시하지 않는다.
- [ ] 현재 prompt는 금지를 실행 단계로 만들지 않고 관련 notes로 보존하도록 한다. 현재 TTS는 notes를 읽지 않으므로 금지사항 누락 위험이 있다. B의 context 포함 TTS 변경과 함께 검증하고, 중요 금지사항을 접힌 상세보기에서만 찾을 수 없도록 PRODUCT_SPEC/FE 표시 규칙을 정리한다.
- [ ] `작은 것은 A, 큰 것은 B`, `상자마다 20개씩 총 10상자`, `수확 후 분류하고 마지막에 운반`, `20망이라고 했는데 15망으로 해`를 독립 사례로 둔다. 문장 속 조건·관계·취소·순서를 그대로 보존한다. 총량과 용기당 수량을 혼동하거나 조건을 무조건 실행 지시로 바꾸면 실패다.
- [ ] 한 작업 안의 서로 다른 장소/목표량 때문에 단일 context가 충돌하면 농장주 보완 또는 작업 분리를 요구한다. 이번 작업에서 분기형 workflow나 새로운 단계별 스키마를 조용히 추가하지 않는다. 양파/딸기 혼합 지시는 기존 작물별 분리 gate를 유지한다.
- [ ] 작업별 영상은 공통 동작 예시다. 해당 농장주의 상세 조건을 영상이 그대로 시연한다고 표시하지 않는다. 실제 지시의 기준은 검증된 텍스트와 TTS이며, 영상과 명시 지시가 충돌하면 관련 영상을 제외하고 안내를 유지한다.
- [ ] 상세 지시에서 단계/번역 요청 수 증가에 따른 처리 시간도 측정한다. 60초 초과 녹음의 거부 및 보완 녹음 UX는 실제 제한과 일치해야 한다. 상세 지시 평가를 통과하기 전에는 긴 설명을 누락 없이 처리한다고 주장하지 않는다.

## 8. D — 화면 전환·DB 지연 줄이기

**Files:** `backend/app/main.py:588,961,1606,2046,2461,2583`, `backend/test_main.py`, `backend/test_temporary_team.py`, `backend/test_stored_delivery.py`, `src/webapp/WebApp.tsx`, `src/webapp/OwnerScreens.tsx`, `src/webapp/api.ts`.

**Consumes/Produces:** 기존 owner/member/session/briefing DTO 그대로. DB schema 변경 없이 우선 해결한다.

- [ ] 지연을 클릭→화면 표시, 인증, DB, STT, 구조화, 번역, TTS, RPC로 구분해 기록한다. 로그에는 path template·operation·소요 시간·조회 수·성공 여부만 남기고 token/원음/transcript/PIN은 남기지 않는다.
- [ ] sync DB 호출 구간에서 다른 coroutine이 멈추는 회귀를 만든다. 읽기 전용 async route는 `run_in_threadpool`로 동기 조회 묶음을 격리하거나 sync endpoint로 전환한다. 기존 coroutine direct-call 테스트와 맞춰 한 방식을 선택한다. 업로드/AI await가 있는 mutation은 함수 전체를 sync로 바꾸지 말고 DB 구간만 격리한다.

```python
# 현재 list_sessions의 실제 query를 비차단으로 실행하는 기본 형태.
# 동일 endpoint의 인증 및 다른 DB 구간도 함께 격리해야 한다.
from starlette.concurrency import run_in_threadpool
query = client.table("work_sessions").select("*").eq("farm_id", owner.farm_id).order("updated_at", desc=True)
sessions = row_data(await run_in_threadpool(query.execute))
```

- [ ] thread 전환 전 공유 client의 사용 경계와 query 객체 공유 여부를 확인한다. 요청마다 query 객체를 만들고 mutable builder를 서로 공유하지 않는다. 전역 rate-limit/idempotency state가 있는 mutation은 보호 없이 통째로 thread로 옮기지 않는다.
- [ ] owner 목록은 farm-scoped sessions 1회, 해당 session IDs의 versions 1회, links 1회로 가져와 메모리에서 묶는다. 조회 범위 안에서는 인증 제외 최대 3회, 필요 시 큰 ID 배열만 정해진 크기로 나눈다. legacy read·link 정렬·현재 version 선택을 보존한다.
- [ ] member 목록은 team/member/assignment 검증 3회 이후 sessions/versions/packages를 각각 일괄 조회한다. current-v2 기준 최대 6회이며 assignment 순서를 보존한다. 과거 version이거나 다른 farm package가 섞이면 반환하지 않는다.
- [ ] snapshot 중 version이 바뀌면 결과를 서로 섞지 말고 일관된 version을 재조회한다. 무제한 재시도 금지. 회귀에 조회 사이 게시 충돌과 cross-farm/cross-member를 포함한다.
- [ ] OwnerBriefScreen의 polling에 inFlight·active/generation 보호를 추가한다. 늦게 끝난 이전 언어/session 요청은 무시하고 unmount 후 상태 갱신을 막는다. owner team은 빠른 roster 응답을 느린 목록 때문에 함께 숨기지 않는다.
- [ ] 이미 읽은 작업의 로컬 화면 전환은 재인증/미디어/AI를 기다리지 않는다. 새 owner `/owner/new`의 session GET→start 직렬 경로는 기존 안전한 start resume API를 직접 사용하는 조건을 확인해 왕복을 줄인다. 관리 링크·기존 작업 복귀는 다른 팀을 자동 시작하지 않도록 보존한다.
- [ ] 새 loading/실패 상태에서 무기한 skeleton을 남기지 않는다. `WebApp`의 세션 조회 실패를 nullable state 하나로 삼키지 말고 재시도 가능한 오류로 구분한다.
- [ ] `PYTHONPATH=backend`로 아래를 실행하고 FE 관련 E2E를 수행한다. n=1/5/10 목록의 query count와 동시에 도착하는 health/다른 member 요청을 비교한다.

```powershell
backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_stored_delivery.py'
backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_temporary_team.py'
backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_main.py'
```

## 9. E — 게시 후 스토리보드 영상

**Files:** `src/webapp/OwnerScreens.tsx:146,269,303`, 기존 `src/webapp/api.ts:115` 재사용, `tests/webapp/full-p0-flow.spec.ts`, `tests/webapp/two-crop-team.spec.ts`.

**Consumes:** `api.getBriefing(sessionId, workerLocale)`가 읽은 저장 package.
**Produces:** 관리자 스토리보드의 재생 가능한 단계 영상. 추가 AI 생성/DB write/공개 endpoint 없음.

- [ ] current APPROVED 양파 수확·딸기 단계 fixture에서 StorySteps에 실제 video가 보이는 실패 검사를 먼저 만든다. draft와 published storyboard는 분리한다.
- [ ] 기존 `/brief`의 package를 재사용해 `step_sequence`로 연결한다. package session/version/language가 표시할 작업과 일치할 때만 렌더한다. 최신 version 차이가 나면 다시 조회하고 다른 version의 영상/내용을 조립하지 않는다.

```ts
const matchingPackage = brief?.session_id === session.session_id
  && brief.version === session.current_version
  && brief.language_code === workerLocale;
const video = matchingPackage
  ? brief.video.find(item => item.step_sequence === step.sequence)
  : undefined;
```

- [ ] controls/playsInline/captions와 error fallback을 기존 WorkerStepView 수준으로 맞춘다. video URL HEAD 200만으로 성공 판정하지 않고 loadedmetadata·실제 시간 진행을 검사한다.
- [ ] ONION_TRANSPORT, asset 없음, 검수 미통과, 네트워크 실패를 구분한다. 운반은 텍스트·TTS 정상 안내로 보이며 다른 단계의 영상을 빌려 붙이지 않는다. 내부 검수/보안 정보는 worker에 새로 노출하지 않는다.
- [ ] `current_assets()`의 조회 오류도 계약의 영상 fallback과 대조한다. 영상 카탈로그만 일시적으로 읽지 못했다면 안전한 video 없음으로 계속할 수 있지만, 중복/잘못된 자산 검증·안전 출처 실패·전체 DB 게시 장애를 catch-all로 숨기지 않는다.
- [ ] 영상 요청이 느려도 텍스트와 화면 이동을 먼저 제공한다. UI에서 해당 asset을 승인하거나 기존 package를 덮어쓰지 않는다.
- [ ] Run: `pnpm exec playwright test tests/webapp/full-p0-flow.spec.ts tests/webapp/two-crop-team.spec.ts` 및 승인/제외/404 fixture. CO_PRESENT·REMOTE·팀 배정이 같은 version의 영상/자막을 사용하는지 검사한다.

## 10. F — 60초 경계와 결과 불명 복구

**Files:** `src/webapp/api.ts:42,69,85,111`, `backend/app/ai.py:38`, `backend/app/p0_runtime.py:84`, `ai/lib/openai-requests.mjs`, `backend/app/main.py`의 draft/confirm/quantity 경로, 관련 unittest와 `ai/tests/openai-provider.test.mjs`, `ai/tests/bridge-core.test.mjs`.

- [ ] 60초는 FE 기존 계약이다. STT·구조화·bridge retry가 각각 새 60초를 소비하지 않도록 요청 시작의 monotonic deadline과 남은 시간을 공유한다. 서버 외부 작업 deadline은 FE보다 짧게 두고 commit/응답 여유를 남긴다. 초기 제안은 전체 AI/DB 사전 처리 50초이며 실제 측정 뒤 계약에 기록한다.
- [ ] provider fetch에 AbortSignal을 적용하고 bridge 재시도도 남은 예산 안에서만 수행한다. 검증 실패를 반복 호출로 숨기지 않는다. 오류는 AUDIO_UNCLEAR/SCHEMA_INVALID/PROVIDER_UNAVAILABLE 계약에 맞춰 구분한다.
- [ ] FE timeout이 서버 rollback을 뜻한다고 표시하지 않는다. draft confirm 결과 불명은 같은 draft 재확인/기존 조회로 복구한다. 수량 confirm 결과 불명은 최신 version과 요청 quantity를 비교해 반영 여부를 보여주고 다음 version을 무조건 생성하지 않는다.
- [ ] 초안 생성·보완·확정·수량 확정 재시도의 논리적 operation key와 입력을 유지한다. key 저장 범위는 현재 tab/operation이며 token·원음을 새 영속 저장하지 않는다. REMOTE 링크 RPC는 현재 중복 제거하지 않으므로 이 보장에서 제외하고, 결과 불명과 명시적 재발급을 안내한다.
- [ ] timeout 직후 재시도, 두 기기 동시 confirm, 서버 성공 후 응답 유실, pending 팀 만료를 회귀에 넣는다. RPC version lock·원자 게시·24시간 만료를 그대로 검사한다.
- [ ] `PYTHONPATH=backend`로 다음 회귀를 실행한다.

```powershell
backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_ai.py'
backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_p0_runtime.py'
backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_main.py'
node --test ai/tests/openai-provider.test.mjs ai/tests/bridge-core.test.mjs
```

## 11. G — TTS 캐시를 실제로 먼저 조회

**Files:** `ai/lib/worker-briefing-v2.mjs`, `ai/index.mjs`, `ai/bridge-core.mjs`, `backend/app/main.py:1413,1535`, `backend/test_main.py`, `ai/tests/worker-briefing-v2.test.mjs`, `ai/tests/bridge-core.test.mjs`, `docs/AI_CONTRACTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`.

- [ ] B의 수량·exact text 정합성을 먼저 완료한다. 잘못된 텍스트를 캐시하는 최적화를 먼저 하지 않는다.
- [ ] 기존 `(text_hash,language_code)`를 재사용한다. localization/text 구성과 synthesis를 private transport에서 분리해 BE가 검증된 exact text의 cache를 먼저 읽는다. 최소 private 확장안은 `SYNTHESIZE_TTS` operation `{text,language_code}`이며 raw identity를 받지 않는다. 기존 BUILD operation의 text-only 동작과 응답 형태를 AI_CONTRACTS에 먼저 확정한다.
- [ ] HIT는 새 TTS 호출 없이 기존 audio URL을 구성한다. MISS만 Node 합성을 호출하고 성공 bytes를 upsert한다. 안전 gate·language 검사·text/hash 비교·크기 제한은 그대로 둔다.
- [ ] cache 장애/생성 실패는 기존 FALLBACK/TEXT로 처리하며 version 게시를 막지 않는다. 실패 audio를 READY로 기록하지 않는다. 같은 hash에서 단순 voice 변경을 반영할지 여부는 이번에 새 cache 규칙으로 확장하지 않는다.
- [ ] 테스트에서 동일 text+language HIT의 synthesize 호출 0회, MISS 1회, vi/ne 구분, 수량 변경으로 text/hash 변경, provider 실패 fallback을 assertion으로 검사한다.
- [ ] 번역 병목은 검수 단위·고정 제목 매핑과 동일 요청 내 중복 제거부터 줄인다. Node 프로세스 상주화·전역 translation cache·작업 큐는 이 결과를 측정한 뒤 별도 판단한다.

## 12. H — 통합 검증과 출시 판단

실행자는 실제 수정 후 아래를 기록한다. 이번 조사에서는 전체 회귀·유료 provider 평가·실기기 평가를 새로 수행하지 않았다.

```powershell
pnpm run check:contracts
pnpm build
pnpm run test:web
node --test ai/tests/worker-briefing-v2.test.mjs ai/tests/dialect-reference-runtime.test.mjs ai/tests/structure-runtime-v2.test.mjs
$env:PYTHONPATH = 'backend'
backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_*.py'
```

- [ ] 변경한 각 회귀가 수정 전 실패/수정 후 성공함을 확인하고 통합 시 위 검증을 실행한다. `LIVE_E2E`가 켜져 있는지 먼저 확인해 로컬 회귀와 유료 실서비스 실행을 구분한다.
- [ ] 실제 Android Chrome·iPhone Safari·사용자가 사용한 인앱 브라우저에서 vi/ne, READY 서버 음성/음성 불가/영상 실패를 각각 확인한다. 사용자 기기 종류를 모르면 인앱 브라우저는 미검증으로 남긴다.
- [ ] 농장주 작성/확정/스토리보드/변경, 근로자 QR/배정/1단계/음성/이전·다음, CO_PRESENT와 REMOTE를 각 3회 확인한다. `20망 → 15망 → 10망`에서 카드뿐 아니라 본문·실제 음성·자막에 이전 목표량이 남지 않는지 듣고 읽는다.
- [ ] 시작 클릭부터 화면 표시/소리 시작을 별도로 측정한다. **제안 목표:** 이미 받은 데이터의 단계 이동 p95 200ms 이내, warm 조회 p95 2초 이내, 준비된 음성 클릭→재생 p95 2초 이내. 초기 다운로드·cold start·STT/publish는 분리 측정하고 목표 달성을 현재 사실처럼 주장하지 않는다.
- [ ] owner 1명/member 1·5·10명과 작업 수 1·5·10건에서 polling 중 목록·미디어·health 지연을 측정한다. 지연을 숨기려고 polling을 과도하게 줄이거나 최신 버전 확인을 생략하지 않는다.
- [ ] 새 version은 foreground 5초 polling 또는 focus 갱신 후 반영되고 재확인이 필요해야 한다. 동일 version은 단계·음성을 초기화하지 않아야 한다. 화면 종료 시 구음성·늦은 callback·카메라가 남지 않아야 한다.
- [ ] 401/403/404/409/410/422/429/503, 24시간 만료, 타 팀 접근, 음성 권한 거절, 재생 차단, media 404, 유실 응답을 검사한다. 구버전 acknowledgement나 자동 확인 저장을 허용하지 않는다.
- [ ] 운영 FE/BE revision이 같은 릴리스를 가리키는지 확인한다. DB 자산 존재, URL 성공, 실제 decode, package 연결을 각각 검사한다. 과거 `9/9 PASS` 기록을 이번 수정의 검증으로 대신하지 않는다.
- [ ] 기존 DB의 잘못된 immutable package를 자동 재작성하지 않는다. 영향받은 활성 작업은 농장주가 정확한 새 지시/수량을 확인하여 새 version 또는 새 WorkSession으로 전달하는 복구 절차를 안내한다.

## 13. 최종 인계물

- 각 작업의 변경 파일, 실패→성공 회귀, 관련 계약 diff, 운영 미검증 항목.
- 값·단위·본문·TTS 정합성 결과와 실제 음성 평가를 구분한 기록.
- 성능은 cold/warm, API/AI/미디어, 표본 수와 p50/p95를 포함한 비교.
- 영상은 승인 자산/정책 제외/연결 오류/재생 오류를 분리한 결과.
- 문서/계약/구현 완료와 배포/실기기 완료를 별도로 표시한다. 계획 문서 작성만으로 결함 해결을 선언하지 않는다.
