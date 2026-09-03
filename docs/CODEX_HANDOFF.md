# Codex 인수인계 메모

이 파일은 Codex 계정을 바꾼 뒤 새 Codex 작업에서 먼저 읽는 메모다. 비밀번호,
Supabase secret key, PIN, 토큰은 기록하지 않는다.

## 새 계정에서 시작하는 방법

1. Codex 데스크톱 앱에서 `C:\Users\kimmo\OneDrive\Desktop\밭머리` 폴더를 연다.
2. 새 작업을 만든다.
3. 아래 문장을 첫 메시지로 보낸다.

```text
이 프로젝트는 밭머리다. 먼저 AGENTS.md, README.md, CONTEXT.md,
docs/PRODUCT_SPEC.md, docs/ARCHITECTURE.md를 읽어라. 백엔드 작업이면
docs/DATA_MODEL.md, docs/openapi.yaml, docs/AI_CONTRACTS.md,
docs/FAILURE_MODES.md, docs/BACKLOG.md도 읽어라. 현재 구현은 ZIP 최신본 기준이며,
P0는 양파·딸기만, vi/ne만, 수량 변경만 지원한다. 현재 상태와 미완료 작업을 먼저 요약한 뒤
수정하라. AI는 추측하지 않으며, 결정은 농장주가 한다.
```

## 현재 제품 결정

- P0 작물은 양파·딸기만 지원한다. task code와 팀 영향은 `docs/TEAM_UPDATE_ONION_STRAWBERRY_P0.md`를 따른다.
- 전달 언어는 베트남어(`vi`)와 네팔어(`ne`)만 지원한다.
- 전달 방식은 `CO_PRESENT`(농장주와 함께 보기), `REMOTE`(익명 링크), 또는 TodayWorkTeam의 개인 배정이다.
- P0에는 영구 근로자 등록·계정, 전화번호, 국적, SMS, 개인 프로필, 채팅이 없다. TodayWorkTeam은 별명·`vi|ne`만 가진 Asia/Seoul 당일 임시 QR roster이며 자정에 만료된다.
- `REMOTE` 링크는 언어 하나를 선택하며 발급 후 24시간 뒤 만료된다.
- 링크는 항상 최신 `PUBLISHED` WorkVersion을 보여준다.
- 안전 위험이 `HIGH` 또는 `UNKNOWN`이면 게시할 수 없다.
- P0 영상은 AI 사전 생성 후 사람 검수한 자산만 사용한다. `HIGH` 자산은 게시하지 않는다.
- 정부 가이드의 URL·페이지·번역은 사람이 PDF와 대조하기 전까지 공식 자료로 표시하지 않는다.

## 현재 구현 상태

- `backend/app/main.py`: FastAPI API, PIN/member cookie 인증, draft/version/link/team 흐름, BE schema/risk/guide/video gate
- `backend/app/ai.py`: Node AI runtime으로 연결하는 private JSONL/stdio transport. Provider 구현과 선택은 Node runtime과 server-only 환경변수가 소유한다.
- `docs/openapi.yaml`: 현재 API 계약
- `supabase/migrations/`: work session, anonymous language link, temporary team, guide/asset/TTS cache 테이블과 RPC
- `docs/schemas/`: structure, quantity-change, translation JSON Schema
- `evals/`: 오디오 평가 입력과 manifest
- 기존 `workers` API와 `worker_ids` 입력은 제거했다.
- 누락된 `risk_assessment`는 백엔드가 `UNKNOWN/INSUFFICIENT_CONTEXT`로 보완하고 게시를 막는다.
- worker 응답에서는 `risk_assessment`를 제거한다.
- `DEMO_FALLBACK=0`으로 실제 provider 경로를 사용한다. `backend/.env`의 OpenAI 설정은 채워져 있다.

## 현재 로컬 검증 결과

- `pnpm test`의 AI·backend·contract·build·browser 9개 suite 통과. 세부 개수는 테스트 출력이 기준이다.
- 8개 asset manifest의 schema/checksum 입력 검증과 frontend contract/production build 통과
- 실제 `stt-smoke-001`로 STT→publish→REMOTE worker route를 실행하고 검수 영상 2개의 Chrome 재생을 확인했다.
- confirm은 delivery 방식·언어 없이 공용 `vi`·`ne` package만 publish한다. 프론트 스토리보드에서 `CO_PRESENT` 언어를 고르거나 `REMOTE` 언어별 링크를 별도 발급하며, 재발급은 이전 링크를 폐기한다.
- `202609030007_expand_onion_strawberry_ontology.sql`의 양파·딸기 8코드와 `task_family` DB constraint를 적용했다. retired code를 가진 기존 immutable version/link/asset은 reset·delete·rewrite·자동 remap 없이 legacy read-only로 보존한다.

## 배포 환경에서 남은 검증

### 2026-09-04 반영 및 검증

- 연결된 `batmeori` Supabase에는 `001`~`016`이 적용되어 있다. `015` 적용 후 실제 provisioning에서 발견한 `farm_id` 모호성을 새 `016`으로 복구했으며, 적용된 `015` 파일은 변경하지 않았다.
- 실제 농장 provisioning, 새 농장 코드 인증, 기존 인증 유지, service-role 전용 권한을 확인했다. `017` 삭제 migration은 아직 적용하지 않았다.
- 로컬 FastAPI 8000은 API 2.0.0, `/health`·`/ready` 200이다. readiness의 잘못된 package 컬럼 조회를 수정했고, 구 `8001` TTS 주소를 제거했다. Vite 5173의 `/api`는 8000으로 전달한다.
- 전체 자동 검증은 9/9 suite(AI 47, backend 64, browser 32) 통과했다. 실제 provider와 Supabase를 연결한 음성·게시·영상 2개 재생·원격 링크·수량 변경·CO_PRESENT·팀 QR 재발급·개별 배정도 통과했다.
- 별도 실제 browser context에서 농장주 로그인과 팀원 참가 뒤 쿠키 유지·역할 격리를 검증했다. 로컬 결과이며 운영 Vercel rewrite 검증으로 간주하지 않는다.
- PGlite에서 bootstrap과 원본 `001`~`017` 전체 replay, provisioning·PIN 교체·owner ID 보존, rollback을 검증했다. 제품 의존성을 추가하거나 기존 데이터를 삭제하지 않았다.
- 위 로컬 검증 이후 운영 배포를 완료했다. 아래 운영 검증 결과가 최신 상태다. `kidding.vercel.app`는 이 프로젝트의 사이트가 아니다.

### 2026-09-04 운영 배포 검증

- 프론트는 https://batmeori.vercel.app, API는 https://batmeori-api.onrender.com 이다. Vercel과 Render 모두 `0ecc23e87168417256b97e6f7e7f20d4c10063eb` 배포 성공을 확인했다.
- API `/health`·`/ready` 200과 revision 일치를 확인했다. 프론트의 같은 출처 `/api` 프록시를 통해 기존 농장 코드·PIN 인증 201 및 secure cookie를 확인했다. 이번 배포에서는 PIN 발급이나 DB migration을 실행하지 않았다.
- 운영 `backend/live_e2e.py`가 실제 provider·Supabase로 PASS했다. 음성 입력·게시·원격 링크·수량 변경·CO_PRESENT·팀 QR 재발급·개별 배정, 실제 브라우저의 농장주/팀원 쿠키 유지를 확인했다.
- 영상 기대값은 `delivery-policy-v2.json`을 따른다. 양파 수확 영상 재생을 확인했고, 양파 운반은 영상 없이 텍스트·TTS를 유지한다. 이전 테스트의 운반 영상 기대값을 수정했다.
- 이 배포 검증은 사투리 STT 전체 품질 통과를 의미하지 않는다. 남은 동작 누락·위치 오인식과 사전 비교 결과는 `evals/results/2026-09-04-dialect-resume-review.md`를 따른다.

### 적용 순서

- 구 BE가 연결되지 않은 새 빈 Supabase 환경만 `supabase/clean-install-bootstrap.sql`을 `ON_ERROR_STOP`으로 먼저 적용한 뒤 `001`부터 migration을 순서대로 적용한다. 예: `psql <connection> -v ON_ERROR_STOP=1 -f supabase/clean-install-bootstrap.sql` 다음 `supabase db push --db-url <connection> --include-all`. plain `db reset`처럼 prelude를 생략하는 경로는 사용하지 않는다. 이 prelude는 `public` table이 존재하면 중단되며 기존 환경에는 실행하지 않는다. 아래 단계별 전환 절차는 기존 환경에 적용한다.
- 빈 schema replay 회귀 검증은 임시 외부 경로에 설치한 `@electric-sql/pglite@0.5.8`로 `node scripts/test-clean-install.mjs <PGlite-package-directory>`를 실행한다. 제품 의존성은 추가하지 않으며 운영 DB에는 연결하지 않는다. 이 검증은 전체 SQL과 `pgcrypto`를 실제 PostgreSQL WASM 엔진에서 실행하지만, Supabase 관리형 환경 배포 검증을 대체하지 않는다.
- 기존 BE가 동작 중인 환경에는 `202609030015_farm_code_owner_credentials.sql`만 먼저 적용한다. 이 단계는 새 인증 RPC를 추가하지만 기존 PIN-only 인증 RPC를 유지한다.
- `202609030016_fix_provision_farm_owner.sql`을 적용해 provisioning의 반환 변수·컬럼명 충돌을 먼저 복구한다.
- 운영자 환경변수로 `provision_farm_owner.py`를 농장마다 실행한 뒤 새 BE를 배포하고, 두 farm owner 로그인과 `/ready`를 확인한다.
- 새 BE 전환 확인 뒤에만 `202609030017_remove_legacy_write_rpcs.sql`을 적용한다. 017을 새 BE 배포 전에 적용하면 안 된다.
- `import_visual_assets.py`를 실행하고 두 farm owner로 cross-farm isolation, 실제 Node provider와 audio→draft→confirm→CO_PRESENT/REMOTE/team→수량 변경 E2E를 실행한다.

## 주의

- 실제 비밀값은 `backend/.env`에만 둔다. 저장소·프론트·Postman 예시에 넣지 않는다.
- `202609030004_migrate_to_anonymous_language_links.sql`은 기존 worker registry를 최신 익명 링크 모델로 바꾸는 migration이다. 기존 worker 데이터가 있으면 실행 전에 백업한다.
- `202609030007_expand_onion_strawberry_ontology.sql`은 immutable version의 retired code를 자동 변환하지 않는다. legacy data가 있는 환경에서도 reset 없이 v1 read-only로 보존한다.
- Node AI provider가 연결되지 않으면 audio API는 `503 PROVIDER_UNAVAILABLE`을 반환한다. 합성 fixture STT/LLM runtime은 없다.
