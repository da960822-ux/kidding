# 밭머리 현장 UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고령 농장주와 vi/ne 근로자의 작업 정확성·입력 보존·읽기·조작을 방해하는 문제를 우선 개선한다. 27개 피드백은 추적 목록이며 전부 구현하거나 정부 가이드 수치를 일괄 적용하는 목표가 아니다.

**Architecture:** React 화면과 기존 API를 유지한다. 새 HTTP 계약은 인증된 WorkDraft 조회 1개를 제안하고 기존 저장소를 재사용한다. 전체 작업 음성 계약을 유지하며 FE의 재생 범위·상태·오류를 통일한다.

**Tech Stack:** React 18, TypeScript, Tailwind, Vite, Playwright, FastAPI, unittest, 기존 Supabase 저장소, Node AI bridge.

**Spec:** [현장 UX 디자인 계획](../specs/2026-09-04-field-ux-design.md)

**Status:** 사용자 승인 후 선택 항목을 구현·검증했다. DB migration과 AI 계약 변경은 하지 않았다.

**Execution note (2026-09-04):** 선택 항목을 적용했다. T1 다른 WorkSession 전환, T3 실제 발급 언어 표시·동일 언어 재발급 확인, T4 같은 Farm의 유효·미확정 v2 draft `GET` 복구(`no-store`, 원음 미복구), T5 전체 듣기와 단계 문맥/명시형 이전·다음, T6 재녹음 시작 실패 시 기존 원음 유지·빈 안전 안내 중립 표기, T7 전체 작업 목록, T9 검증된 안전 출처 링크를 구현하고 회귀 검사를 추가했다. 전면 타이포그래피 조정·실사용 테스트는 별도 검증으로 남긴다. 새 DB migration과 AI schema/provider 계약은 추가하지 않았다.

## Global Constraints

- 양파·딸기와 수량 변경. 근로자 전달 언어는 vi/ne만 지원한다.
- AI는 추측하지 않는다. 결정은 농장주가 한다.
- WorkDraft는 확정 전 상태다. PUBLISHED WorkSession과 PUBLISHED/SUPERSEDED WorkVersion 의미를 바꾸지 않는다.
- HIGH/UNKNOWN, safety ambiguity, schema invalid, auth/version conflict, no executable step은 우회하지 않는다.
- 영상은 AI_GENERATED_PREGENERATED·APPROVED·LOW만 사용한다. 새 직접 촬영 경로를 추가하지 않는다.
- 원음 장기 저장, 근로자 영구 계정, 전화번호, SMS, 읽음·이해·작업완료의 미측정 상태를 추가하지 않는다.
- 기존 source_detail만 표시한다. UI 가이드 조사와 농작업 안전 자료 검수는 별개다.
- 기존 신뢰 경계, signed cookie, farm scope, Origin, idempotency, expected version/revision 검증을 유지한다.
- 먼저 AGENTS→README→CONTEXT→PRODUCT_SPEC→ARCHITECTURE를 읽고, 역할별 필수 문서 및 스킬을 따른다.
- 모든 코딩 에이전트는 Ponytail full을 사용한다. 디자인은 Sol + Impeccable, 상태/API/회귀 검사는 Terra가 맡는다.
- 수정하지 않은 사용자 변경은 보존한다. 포맷 일괄 변경·화면 대분할·새 상태관리/플레이어 라이브러리를 추가하지 않는다.
- 모든 작업 행의 primary owner는 FE/BE/AI 중 정확히 하나다. 협업 역할이 주담당을 늘리는 것은 아니다.
- 새 테스트 프레임워크를 추가하지 않는다. 기존 3개 Playwright 파일을 확장한다.
- 계획의 글자·간격 수치는 정부 의무값이 아닌 밭머리용 후보다. 실제 사용자 테스트는 아직 실시하지 않았다.

## 1. 선행 결정과 채택안

- 사용자 요청에 따라 필요한 수정만 선택한다. 이 절의 범위 선택 규칙이 아래 T1–T9의 전체 후보 목록보다 우선한다.
- 첫 구현 대상으로 확인된 작업·언어·링크 착오, 입력 손실, 잘못된 안전·성공 안내, 미디어 재생 불일치 및 실제 읽기·조작 장애를 선택한다. 기존 접근성·보안·안전 요구는 유지한다.
- T1–T9는 관련 후보를 묶은 작업 단위이며 일괄 실행 지시가 아니다. 각 작업 시작 전에 선택한 피드백 번호와 재현 근거를 기록하고, 나머지는 보류한다. 계약 게이트·테스트도 선택한 변경의 영향 범위에만 적용한다.
- 문제 없는 본문·버튼 크기·색상·위치는 유지한다. 제목·버튼 수치 통일, 전면 여백 조정, 추가 공유 편의, 단계 위치 복원 등은 실사용 검증 또는 별도 채택 결정 후 진행한다.
- 전면 재디자인 대신 기존 화면 재배치·문구·상태 교정.
- 기본 화면을 쉽게 만든다. 별도 고령자 모드로 필수 기능을 숨기지 않는다.
- 본문 20px 유지. 제목 28px, 핵심값 24px/변경 비교 30px, 주요 버튼 최소 높이 56px는 문제가 있는 요소를 비교할 때 쓰는 후보이며 전체 화면에 강제하지 않는다.
- 전체 음성은 safety 전체 다음 전체 steps title/description. 브라우저 fallback도 같은 범위.
- 음성 제어의 필수 범위는 재생·정지·다시 듣기. pause/resume·속도 선택·단계 음성은 이번 최소안에 추가하지 않는다.
- 정상 remote 링크는 발급 package 언어 고정. 안내 언어 선택은 입구·unresolved·오류 복구에 적용.
- 새 draft GET은 기존 WorkDraft DTO 재사용. 새 테이블·schema·migration은 현재 제안에 없다.
- 초안 복구 실패는 새로운 생명주기 상태로 만들지 않는다.

## 2. 계약 정리 게이트 G0 — primary owner FE, root 조정

새 권위 문서는 만들지 않는다. 아래 기존 문서에서 필요한 부분만 수정한 뒤 관련 구현을 시작한다.

| 문서 | 선행 정리 |
|---|---|
| CONTEXT.md | 복구되어도 WorkDraft이며 새 도메인 상태가 아니라는 점. 용어 변경 필요 없으면 무수정 |
| docs/PRODUCT_SPEC.md | 복구 범위, 진입 안내 언어와 발급 언어 구분, 전체 듣기, 단계 복원, 상태 표현 |
| docs/ARCHITECTURE.md | 인증 GET·URL의 draft ID·서버 재조회·농장 경계 |
| docs/openapi.yaml | GET /api/v1/work-sessions/drafts/{draftId}, WorkDraft 재사용, 오류·no-store |
| docs/DATA_MODEL.md | 기존 expires_at·confirmed 의미, 전체 package TTS cache 설명 |
| docs/AI_CONTRACTS.md | 전체 safety+steps 음성 순서 재확인. 새 AI schema나 provider 변경 없음 |
| docs/SAFETY_POLICY.md | HIGH 금지와 UNKNOWN 정보 부족의 화면 설명 구분, 게시 gate 불변 |
| docs/FAILURE_MODES.md | 복구·미디어·언어·최신 조회·공유 취소·기록 중단 |
| docs/EVALS.md | 회귀·기기·언어별 사용자 검증 |
| docs/BACKLOG.md | T1–T9 주담당·선행조건·완료 기준 |
| DESIGN.md | 승인된 가독성·배치·문구·상태 규칙 |

중요한 기존 불일치: DATA_MODEL의 TTS 설명은 step별 음성처럼 읽히지만 PRODUCT_SPEC/AI_CONTRACTS는 전체 package 음성을 규정한다. 상위 계약을 확인해 문서를 동기화하고 T5를 진행한다. 정부 가이드 때문에 새 단계 음성 계약으로 바꾸지 않는다.

초안 만료 범위: 새 GET 복구는 기존 expires_at을 조회 허용 기한으로 사용한다. 기존 supplement/confirm의 만료 집행은 코드만 보고 완료됐다고 단정하지 않는다. 이 계획은 원자 publish RPC의 쓰기 만료 정책을 조용히 변경하지 않는다. 쓰기 만료 정책까지 변경하려면 별도 계약·DB 검토 작업으로 분리한다.

- [ ] 위 적용 문서의 충돌을 정리한다. 고령자 UI 문구를 농작업 안전 검증으로 취급하지 않는다.
- [ ] GET의 표·예제·오류와 FE 복구 상태를 같은 변경에서 고정한다.
- [ ] 아래 T1–T9 매핑을 BACKLOG에 연결한다.
- [ ] `pnpm run check:contracts`와 기존 계약 검사를 실행하고 기준 결과를 기록한다.
- [ ] 사용자 승인된 설계 및 계약과 다르면 구현을 시작하지 않고 차이를 보고한다.

## 3. 27개 피드백 추적표

전체 관찰 사항을 잊지 않기 위한 목록이다. 아래 인수 조건은 해당 항목을 구현 대상으로 채택했을 때만 적용한다. 보류한 항목을 완료로 표시하거나 실행 범위에 자동 포함하지 않는다.

| 피드백 | 작업 | Primary owner | 인수 조건 |
|---:|---|---|---|
| 1 | T1 | FE | 서로 다른 작업의 버전 숫자를 비교하지 않음 |
| 2 | T2 | FE | QR 입력 전·오류 화면 vi/ne 선택, 정상 package 언어 유지 |
| 3 | T3 | FE | 실제 발급 언어 표시, 교체 전 확인 |
| 4 | T4 | BE | 같은 농장 유효 초안 복구, 원음 비저장 |
| 5 | T5 | FE | 요약에서 전체 듣기, 모든 재생 경로 범위 일치 |
| 6 | T6 | FE | 기존 audio supplement로 게시 전 부분 보완 |
| 7 | T7 | FE | 모든 게시 작업을 목록에서 선택 |
| 8 | T6 | FE | 금지 작업과 정보 부족 설명 구분, gate 유지 |
| 9 | T9 | FE | 검증된 안전 출처만 정확히 연결 |
| 10 | T1 | FE | 단계에 장소·수량·시간, 실제 관찰한 전후 변경 표시 |
| 11 | T6 | FE | null·빈 safety를 안전함/해당 없음으로 추론하지 않음 |
| 12 | T6 | FE | 재녹음 시작 실패 시 기존 Blob 유지 |
| 13 | T6 | FE | 필수 검토 유지, 반복·장식 여백 축소 |
| 14 | T3 | FE | 행동 중심 제목, 번역 상세는 접근 가능한 펼침 |
| 15 | T3 | FE | 수량 변경 성공 명시, 전달/읽음 혼동 제거 |
| 16 | T7 | FE | 직접 진입의 로딩과 빈값·실패 분리 |
| 17 | T6 | FE | 코드·PIN 발급 안내 |
| 18 | T1 | FE | 동일 session/version 단계만 복원 |
| 19 | T5 | FE | 영상·원음 재생 오류와 대안 표시 |
| 20 | T5 | FE | 미디어 없음의 중립 상태 |
| 21 | T2 | FE | 인증된 참가와 배정 대기 구분, identity API 없음 |
| 22 | T8 | FE | 좁은 버튼 안 아이콘 압축 제거, 큰 타깃 유지 |
| 23 | T8 | FE | 명확한 focus·처리 상태 알림 |
| 24 | T8 | FE | 헤더 언어명 파편화 제거 |
| 25 | T3 | FE | 기본 공유·복사 대안·공유 취소 정상 처리 |
| 26 | T8 | FE | 건드린 상태색만 기존 토큰 정리 |
| 27 | T8 | FE | 제목 구조·접근성 언어·작업 맥락 홈 |

## 4. 파일 소유권과 실행 순서

| Lane | 실행 모델 | 소유 범위 | 병렬 조건 |
|---|---|---|---|
| BE 복구 | Terra | T4 backend/main·BE tests | G0 후 FE와 병렬 |
| FE 기능 | Terra | WorkerScreens, OwnerScreens, WebApp, api/mock, 기존 web tests | 한 writer가 T1→T2→T3→T5→T6→T7→T9 순서 |
| 디자인 준비 | Sol + Impeccable | 화면 명세·문구·검수 메모 | FE 기능 중 문서 검토만, 동일 TSX 수정 금지 |
| 디자인 적용 | Sol + Impeccable | T8 style/shell/UI 및 합의된 화면 위계 | FE 기능 통합 후 |
| 통합 | root | 계약·파일 소유권·검증·인계 | 충돌 조정 |

T4 FE 연결은 BE GET 검증 후 수행한다. WebApp·OwnerScreens·WorkerScreens와 세 Playwright 파일은 여러 작업이 공유하므로 FE 작업끼리의 무작정 병렬 수정은 금지한다. 읽기·설계·독립 BE 작업은 병렬로 진행한다.

실행 때 기존 미완료 변경을 확인하고 using-git-worktrees 절차로 격리한다. 현재 UX가 포함된 상태를 보존해야 하며 기본 브랜치만 새로 열어 이 계획의 근거를 잃지 않는다. 모델 사용 불가 시 임의 대체·usage reset을 하지 않고 알린다.

## 5. 공통 검증·리뷰 절차

각 task는 아래 독립 주기로 끝낸다.

- [ ] 해당 결함의 실패 재현 테스트를 먼저 추가한다.
- [ ] 명시된 좁은 테스트 명령으로 현재 구현의 실패를 확인한다.
- [ ] 기존 구현·API를 재사용해 최소 수정한다.
- [ ] 좁은 테스트와 관련 계약 검사를 다시 실행해 통과를 확인한다.
- [ ] 새로운 보호 로직이 인증·안전·version·원음 정책을 약화하지 않는지 diff를 검토한다.
- [ ] 구현 완료 시 그 task의 변경 파일만 구분해 인계한다. commit은 실행 정책에 맞춰 명시 경로만 stage하며 사용자 변경을 섞지 않는다.

아래 코드 블록은 구현 시 적용할 구체 예시다. 이 계획 작성 중 실행하거나 제품 코드에 넣은 것은 아니다.

## T1. 작업 선택·변경 인지·단계 복원

**Primary owner:** FE. **Model:** Terra. **Dependencies:** G0.

**Files:** Modify src/webapp/WorkerScreens.tsx, src/webapp/WebApp.tsx. Test tests/webapp/two-crop-team.spec.ts, tests/webapp/ux-hardening.spec.ts.

**Interfaces:** 기존 api.getMyTodayAssignments(), api.getAssignment(token), session_id, integer version 유지. 새 API 없음. 단계 복원 키는 session_id+version.

- [ ] 기존 ‘team member switches both explicitly assigned crops and refreshes regenerated quantity’의 딸기 v2 갱신 후 다음 코드를 추가해 낮은 버전의 다른 작업 전환 실패를 재현한다.

```ts
await page.getByRole('button', { name: /Thu hoạch hành ·/ }).click();
await expect(page.getByRole('heading', {
  name: 'Thu hoạch hành', exact: true,
})).toBeVisible();
```

- [ ] Run: `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts -g "team member switches"`. 현재는 양파로 전환되지 않아 실패해야 한다.
- [ ] receive의 선택 기준을 다음 의미로 수정한다. 이전 effect의 늦은 응답은 cleanup의 cancelled flag로 폐기한다.

```ts
if (!current || next.session_id !== current.session_id) return next;
return next.version >= current.version ? next : current;
```

- [ ] WorkerStepView의 재생·단계 상태 key는 version 단독이 아니라 session_id와 version을 함께 사용한다.

```tsx
<WorkerStepView key={assignment.session_id + ':' + assignment.version}
  assignment={assignment} go={go} />
```

- [ ] URL의 /steps/{n}과 실제 단계가 일치하도록 라우팅을 연결한다. sessionStorage에는 session ID·version·step만 저장하고 token/package/transcript는 복사하지 않는다. load된 최신 version과 일치할 때만 복원, 잘못된 인덱스는 유효 범위로 제한한다.
- [ ] 단계 상단 context를 표시한다. 이전/새 수량 비교는 같은 session에서 이전 버전을 실제로 받은 경우에만 표시한다.
- [ ] 같은 작업 v2 뒤 늦은 v1은 무시, 다른 작업 v1 전환, 2단계 reload, 새 버전 첫 단계, 작업 전환 후 이전 변경 알림 소멸을 검사한다.
- [ ] Run: `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts tests/webapp/ux-hardening.spec.ts`.

## T2. 언어 진입·오류·참가 대기

**Primary owner:** FE. **Model:** Terra. **Dependencies:** T1.

**Files:** Modify WorkerScreens.tsx, WebApp.tsx. Test ux-hardening.spec.ts, two-crop-team.spec.ts.

**Interfaces:** 기존 joinTodayTeam 응답과 authenticated assignments 사용. 신규 worker identity API 없음. 정상 remote package.language_code가 권위다.

- [ ] 다음 red test를 ux-hardening.spec.ts에 추가한다.

```ts
test('worker entry selects Nepali before Korean instructions', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('batmeori-locale', 'ko'));
  await page.goto('/worker');
  await page.getByRole('button', { name: 'नेपाली', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ne');
  await expect(page.locator('main')).not.toContainText(/[가-힣]/);
});
```

- [ ] Run: `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts -g "worker entry selects"`. 언어 버튼이 없어 실패해야 한다.
- [ ] WorkerEntry의 team 단계에도 기존 selectLocale 경로를 연결한다. 선택 전에는 vi/ne 안내, 선택 후 기존 entryCopy[locale]를 사용한다.

```tsx
<button type="button" onClick={() => selectLocale('vi')}>Tiếng Việt</button>
<button type="button" onClick={() => selectLocale('ne')}>नेपाली</button>
```

- [ ] 위 버튼은 실제 구현에서 공통 타깃·선택 상태 스타일을 재사용한다. 오류 안내도 같은 선택 상태를 사용한다. 유효 remote payload를 다른 언어로 가장하지 않는다.
- [ ] join 성공 및 authenticated 200 빈 배열은 참가·배정 대기 상태로 보여준다. 401은 재참가 안내이며 다른 사람의 명부·ID를 노출하지 않는다.
- [ ] 기존 카메라 테스트의 한국어 버튼 selector는 새 언어 진입 절차를 거쳐 일치하도록 갱신한다. 카메라 fallback 동작 자체를 삭제하지 않는다.
- [ ] Run: `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts tests/webapp/two-crop-team.spec.ts`. 만료 새 context, saved ne+valid vi link, join/reload/401을 포함한다.

## T3. 전달 카드·링크 교체·공유·성공 안내

**Primary owner:** FE. **Model:** Terra, Sol 문구 검수. **Dependencies:** T2.

**Files:** Modify OwnerScreens.tsx. Test full-p0-flow.spec.ts, two-crop-team.spec.ts.

**Interfaces:** issued.issued_worker_link.{language_code,url,expires_at}를 사용한다. api.issueWorkerLink(sessionId, languageCode) 계약 유지.

- [ ] two-crop-team.spec.ts의 인증 beforeEach를 이용해 다음 실패 검사를 추가한다. 최종 전달 방식 접힘 UI 적용 시 ‘링크로 보내기’를 먼저 선택하도록 연결한다.

```ts
test('issued link keeps its actual language after selector changes', async ({ page }) => {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await page.getByRole('button', { name: '확정하기' }).click();
  await page.getByRole('button', { name: /Tiếng Việt/ }).click();
  await page.getByRole('button', { name: '작업 링크 만들기' }).click();
  const oldUrl = await page.getByRole('link', { name: '작업자 화면 열기' }).getAttribute('href');
  await page.getByRole('button', { name: /नेपाली/ }).click();
  await expect(page.getByText('베트남어 작업 링크', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '작업자 화면 열기' })).toHaveAttribute('href', oldUrl!);
});
```

- [ ] Run: `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts -g "issued link keeps"`.
- [ ] 카드 언어를 선택 상태가 아닌 발급 결과에서 계산한다.

```ts
const issuedLanguage = issued?.issued_worker_link.language_code;
const issuedTitle = issuedLanguage === 'ne' ? '네팔어 작업 링크' : '베트남어 작업 링크';
```

- [ ] native confirm 또는 기존 QR 확인 패턴을 재사용해 동일 session·언어 링크 교체의 영향을 사전에 설명한다. 취소 시 API 0회, 승인 시 1회.
- [ ] navigator.share 지원 시 사용하고 미지원은 기존 copy. 공유 AbortError는 사용자의 취소이므로 실패 안내를 띄우지 않는다. 기타 오류는 복사 대안을 제공한다.
- [ ] 제목을 작업 전달하기로 정리하고 번역 상세는 접근 가능한 펼침으로 보존한다. 수량 변경 후 이전/현재 값 성공 안내를 owner current에도 표시한다. 미확인 읽음·이해 상태는 만들지 않는다.
- [ ] Run: `pnpm exec playwright test tests/webapp/full-p0-flow.spec.ts tests/webapp/two-crop-team.spec.ts`. 공유 성공·취소·미지원·clipboard 실패, vi→ne→교체, 수량 변경을 검사한다.

## T4. 인증된 초안 조회와 복구

**Primary owner:** BE. **Model:** Terra. **Dependencies:** G0. BE 구현은 T1–T3와 병렬 가능. FE 연결은 BE 통과 후 FE writer가 수행한다.

**Files:** Modify backend/app/main.py, backend/test_main.py, src/webapp/api.ts, src/webapp/mock-api.ts, src/webapp/WebApp.tsx, src/webapp/OwnerScreens.tsx, scripts/check-frontend-contract.mjs. Test tests/webapp/two-crop-team.spec.ts. 새 DB/schema 파일 없음.

**Interfaces:**

- GET /api/v1/work-sessions/drafts/{draftId}.
- FE api.getDraft(draftId: string): Promise<WorkDraft>.
- 기존 backend parse_draft(row) 및 WorkDraft DTO 재사용.
- 새로운 endpoint 함수 이름 get_draft(draftId, response, batmeori_owner_session).
- 200 기존 DTO, 401 인증 없음, 404 NOT_FOUND(없음/타농장/조회 만료 일반화), 409 VERSION_CONFLICT(확정됨), 422 LEGACY_READ_ONLY. no-store. 기존 오류 envelope 사용.

- [ ] 위 계약을 openapi와 실패 문서에 먼저 반영한다. expires_at은 복구 조회 기한이며 원자 쓰기 만료 정책 전체를 이번 작업에서 임의 변경하지 않는다.
- [ ] backend/test_main.py에서 기존 Query/Client fake 패턴을 사용해 farm filter, 만료, 확정, legacy를 검사한다. 다음처럼 무인증 경로도 직접 검사한다. get_draft import 추가 전에는 red다.

```python
def test_get_draft_requires_owner_session(self):
    response = Response()
    with patch("app.main.require_owner", side_effect=ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")):
        with self.assertRaises(ApiError) as raised:
            asyncio.run(get_draft("draft-1", response, None))
    self.assertEqual(raised.exception.status_code, 401)
```

- [ ] ApiError는 현재 backend/app/main.py:135의 status_code 속성을 사용한다. 위 import 목록에 get_draft를 추가하고 기존 예외 객체를 그대로 검사한다.
- [ ] Run: `$env:PYTHONPATH='backend'` 후 `& ./backend/.venv/Scripts/python.exe -m unittest discover -s backend -p 'test_main.py' -v`.
- [ ] getter는 cookie에서 농장을 얻고 기존 두 필터 조회를 재사용한다.

```python
owner = require_owner(batmeori_owner_session)
row = one_row(
    db_client().table("work_drafts").select("*")
    .eq("id", draftId).eq("farm_id", owner.farm_id).execute()
)
response.headers["Cache-Control"] = "no-store"
```

- [ ] 조회 결과의 expires_at이 현재보다 지나면 404, confirmed_session_id가 있으면 409, legacy는 parse_draft의 기존 422를 유지한다. 내부 DB 예외를 그대로 사용자에게 노출하지 않는다. GET은 쓰기나 새 AI 호출을 하지 않는다.
- [ ] 다음 FE adapter를 realApi와 타입이 맞는 mock에 함께 추가한다.

```ts
getDraft: (draftId: string) =>
  request<WorkDraft>(`/api/v1/work-sessions/drafts/${encodeURIComponent(draftId)}`),
```

- [ ] mock의 초안 저장은 테스트용으로만 유지한다. production storage에 원음·초안 본문을 복사 저장하지 않는다.
- [ ] owner 경로 /owner/draft/{draftId}/interpret를 연결한다. 기존 ID 없는 경로는 복구 보장이 아닌 명확한 재녹음 안내를 제공한다.
- [ ] 명시 logout 또는 다른 farm 인증이면 복구 힌트를 지운다. 인증 만료는 내용을 숨기고 같은 농장 재인증 뒤 GET으로 확인한다. 다른 농장에서 이전 초안을 보여주지 않는다.
- [ ] 다음 red→green 브라우저 검사를 two-crop-team.spec.ts의 인증 fixture 안에 추가한다.

```ts
test('draft review survives reload without retaining audio', async ({ page }) => {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page).toHaveURL(/\/owner\/draft\/[^/]+\/interpret$/);
  await page.reload();
  await expect(page.getByText('20망', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('다시 연 작업은 원음을 재생할 수 없습니다.')).toBeVisible();
});
```

- [ ] 복원된 초안의 원음 버튼은 사용 불가 상태다. 재로그인·타농장·만료·미존재·confirmed·legacy·DB 실패를 검사한다.
- [ ] Run: BE main/contract tests, `pnpm run check:contracts`, `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts`.

## T5. 전체 음성·정지·미디어 대체

**Primary owner:** FE. **Model:** Terra, Sol 문구·배치 검수. **Dependencies:** G0 TTS 문서 동기화, T3.

**Files:** Create src/webapp/BriefingAudio.tsx. Modify WorkerScreens.tsx, OwnerScreens.tsx. Test ux-hardening.spec.ts, full-p0-flow.spec.ts. AI builder/schema는 변경하지 않는다.

**Interfaces:** BriefingAudio({briefing: V2WorkerBriefing}), 같은 파일에서 briefingSpeechText(briefing: V2WorkerBriefing): string. 요약·단계·owner 함께 보기의 실제 중복 3곳만 대체한다.

- [ ] 요약의 듣기 버튼 부재를 먼저 검사한다.

```ts
test('worker summary offers whole-work audio', async ({ page }) => {
  await page.goto('/w/demo-vi-token');
  await expect(page.getByRole('button', { name: /Nghe.*hướng dẫn/ })).toBeVisible();
});
```

- [ ] Run: `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts -g "whole-work audio"`.
- [ ] 음성 문구 조합은 기존 builder와 같은 다음 함수를 사용한다.

```ts
export function briefingSpeechText(briefing: V2WorkerBriefing): string {
  return [
    ...briefing.context.safety,
    ...briefing.steps.map(step => `${step.title} ${step.description}`),
  ].join('\n');
}
```

- [ ] 서버 URL과 browser synthesis의 범위를 통일한다. 스피커 버튼은 전체 작업 듣기임을 명시한다. 재생 상태·정지·다시 듣기만 구현하고 pause/resume·속도·단계 오디오 API는 추가하지 않는다.
- [ ] locale 지원 음성이 없으면 다른 언어로 읽지 않고 텍스트/재시도 안내를 한다. voices가 늦게 로드되는 경우도 검사한다.
- [ ] 기존 stub 방식으로 utterance text 전체 일치, safety 선행, stop 시 cancel/pause, session/version/unmount 시 중지를 검사한다. stale media callbacks가 새 재생 상태를 바꾸지 못하게 한다.
- [ ] owner video에도 worker의 onError 대체 표시를 재사용하고 원음 play reject를 alert로 표시한다. 영상 없음은 neutral Callout이며 step·safety를 삭제하지 않는다.
- [ ] Run: `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts tests/webapp/full-p0-flow.spec.ts`, `node --test ai/tests/worker-briefing-v2.test.mjs`.

## T6. 검토·보완·녹음·안전 설명

**Primary owner:** FE. **Model:** Terra, Sol 위계·문구 검수. **Dependencies:** T5. T4 복구 연결은 getter 통과 후 병합한다.

**Files:** Modify OwnerScreens.tsx, WebApp.tsx 로그인 도움말. Test ux-hardening.spec.ts, two-crop-team.spec.ts.

**Interfaces:** api.supplementDraft(draftId, audio, expectedDraftRevision) 유지. 새 text edit/field mutation 없음. server 응답 전체를 다시 검토한다.

- [ ] 기존 수량 보완 테스트 패턴을 복제해 정상 초안에서도 장소·시간 보완 동작이 발견되는지 검사한다.

```ts
test('ready draft exposes location correction', async ({ page }) => {
  await page.goto('/owner/new');
  await page.getByRole('button', { name: '데모 음성으로 진행' }).click();
  await expect(page.getByRole('button', { name: '장소 다시 말하기' })).toBeVisible();
});
```

- [ ] Run: `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts -g "location correction"`.
- [ ] 기존 supplement recorder를 필요한 필드 옆 진입점에서 재사용한다. 요청은 반드시 현재 draft_revision을 전달한다.

```ts
const nextDraft = await api.supplementDraft(
  draft.draft_id, audio, draft.draft_revision,
);
setDraft(nextDraft);
```

- [ ] 제목은 작업 내용이 맞나요, 필수 사실·단계·안전은 계속 검토 가능하게 둔다. summary 반복·장식만 축소한다.
- [ ] HIGH 금지 안내와 UNKNOWN 부족 정보 안내를 분리하고 둘 다 게시 차단을 유지한다. null deadline·notes를 새 필수 질문으로 만들지 않는다.
- [ ] 빈 safety는 입력된 안전 안내 없음이며 안전하다는 보증이 아니다. worker null 안내도 의미를 새로 추론하지 않는다.
- [ ] MediaRecorder가 성공적으로 start한 뒤에만 이전 Blob을 교체한다. 권한·장치 없음·사용 중 오류에서 이전 preview가 남는지 기존 MediaRecorder stub으로 검사한다.
- [ ] 로그인에 운영자 발급 설명만 추가한다. 실제로 정해지지 않은 연락처·가입 기능을 만들지 않는다.
- [ ] supplement가 다른 값까지 잘못 바꾸는 실제 AI 회귀가 발견되면 prompt-engineering/llm-evaluation 별도 절차로 원인을 검증한다. 화면 수정에 추측 prompt 패치를 끼우지 않는다.
- [ ] Run: `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts tests/webapp/two-crop-team.spec.ts`.

## T7. 작업 목록·직접 진입 상태

**Primary owner:** FE. **Model:** Terra. **Dependencies:** T6.

**Files:** Modify OwnerScreens.tsx, WebApp.tsx. Test two-crop-team.spec.ts.

**Interfaces:** 기존 api.listSessions(): Promise<{items: OwnerWorkSession[]}> 유지. 전역 session은 선택된 작업이며 전체 목록을 대신하지 않는다.

- [ ] two-crop-team.spec.ts의 ownerSession/strawberrySession fixture로 다음 red 검사를 추가한다.

```ts
test('owner home exposes every published work', async ({ page }) => {
  await page.addInitScript(({ onion, strawberry }) => {
    localStorage.setItem('batmeori-demo-session', JSON.stringify(onion));
    localStorage.setItem('batmeori-demo-sessions', JSON.stringify([onion, strawberry]));
  }, { onion: ownerSession, strawberry: strawberrySession });
  await page.goto('/owner');
  await expect(page.getByText('양파 수확', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('딸기 수확', { exact: true }).first()).toBeVisible();
});
```

- [ ] Run: `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts -g "every published work"`.
- [ ] 기존 list 결과 전체를 목록 state로 유지하고 선택 시 해당 session_id를 기존 상세 라우트에 넘긴다.

```ts
// OwnerHome 컴포넌트 본문:
const [sessions, setSessions] = useState<OwnerWorkSession[]>([]);
// 기존 조회 effect의 async 함수 안:
const { items } = await api.listSessions();
setSessions(items);
```

- [ ] 해당 state setter는 OwnerHome의 목록 state로 정의하고 session setter와 구분한다. loading이 끝나기 전 EmptySession을 표시하지 않는다.
- [ ] 두 번째 작업 상세·수량 대상 일치, 느린 성공 응답 중 오류 미표시, 404/500/401 복구, legacy 읽기 전용을 검사한다.
- [ ] Run: `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts tests/webapp/full-p0-flow.spec.ts`.

## T8. 공통 가독성·반응형·접근성·디자인 적용

**Primary owner:** FE. **Model:** Sol + Impeccable. **Dependencies:** FE T1–T7/T9 및 T4 FE 연결 통합. 기능 중에는 디자인 준비만 병렬 가능.

**Files:** Modify src/index.css, tailwind.config.js, ScreenUI.tsx, AppShell.tsx, 필요한 OwnerScreens.tsx/WorkerScreens.tsx JSX. Test ux-hardening.spec.ts. 새 테마 시스템 없음.

**Interfaces:** 기존 ActionButton/Panel/Callout/PageHeading 재사용. 기능 props를 깨뜨리지 않는다. body·header·button 수치는 디자인 문서 기준.

- [ ] 현재 320px 화살표 압축을 잡는 검사를 추가한다.

```ts
test('step arrows remain identifiable on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/w/demo-vi-token/steps/1');
  const next = page.getByRole('button', { name: 'Tiếp theo', exact: true });
  const buttonBox = await next.boundingBox();
  const iconBox = await next.locator('svg').boundingBox();
  expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
  expect(iconBox!.width).toBeGreaterThanOrEqual(20);
});
```

- [ ] Run: `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts -g "step arrows"`. 현재 내부 아이콘 폭 조건이 실패해야 한다.
- [ ] 좁은 버튼의 px-5를 상쇄하고 아이콘 축소를 막는다. 중앙 듣기는 별도 전체 폭 행으로 이동하고 이전·다음 문구를 유지한다.

```tsx
<ActionButton className="px-2" aria-label={t.next}>
  <ChevronRight className="h-6 w-6 shrink-0" />
  <span>{t.next}</span>
</ActionButton>
```

- [ ] 본문20·제목28·핵심값24/30·button min56·행간1.5~1.7 후보를 앱 영역의 rem 기반 스타일로 적용한다. 기존 forced-colors/reduced-motion을 보존한다.
- [ ] 헤더를 좁은 폭에서 재배치하고 언어명을 단어 중간으로 잘라 해결하지 않는다. 중복 h1 제거, 브랜드 이름 현지화, 작업 맥락 홈을 연결한다.
- [ ] 단색 focus outline과 녹음/처리 role=status를 적용한다. 오류 role=alert와 정상 상태의 우선순위를 구분한다.
- [ ] 320/360/390/768/1024/1366, ko/vi/ne, keyboard, 200% 실제 확대를 검사한다. scrollWidth 하나로 통과 처리하거나 overflow-x:clip으로 가리지 않는다.
- [ ] Run: `pnpm run test:web`, `pnpm run build`. 이후 실제 기기 시각·터치·스크린리더 검증을 수행한다.

## T9. 검증 출처 표시

**Primary owner:** FE. **Model:** Terra 기능, Sol 정보 위계 검수. **Dependencies:** T7. T8 전에 기능 통합.

**Files:** Modify WorkerScreens.tsx, OwnerScreens.tsx. Test ux-hardening.spec.ts, tests/webapp/worker-briefing-v2.fixture.test.mjs.

**Interfaces:** 기존 V2WorkerBriefing.source_detail과 context.safety 배열 사용. API/schema 변경 없음.

- [ ] 기존 fixture.test.mjs의 TEST_FIXTURE_ONLY 안전 fixture를 테스트 안에서만 재사용한다. 실제 공식 출처로 mock-api에 삽입하지 않는다.
- [ ] 브라우저 테스트 fixture에 안전 2개와 대응 출처 2개를 제공하고, 펼친 UI의 순서와 링크/page/license를 검사한다. 누락·unverified·AI_TRANSLATION에 공식 표시가 붙지 않는 검사를 먼저 만든다.
- [ ] safety와 action source를 구분하는 구현은 아래 필터를 사용한다.

```ts
const safetySources = briefing.source_detail.filter(
  source => source.segment === 'SAFETY' && source.step_sequence === null,
);
```

- [ ] 각 safety 문구의 배열 순서와 대응한다. 공식 표시는 source=OFFICIAL_GUIDE, verified=true, source_page/source_url/license가 모두 검증된 경우만 사용한다. 표시 전 값의 형태를 검사하고 임의 HTML을 삽입하지 않는다.
- [ ] test assertion은 명시적으로 테스트 URL에만 연결한다.

```ts
await expect(page.locator(
  'a[href="https://fixture.test/batmeori/safety-guide.pdf"]',
).first()).toBeVisible();
```

- [ ] 펼침과 링크의 접근성 이름은 해당 언어의 ‘출처 보기’와 ‘출처 원문 열기’로 제공하고 라이선스·페이지를 본문에 표시한다. TEST_FIXTURE_ONLY는 테스트 라이선스 표시이며 사용자 UI 라벨 규칙이 아니다. UI 가이드를 농작업 safety source로 재활용하지 않는다.
- [ ] transcript/risk/identity/token/hash 비노출 검사를 유지한다.
- [ ] Run: `node --test tests/webapp/worker-briefing-v2.fixture.test.mjs`, `pnpm exec playwright test tests/webapp/ux-hardening.spec.ts`, `pnpm run check:contracts`.

## 6. 통합 검증 G1 — primary owner FE

모든 명령은 저장소 루트에서 실행한다. 이번 계획 작성 중에는 실행하지 않았다.

```powershell
pnpm run check:contracts
pnpm run build
pnpm run test:web
node --test ai/tests/worker-briefing-v2.test.mjs
node --test ai/tests/structure-runtime-v2.test.mjs
node --test tests/webapp/worker-briefing-v2.fixture.test.mjs
$env:PYTHONPATH = 'backend'
& .\backend\.venv\Scripts\python.exe -m unittest discover -s backend -p 'test_main.py' -v
& .\backend\.venv\Scripts\python.exe -m unittest discover -s backend -p 'test_contracts.py' -v
pnpm test
```

- test:web는 package.json에 기존 3개 spec만 지정되어 있다. 기존 파일 확장이 기본이며 새 파일이 필요하면 runner 목록도 동기화한다.
- Playwright는 기본 4173, workers=1, 자체 mock Vite 서버, reuseExistingServer=false다. 서버 충돌 시 PLAYWRIGHT_PORT를 확인한 빈 포트로 지정한다.
- LIVE_E2E=1이면 유료 live 검사가 포함될 수 있다. 환경을 확인하고 기본 회귀와 실제 provider 검증을 구분한다. 타 작업의 환경값·프로세스를 임의 변경하지 않는다.
- pnpm test 통과는 실제 사용성·원어민 이해·실제 미디어 품질 통과와 다르다.
- 이전 평가에서 검토용 서버·탭은 모두 종료했다. 이후 실행자가 새로 띄운 검증 서버만 정확히 정리한다.

- [ ] 기능·계약·빌드 회귀 전부 통과.
- [ ] 실기기 ko/vi/ne, 200% 확대, 키보드·스크린리더, 카메라·녹음 권한을 확인.
- [ ] 실제 vi/ne 음성 지원·재생·정지·영상을 확인. mock 성공으로 대체하지 않는다.
- [ ] 현장 사용성 테스트 결과를 집단별로 기록.
- [ ] 독립 코드 리뷰 후 디자인 polish, 이후 critique/audit 재평가.
- [ ] 남은 미검증 항목은 명시하고 출시 완료로 부르지 않는다.

## 7. 실제 사용자 검증 G2 — primary owner FE

계획의 일부이며 아직 참여자를 모집하지 않았다.

첫 탐색 라운드는 고령 농장주 5명·vi 5명·ne 5명 제안이다. 실제 읽기·기기 숙련도·시청각 및 손 조작 차이를 별도로 확인한다.

농장주 과제: 로그인 안내 → 지시 생성 → 틀린 장소 보완 → vi/ne 전달 → 다중 작업 중 수량 변경 → 중단 후 복구.
근로자 과제: 언어 선택·QR 참가 → 작업 요약 듣기 → 되말하기 → 단계 이동·정지 → 변경 수량 확인 → 만료·네트워크 복구.

기록: 독립 완료 여부, 도움 횟수, 잘못 선택한 작업/언어/수량, 과제 시간, 변경 인지, 되말하기 정확도.
조건: 본인 기기, 안전한 소음·밝기·약한망 환경, 녹화 별도 동의, 동일 보상, 근로자 개별 확인.
판정: 중요한 작업·언어·수량·안전 오해가 한 번이라도 나오면 수정 후 재검증. 일반 과제 각 집단4/5 독립 완료는 탐색 목표이지 정부 기준·통계적 보증이 아니다.

## 8. 제외와 후속 범위

이번 계획은 단계별 TTS 계약, 전체 음성에 context 추가, 배정 취소 API, worker identity API, 읽음/이해/완료 추적, 오프라인 게시, 신규 작물·언어, 원음 장기 저장, 전면 새 디자인 시스템을 추가하지 않는다. 필요성이 실제 테스트로 확인되면 권위 계약과 별도 범위를 먼저 제안한다.

계획 문서 자체의 검증: 27항목 매핑·주담당·파일·인터페이스·명령·선행조건·계약 충돌·출처·미검증 범위를 확인한다. 제품 테스트 통과나 구현 완료를 주장하지 않는다.
