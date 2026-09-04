# PIN 노출 정리와 업무 변경 확장 계획

## 2026-09-04 오류 우선 수정 결과

사용자가 지정한 7개 항목은 `codex/ux-error-fixes` 작업 트리에 반영했다. 아래 확장 계획과 구분하며 배포 완료를 의미하지 않는다.

- 토큰 없는 `/worker`는 QR·참여 링크 화면으로 진입하며 이름 입력을 먼저 표시하지 않는다.
- 참가 QR·작업 전달 화면에서 PIN과 관리 링크를 제거했다. 기존 `TeamAccess`는 농장주 홈의 기본 접힌 `팀 관리 정보`로 이동했다. 아래 Task 2의 마스킹/전달 화면 안내 제안은 이번 사용자의 완전 제거 요청으로 대체한다.
- 작업 전환 시 이전 발급 링크를 초기화하고, 표시하는 링크의 `session_id`도 현재 작업과 비교한다.
- 변경 안내는 작업 ID와 현재 버전·확인 기록에 맞춰 표시하고, 해당 버전 확인 뒤 해제한다.
- 새 수량 녹음·해석은 이전 후보를 폐기한다. 재녹음 마이크 권한 대기 중 이전 녹음 제출, 보완 처리 중 닫기·확정, 변경 중 중복 입력을 차단했다.
- 시작 화면의 `기존 작업팀 들어가기`에서 같은 서비스의 관리 링크를 입력하면 기존 PIN 화면으로 연결한다. PIN 단독 팀 검색은 추가하지 않았다.
- 확정 전에 장소·수량·시간·모든 단계 설명·메모를 펼쳐 표시한다.

함께 수정한 오류는 로그아웃 대기 상태 잔류, 같은 팀 초안 복구, 상세 조회 로딩/실패 구분, 화면 이동 후 늦은 응답, 수량 충돌·응답 불확실 시 최신 조회, 전체/단계 음성 구분 및 재생 정리다. 기존 API·DB 구조와 안전 게시 검증은 유지했다.

검증: 최종 `pnpm run test:web` 71/71 통과, `pnpm run build`, `pnpm run check:contracts`, `git diff --check` 통과. 추가 회귀는 수정 전 실패를 확인했고 재녹음·보완 경합도 포함했다. 로컬 mock 브라우저에서 시작→기존 팀 진입, `/worker`, 확정 전 상세, 전달·참가 QR 화면을 직접 확인했다. 이 증거는 운영 배포나 실제 STT·번역 품질 검증을 대신하지 않는다. 업무 변경 확장(Task 1·3·4·5·6)은 미구현 계획으로 남는다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 문서는 조사와 제안이며 현재 제품 계약을 대체하지 않는다.

**Goal:** 농장주의 팀 복귀 수단을 유지하면서 관리 비밀번호의 상시 노출을 없애고, 게시 후 수량 변경을 같은 작물의 업무 내용 변경으로 확장한다.

**Architecture:** 기존 owner cookie/PIN 인증과 WorkDraft, immutable WorkVersion, vi/ne package 게시 경로를 재사용한다. 변경용 초안에는 대상 작업과 기준 버전을 연결하며, 농장주가 확인한 뒤 같은 WorkSession의 다음 버전으로 원자 게시한다. 새 계정 체계나 범용 JSON Patch 엔진은 추가하지 않는다.

**Tech Stack:** React 18 / TypeScript / Vite, FastAPI / Python, Node AI bridge, PostgreSQL, Playwright / node:test / unittest.

**Spec:** `AGENTS.md`, `CONTEXT.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/openapi.yaml`, `docs/AI_CONTRACTS.md`, `docs/DATA_MODEL.md`, `docs/SAFETY_POLICY.md`, `docs/FAILURE_MODES.md`, `docs/EVALS.md`, `docs/BACKLOG.md`. 구현 전 Task 1에서 이 권위 문서들을 동기화한다.

**조사 기준:** 2026-09-04, HEAD `ff68b95`와 현재 작업 트리의 정적 코드 추적. 운영 배포 revision·실사용 화면·실제 인증은 이번 조사에서 실행하지 않았다. 제품 코드와 기존 계약은 수정하지 않았다.

**후속 UX 점검 반영:** 사용자의 병렬 전수 조사 요청으로 [전체 UX 보고서](../../../.impeccable/critique/2026-09-04T01-25-40Z__src-webapp-webapp-tsx.md)를 추가했다. PIN 마스킹뿐 아니라 시작 화면의 `기존 작업팀 들어가기`, 같은 기기 `내 작업팀 이어하기`, 로그아웃 전 복귀정보 보관과 인증 후 원래 작업 복귀를 Task 1·2에 포함한다. 일반 업무 변경 확장 전에 기존 작업 링크 혼선, 근로자 일반 진입, 확정 전 상세 지시 누락, 이전 수량 후보 확정 문제를 우선 수정한다. 후속 보고서의 운영 화면 관찰·로컬 재현 범위는 해당 보고서를 따른다.

## 1. PIN의 현재 역할과 노출 판단

- 신규 농장주는 PIN 입력 없이 시작한다. `/owner/start`가 작성 cookie를 발급하며 첫 게시가 팀을 활성화한다.
- PIN은 활성 팀의 농장주 관리 권한을 다른 브라우저에서 복구하는 6자리 비밀번호다. `/owner/manage/{team_id}`와 PIN을 함께 사용한다. PIN만으로 팀을 검색하지 않는다.
- 같은 기기에서는 signed HttpOnly cookie로 관리한다. 수량 변경, 작업 추가, QR 표시 때마다 PIN을 입력하는 구조가 아니다.
- 팀은 첫 확정부터 정확히 24시간 유효하다. 작업 추가·변경과 QR 재발급으로 PIN이나 팀 만료가 바뀌지 않는다.
- 근로자는 QR의 초대 토큰으로 들어와 별명·vi/ne만 제출한다. PIN은 근로자 참여·작업 확인에 필요하지 않으며 worker DTO의 데이터도 아니다.
- 구형 농장 코드+PIN 인증은 호환 API로 남아 있지만 신규 화면 흐름은 팀 관리 링크+PIN이다.

근거:

| 근거 | 확인한 동작 |
|---|---|
| `backend/app/main.py:1005` | 서버 비밀값과 팀 ID로 6자리 PIN을 재구성한다. |
| `backend/app/main.py:1010` | ACTIVE owner 응답에만 관리 URL/PIN을 넣는다. |
| `backend/app/main.py:1755` | 팀 ID+PIN 인증 성공 시 관리 cookie를 발급한다. |
| `src/webapp/WebApp.tsx:69` | 관리 링크에서 복귀하는 농장주에게 PIN 입력을 요청한다. |
| `src/webapp/OwnerScreens.tsx:163` | `TeamAccess`가 PIN 원문과 관리 URL을 표시하고 함께 복사한다. |
| `src/webapp/OwnerScreens.tsx:220,296` | 해당 카드가 오늘 작업팀과 작업 전달 화면에 상시 삽입된다. |

**판단:** PIN 자체는 현재 계정 없는 복귀 방식에 필요하다. 모든 이용자에게 또는 전달할 때마다 노출할 필요는 없다. 특히 QR을 보여주는 화면에 관리 비밀번호와 링크가 함께 보이는 것은 불필요한 노출이다. 공개 API 유출을 재현했다는 뜻은 아니며, 농장주 화면을 근로자와 함께 보는 상황의 노출 문제다.

**권장 UX:**

1. 첫 확정에는 “다른 기기에서 이어하려면 관리 정보를 보관하세요”라는 짧은 안내와 진입 버튼을 제공한다. 보관은 작업 전달을 막는 필수 단계로 만들지 않는다.
2. 실제 PIN·관리 링크는 농장주 전용 “다른 기기에서 이어하기” 영역에서 명시적으로 열어 본다. 기본은 닫힘, PIN은 기본 마스킹, “비밀번호 보기”와 “관리 정보 복사”를 제공한다.
3. QR·현장 함께 보기·근로자 화면으로 이동하면 관리 정보 영역을 닫고 원문을 화면에서 제거한다. QR 표시 중 관리 PIN을 동시에 펼치지 않는다.
4. 화면 명칭은 “관리 비밀번호(6자리)”. 근로자에게는 “참여 QR/참여 링크”만 전달한다. 새 팀을 시작할 때 기존 팀 관리 정보를 보관하도록 하는 안내는 유지한다.
5. 1차 변경에서는 기존 owner 응답과 인증 API를 유지한다. 화면 마스킹은 인증 강화가 아니라 시각적 노출 축소다. PIN 완전 폐지는 복귀 수단을 먼저 정하는 별도 작업이다. 관리 링크 하나만으로 인증시키면 링크 자체가 비밀이 되므로 자동으로 더 안전해지지 않는다.

## 2. 업무 변경 가능 여부와 범위

**기술적으로 가능하다. 버튼명만 변경하는 작업은 아니다.**

- FE `OwnerChangeScreen`은 `QuantityChangePreview`만 받고 수량만 확인한다 (`OwnerScreens.tsx:343`).
- API `/quantity-changes/from-audio`, `/quantity-changes/confirm`은 수량 전용이다 (`main.py:2087,2132`).
- AI `PARSE_QUANTITY_CHANGE`는 현재 전체 작업 없이 transcript/expected_version만 받는다. 출력 schema는 quantity와 QUANTITY ambiguity만 표현한다.
- `replace_quantity_for_v2`는 state의 quantity만 바꾼다 (`main.py:751`). 설명에 포함된 옛 수량의 정합성까지 보장하지 않는다.
- 게시 전에는 이미 전체 structure-v2 초안과 음성 supplement가 존재한다 (`main.py:1847,1913`). 단계·장소·수량을 표현하는 구조를 재사용할 수 있다.
- `publish_work_version_with_packages`는 완성된 전체 state와 vi/ne package를 게시할 수 있다. 다만 현재 draft가 있으면 신규 작업만 만들고, 변경 시 session의 location은 갱신하지 않는다. 이 분기는 수정해야 한다.
- worker는 이미 버전 증가를 감지하고 확인 버전과 현재 버전을 비교한다. 기존 배정과 링크가 같은 session을 가리키므로 업무 변경에도 재사용할 수 있다.

### 권장 1차 범위

- 양파 또는 딸기 각각의 기존 작업에서 단계 추가·삭제·교체·순서, 장소, 수량/단위, 마감, 메모를 음성으로 변경한다.
- 수량 변경은 업무 변경의 한 사례로 계속 지원한다.
- 예: “양파 수확은 빼고 선별만 해줘”, “장소는 2번 밭으로 바꿔”, “딸기 선별 다음에 포장도 해줘”, “20망 말고 15망으로 바꿔”.
- 작물 변경은 기존 작업을 덮어쓰지 않고 새 작업 작성으로 안내한다. 양파→딸기 전환까지 같은 작업의 변경으로 취급하는 범위는 이번 제안에 포함하지 않는다.
- 같은 WorkSession에 배정된 모든 근로자와 유효한 언어별 링크에 변경이 적용됨을 확인 화면에 명시한다. 특정 근로자만 다른 업무를 맡는 것은 새 작업 작성·개별 배정 흐름이다. 기존 배정을 자동 취소하지 않는다.
- 안전 관련 입력도 해석·재검증하지만 안전 gate를 통과하지 못하면 게시하지 않는다. 기존 override 사유는 새 변경의 승인으로 자동 승계하지 않는다.

### 대안 비교

| 방식 | 판단 |
|---|---|
| 기존 작업에서 변경 초안 생성 후 같은 session의 새 버전 게시 | 권장. 링크·배정·확인 흐름을 유지하고 필요한 변경만 말할 수 있다. |
| 새 작업을 만들고 다시 배정 | 구현은 가장 적다. 완전히 다른 작물/별도 업무에 적합하다. 기존 링크는 옛 session에 남으므로 일반적인 “업무 변경”의 대체는 아니다. |
| 임의 필드 편집기·범용 patch 엔진 구축 | 현재 필요하지 않다. 기존 음성 보완과 구조화 계약으로 해결한다. |

## 3. 구현 순서

### Task 1 — 계약과 제안 범위 동기화 / 주담당 BE

**수정 파일:** 위 Spec 문서, `README.md`, `DEMO.md`. 기존 `docs/superpowers/plans/2026-09-04-navigation-media-quantity-remediation.md`의 수량 정합성 작업과 중복 구현하지 않도록 참조를 연결한다.

- [ ] `AGENTS.md`의 “수량 변경만”과 제품 명세의 P0 범위를 이번에 채택할 업무 변경 범위로 먼저 바꾼다. 두 작물·두 언어는 유지한다. 승인되지 않은 범위를 이미 지원한다고 쓰지 않는다.
- [ ] `CONTEXT.md`에 같은 WorkSession의 변경 초안·버전 의미를 반영한다. `WorkDraft`를 재사용하며 다른 lifecycle을 만들지 않는다.
- [ ] 제품 명세에 PIN 노출 조건, 전체 배정에 미치는 변경 영향, 변경 전후 확인, 새 작물 안내, 취소/충돌/실패 동작을 기록한다.
- [ ] API/저장 제안: 변경용 `WorkDraft`에 nullable `target_session_id`, `base_version`을 추가한다. 두 값은 함께 null(신규 작업)이거나 함께 존재(기존 작업 변경)한다. 원문과 보완 내역은 owner 감사용으로 보존한다.
- [ ] `POST /api/v1/work-sessions/{sessionId}/changes/from-audio`를 정의한다. 입력은 audio, language_hint, expected_version이며 owner cookie/exact Origin으로 대상 최신 state를 서버에서 읽는다. 응답은 확장된 WorkDraft다. 미리보기 단계에서는 초안만 저장하고 published version은 만들지 않는다.
- [ ] 기존 draft 조회/supplement/confirm을 재사용한다. confirm은 `expected_draft_revision`과 `expected_version`을 확인하며 신규 작업은 0, 변경은 base_version이다. 기존 신규 요청 호환은 유지하되 변경 초안에는 두 비교값을 필수로 한다. 응답은 기존 게시 envelope를 재사용한다.
- [ ] `DATA_MODEL`, `ARCHITECTURE`에 draft/session lock, 초안 소비, snapshot/package 원자 게시, session location 동기화를 기록한다. 원문 저장은 worker 응답과 분리한다.
- [ ] `AI_CONTRACTS`, `FAILURE_MODES`, `EVALS`에 전체 지시 정합성, 취소/교체 의미, 모호함·위험 재검증과 401/403/404/409/422/503을 명시한다. UI만 마스킹할 때 owner 응답에서 PIN을 제거한다고 쓰지 않는다.
- [ ] BACKLOG 행을 계약 BE, PIN FE, AI 변경 해석 AI, 게시 BE, 변경 UI FE, 통합 검증 BE로 나누어 각 행에 primary owner 하나만 둔다.

### Task 2 — PIN 상시 노출 제거 / 주담당 FE

**수정 파일:** `src/webapp/OwnerScreens.tsx`, `src/webapp/WebApp.tsx`, `tests/webapp/temporary-team.spec.ts`. 별도 인증 시스템은 추가하지 않는다.

- [ ] `TeamAccess`의 관리 비밀번호를 기본 마스킹하고 명시적 보기/복사 동작으로 옮긴다. 실제 PIN 문자열을 단순 CSS 숨김 요소나 aria-label로 남기지 않는다.
- [ ] 작업 전달 화면에서는 관리 정보 원문 카드 대신 짧은 보관 안내/진입 버튼만 제공한다. 오늘 작업팀의 QR 표시와 관리 정보 표시는 분리한다.
- [ ] 다른 화면으로 이동하거나 참여 QR을 표시할 때 열린 관리 정보와 복사 완료 메시지를 초기화한다. 키보드 조작과 포커스 복귀를 유지한다.
- [ ] 기존 복귀 E2E에서 관리 정보 열기/비밀번호 보기 후 값을 읽도록 변경한다. 기본 전달/QR 화면에는 PIN 원문이 없고, 다른 browser의 관리 링크+PIN 복귀는 계속 성공해야 한다.

검증: `pnpm exec playwright test tests/webapp/temporary-team.spec.ts`.

### Task 3 — 변경 음성으로 전체 초안 생성 / 주담당 AI

**수정 파일:** `ai/bridge-core.mjs`, `ai/lib/openai-provider.mjs`, `ai/prompts/prompt-structure-supplement-002.md`, 관련 `ai/tests/structure-runtime-v2.test.mjs`, `ai/tests/openai-provider.test.mjs`, `ai/tests/bridge-core.test.mjs`.

- [ ] 구현자는 `prompt-engineering-patterns`, 평가자는 `llm-evaluation`을 적용한다. 현재 `MERGE_SUPPLEMENT_V2`의 structure+transcript 입력과 structure-v2 출력을 먼저 재사용한다.
- [ ] “추가” 외에 명시적 삭제·교체·순서 변경을 처리한다. “수확 말고 선별만”이면 기존 수확을 남기지 않는다. 말하지 않은 값/unknown은 유지하며 실제 취소한 수량을 다시 쓰지 않는다.
- [ ] 변경 결과의 quantity, summary, 단계 설명, 메모에 서로 모순되는 지시가 남지 않게 한다. 무차별 숫자 문자열 치환은 쓰지 않는다. 서로 다른 대상 수량의 관계가 불분명하면 blocking QUANTITY로 보완한다.
- [ ] full state의 family/code 일치와 위험을 재검증한다. 변경문만 보고 기존 위험 작업을 LOW로 낮추지 않는다. 과거 override를 새 변경의 자동 승인으로 취급하지 않는다.
- [ ] 두 작물, 단계 교체·추가·삭제·순서, 장소, 수량, 모호 지시, 위험 입력의 고정 사례를 추가한다. 실제 provider 평가 결과와 stub 계약 검사를 구분해 기록한다.

검증: `node --test ai/tests/structure-runtime-v2.test.mjs ai/tests/openai-provider.test.mjs ai/tests/bridge-core.test.mjs`.

### Task 4 — 변경 초안과 원자 게시 / 주담당 BE

**수정 파일:** `backend/app/main.py`, `backend/test_main.py`, `backend/test_contracts.py`, `backend/test_stored_delivery.py`, `backend/test_temporary_team.py`.
**신규 파일 제안:** `supabase/migrations/202609040019_work_change_drafts.sql`, `supabase/tests/work_change_drafts.sql`. 구현 시 019가 이미 사용 중이면 다음 migration 번호를 사용한다. 기존 migration은 수정하지 않는다.

- [ ] DB 작업 전에 `supabase-postgres-best-practices`를 적용한다. work_drafts에 target/base 필드를 추가하고 같은 Farm의 대상, 양수 base_version, 두 필드의 동시 존재를 검증한다. 새 권위 문서는 필요하지 않으며 기존 DATA_MODEL/OpenAPI가 이 계약을 소유한다.
- [ ] changes/from-audio에서 인증·최신 버전·v2·만료를 확인하고 서버가 읽은 snapshot을 MERGE_SUPPLEMENT_V2에 전달한다. base_version은 AI가 결정하지 않는다. raw audio는 기존 finally 정리 경로로 폐기한다.
- [ ] draft 조회·보완에도 대상 team/farm·만료·confirmed 여부와 stale base_version 검사를 적용한다. stale 변경은 자동 병합하지 않고 409와 최신 내용 확인을 제공한다.
- [ ] confirm/RPC가 신규 초안과 변경 초안을 구분하도록 한다. 초안 revision·target/base, session current_version을 lock 안에서 재검증한다. 보완과 확정의 경합도 draft lock으로 보호한다.
- [ ] 신규 변경 state를 최초 게시와 같은 schema/allowlist/ambiguity/safety gate로 검증하고 vi/ne 번역·TTS·영상 매칭을 새 버전에 맞춰 재생성한다. 승인 LOW 사전 생성 영상만 사용하며 ONION_TRANSPORT 영상 제외는 유지한다.
- [ ] version/package 삽입, 이전 버전 supersede, session current_version/location 갱신, 초안 소비와 확인 감사를 한 트랜잭션에 넣는다. 실패 시 기존 published 내용은 유지한다. 새 팀이나 링크를 만들지 않고 PIN·QR·각 만료도 유지한다.
- [ ] 같은 변경 초안의 확인 재시도가 새 버전을 중복 생성하지 않도록 소비 기록을 확인한다. header 존재 확인만으로 idempotency가 보장된다고 간주하지 않는다. 결과가 불명확한 timeout은 현재 session 조회로 게시 여부를 복구한다.
- [ ] 기존 수량 API는 구 클라이언트 호환용으로 유지한다. 양 경로의 전체 지시 정합성과 게시 검증을 공유하고 새 UI는 업무 변경 경로를 사용한다. 기존 quantity-change-v1에 업무 필드를 몰래 추가하지 않는다.

검증: backend 가상환경에서 `python -m unittest discover -s backend -p 'test_*.py' -v` (`PYTHONPATH=backend`). 별도 테스트 DB에서 새 SQL 검증 파일을 실행한다. 운영 DB를 테스트 대상으로 사용하지 않는다.

### Task 5 — 변경 전후 확인과 근로자 반영 / 주담당 FE

**수정 파일:** `src/webapp/OwnerScreens.tsx`, `src/webapp/WebApp.tsx`, `src/webapp/contracts.ts`, `src/webapp/api.ts`, `src/webapp/mock-api.ts`, 필요 시 `src/webapp/WorkerScreens.tsx`의 미디어 정리, `tests/webapp/version-propagation.spec.ts`, `tests/webapp/full-p0-flow.spec.ts`, `tests/webapp/temporary-team.spec.ts`.

- [ ] `수량 변경`을 `업무 변경`으로 바꾸고 변경할 작업의 전체 현재 내용을 표시한다. `VoiceRecorder`, 기존 draft 보완/확인 UI와 `StorySteps`를 재사용한다.
- [ ] 변경 전후의 단계·순서·장소·수량·마감·메모를 비교하고 “이 작업을 배정받은 모든 근로자에게 반영됩니다”를 표시한다. 추출 실패·불확실한 상태에서는 확정 버튼을 열지 않는다.
- [ ] 최종 버튼은 `변경한 업무 전달하기`. 확정 전에는 worker 화면 불변, 취소 시 기존 작업 복귀, 새로고침 시 유효 초안 복구를 제공한다.
- [ ] `OwnerStoryboardScreen`의 “수량 A에서 B로” 전용 변경 안내를 실제 변경 필드 요약으로 대체한다. 단계가 바뀌었는데 수량만 바뀌었다고 알리지 않는다.
- [ ] 기존 worker version polling/acknowledgement를 재사용한다. 버전 변경 시 재생 중인 옛 audio/video를 정리하고 최신 단계부터 다시 보여준다. 자동 조회는 확인 처리하지 않는다.
- [ ] mock에 실제 API와 같은 변경 의미를 반영한다. mock 성공만으로 실제 DB transaction이나 AI 품질을 통과했다고 판단하지 않는다.

검증: `pnpm run check:contracts`, `pnpm run build`, `pnpm exec playwright test tests/webapp/version-propagation.spec.ts tests/webapp/full-p0-flow.spec.ts tests/webapp/temporary-team.spec.ts`.

## 4. 완료 판정

- PIN은 전달/QR 기본 화면에서 원문 비노출. 농장주가 명시적으로 열어 보관할 수 있고 관리 링크+PIN 복귀는 유지된다. 근로자는 끝까지 PIN을 입력하지 않는다.
- 양파 수확→선별, 딸기 선별+포장 추가, 단계 삭제/순서 변경, 장소 변경, 20망→15망 각각이 변경 전후 확인과 정확히 한 번의 다음 버전 게시를 통과한다.
- 수량 필드뿐 아니라 설명·요약·vi/ne 문장·TTS 입력에도 취소된 옛 지시가 남지 않는다. TTS hash 변경만으로 의미 정확도를 판정하지 않는다.
- CO_PRESENT, 기존 REMOTE 링크, 기존 팀 배정이 같은 최신 버전을 보여준다. 팀 PIN·QR·팀 만료와 기존 링크 만료는 바뀌지 않는다.
- 해당 작업을 확인했던 근로자는 변경 후 재확인이 필요하다. 다른 WorkSession의 확인 기록은 유지된다. 구버전 확인은 409다.
- 모호한 교체, 두 작물 혼합, 지원 밖 작물, HIGH/UNKNOWN, 안전 ambiguity, 잘못된 schema, 빈 실행 단계, 타 Farm, 만료, 동시 변경, 번역 실패에서 게시가 거부되고 이전 게시 내용이 보존된다. TTS 단독 실패는 기존 TEXT fallback을 유지한다.
- 이 문서는 계획만 완료한 상태다. 테스트/DB migration/AI 평가/배포는 구현 단계에서 실행하고 결과를 별도로 기록한다.
