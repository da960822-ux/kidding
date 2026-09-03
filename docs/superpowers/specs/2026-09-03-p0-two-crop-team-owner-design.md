# Two-Crop Team Delivery Design

## Goal

양파·딸기 두 작물의 새 작업을 안전하게 발행하고, 농장별 데모 Owner가 공동 브리핑·익명 remote 링크·오늘 작업팀 QR를 선택할 수 있게 한다. 기존 WorkVersion과 VisualAsset은 읽기·표시·감사 가능하게 보존한다.

## Approved P0 scope

- 작물은 `ONION`, `STRAWBERRY`만이다. 새 작업에는 아래 8개 코드만 쓴다.
  - `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`
  - `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, `STRAWBERRY_PACKING`
- 출력 언어는 `vi`, `ne`만이다.
- 자동 변경은 수량만이다.
- 근로자는 계정·전화번호·로그인 없이 TodayWorkTeam QR에서 별명과 언어를 제출하고 24시간 동안만 팀원이 된다.
- 등록 없는 공동 브리핑과 언어별 익명 24시간 remote 링크는 유지한다.
- 자주 함께하는 근로자의 영구 프로필·로그인·재고용은 P1이다.
- Owner 회원가입은 만들지 않는다. 미리 만든 farm와 demo owner의 PIN으로만 해당 farm를 여는 데모 인증을 제공한다.

## Version and data-preservation boundary

`structure-v1`과 기존 onion 6-code ontology는 legacy 계약이다. 변경하거나 새 데이터 생성에 사용하지 않는다. 기존 WorkDraft와 WorkVersion은 `contract_version: structure-v1`로 읽기 전용으로 표시한다.

새 WorkDraft와 새 WorkSession은 `structure-v2`와 `ontology-v2`를 사용한다. `structure-v2`는 `task_family: ONION|STRAWBERRY` 및 family와 일치하는 8개 non-null task_code를 강제한다. `worker-briefing-v2`는 v2 structure의 선택 언어 briefing 계약이다.

모든 WorkVersion은 immutable `contract_version`과 `ontology_version`을 저장·반환한다. legacy WorkSession은 조회만 허용한다. legacy v1의 수량 preview·confirm은 `LEGACY_READ_ONLY`로 거부한다. 새 v2 코드로 조용히 매핑하지 않으며 새 v1 publish는 금지한다.

DB migration은 기존 row를 drop, reset, rewrite하지 않는다. 새 nullable column을 추가하고 legacy row를 명시적으로 v1으로 backfill한 뒤, 검증한 row만 새 제약을 적용한다. 기존 visual asset 허용값은 v1+v2의 union으로 유지한다.

## Owner and farm boundary

`farms`와 `demo_owners`를 seed한다. `demo_owners`는 `farm_id`, PIN hash, active 상태를 가진다. PIN login은 해당 owner와 farm을 찾아 짧은 signed HttpOnly cookie에 `owner_id`, `farm_id`, expiry를 넣는다. 클라이언트가 owner_id 또는 farm_id를 제출하거나 선택하지 않는다.

WorkDraft, WorkSession, WorkerLink, TodayWorkTeam, TeamAssignment의 모든 owner read·write는 cookie의 `farm_id`로 scope한다. 기존 데이터는 하나의 seed legacy farm으로 backfill한다. TodayWorkTeam의 업무일 unique는 전역이 아닌 `(farm_id, work_date)`다. exact Origin 검증을 CSRF 방어로 사용하며, 공개 상수 CSRF header는 제거한다.

## Delivery flow

1. Owner audio는 versioned structure contract로 WorkDraft를 만든다.
2. Owner confirm은 delivery mode·language·raw URL을 만들지 않고, 검증된 WorkVersion v1을 `PUBLISHED`로 만든다.
3. 등록 없는 공동 전달은 Owner가 `vi|ne`를 골라 CO_PRESENT briefing을 열거나, 별도 create/reissue API로 한 언어의 remote link를 발급한다.
4. TodayWorkTeam Owner는 QR 한 개를 연다. 근로자는 별명과 직접 고른 `vi|ne`를 제출하고, 팀원 cookie로 자신의 assignment만 읽는다.
5. Owner는 한 팀원에게 하나 이상 `PUBLISHED` WorkSession을 배정한다. 근로자 화면은 전체 assignment 목록과 선택한 작업의 최신 briefing을 표시한다. 미배정 상태는 대기 화면이다.
6. WorkerLink QR과 복사 URL은 `PUBLIC_WEB_BASE_URL/w/{token}`이다. `/api/v1/worker-links/{token}/assignment`는 웹 화면 내부 fetch 전용이다.

Team member의 별명·ID는 AI input, output, provider metadata, cache key에 절대 포함하지 않는다.

## One AI runtime and regeneration

`ai/` Node runtime이 STT, structure, quantity parse, guide lookup, translation, visual match, TTS를 제공하는 유일한 AI 구현이다. FastAPI는 private JSONL/stdio bridge로만 이를 호출한다. 별도 Python prompt/provider/translation/TTS 구현은 제거하거나 transport-only bridge로 축소한다.

Bridge 입력은 validated structure snapshot, 요청 언어, server-side provider configuration, 검증된 guide/asset rows만 포함한다. provider/model/voice는 server environment와 run metadata에만 둔다.

수량 confirm은 quantity field만 patch하지 않는다. 현재 WorkVersion의 versioned structure를 새 quantity로 검증하고, 해당 버전의 briefing, translation segments, TTS text/hash/status, visual snapshot을 다시 만든 완전한 WorkVersion을 원자적으로 publish한다. 재생성 실패는 text fallback이 명시적으로 포함될 때만 publish할 수 있고, version conflict면 생성물을 저장하지 않는다. 최신 version의 worker link, CO_PRESENT, team assignment는 같은 regenerated package를 반환한다.

## Visual and guide import contract

`assets/asset_manifest.csv` 하나를 release manifest로 사용한다. AI와 BE가 복제 manifest를 각각 유지하지 않는다. DB column과 manifest의 식별자는 `id`, logical `asset_type`은 `VIDEO`, HTTP content type은 별도 `content_type: video/mp4`로 구분한다.

각 asset에는 stable id, task_code, public_path, provenance, review status, safety level, caption, `reviewed_at`, content checksum, `is_current`가 있다. historical generation provider, prompt version, generated time을 모르면 `null`로 보존하고 지어내지 않는다. import는 idempotent하며 기존 checksum이 다르면 transaction을 실패시킨다. `REJECTED` 또는 `HIGH` row를 승인으로 바꾸지 않는다. task code별 `APPROVED + LOW + is_current` asset은 하나만 허용한다.

release 전 manifest checksum은 Storage 객체와 비교한다. 검수 뒤 객체 교체는 새 asset id/path와 재검수를 요구한다. runtime은 asset type, provenance, review status, safety level, caption, current 상태를 재검증하고 실패하면 text+TTS fallback을 사용한다.

Guide translation provenance는 언어별 translation row가 source URL, page, license, human verification을 가진다. source proof 없는 안전 표현은 게시하지 않는다. 현재 빈 DB seed와 로컬 guide manifest를 합치기 전에는 official claim을 하지 않는다.

## Shared worker response

CO_PRESENT, remote link, TodayTeam assignment는 하나의 WorkerBriefing DTO를 사용한다. DTO는 `session_id`, `version`, `contract_version`, language, localized context, typed badge codes, localized steps, translation source detail, TTS status/hash/URL, video metadata를 가진다. transcript, raw audio, risk assessment, token hash, 다른 member 정보는 포함하지 않는다.

FE는 DTO를 재구성하지 않고 그대로 렌더한다. v1/v2 task code는 contract version으로 구분해 각각 표시하며, 안전한 fallback icon을 가진다.

## Required merge gates

1. 새 publish의 8 task_code와 family 검증이 schema, Node runtime, BE, DB, OpenAPI, FE union, asset manifest, v2 eval에 일치한다.
2. `structure-v1` legacy fixture와 existing asset fixture가 non-destructive migration 뒤에도 읽힌다.
3. FastAPI에서 Node runtime만 호출하며 Python AI 중복 경로가 없다.
4. asset import가 8 rows를 idempotent하게 넣고 checksum mismatch를 막는다.
5. QR join 화면이 직접 고른 `vi|ne`를 저장하고, 두 assignment를 모두 표시한다.
6. remote link가 실제 `/w/{token}` 웹 화면을 열고 API는 내부 fetch만 한다.
7. `20망`에서 `15망` 변경 후 vi/ne briefing text, translation segment, TTS hash/status, CO_PRESENT, remote, team response가 모두 새 version을 반환한다.
8. owner A가 owner B의 draft, session, link, team, assignment를 읽거나 바꾸지 못한다.

## Explicit non-goals

영구 근로자 관리, worker login, phone number, SMS, recurring roster, 다른 작물·언어, runtime video generation, destructive data reset은 이 merge 범위에 포함하지 않는다.
