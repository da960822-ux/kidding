# Two-Crop Team Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver two-crop P0 with non-destructive legacy reads, farm-scoped Owner access, one Node AI runtime, and identical worker briefings across all delivery paths.

**Architecture:** New data is versioned as `structure-v2`/`ontology-v2`; existing v1 rows are read-only and never mapped. FastAPI owns authorization, storage, and transactions, then calls one per-request Node JSONL bridge. It stores one localized WorkerBriefing package per version/language that CO_PRESENT, remote, and TodayWorkTeam read unchanged.

**Tech Stack:** FastAPI, PostgreSQL/Supabase SQL, React/Vite/TypeScript, Node built-in test runner, Playwright, JSON Schema.

**Spec:** `docs/superpowers/specs/2026-09-03-p0-two-crop-team-owner-design.md`

## Global Constraints

- Work in the existing `codex/backend-integration` linked worktree; preserve its unrelated dirty files.
- Do not run, merge, or retain destructive migration behavior from remote migrations 004 or 007.
- New publishes use only `structure-v2`/`ontology-v2`; legacy v1 is query-only and quantity routes return `422 LEGACY_READ_ONLY`.
- Never expose or accept owner/farm IDs, worker identity, tokens, transcript, raw audio, or risk assessment in worker-facing or AI bridge payloads.
- Use exact Origin validation, signed HttpOnly cookies, provider configuration only from server environment, and no public static CSRF token.
- Add no worker profile, worker login, phone/SMS, additional crop/language, or runtime video generation.

### Task 1: Freeze v2 contracts and non-destructive database shape

**Files:**
- Create: `docs/ontology-v2.json`, `docs/schemas/structure-v2.schema.json`, `docs/schemas/worker-briefing-v2.schema.json`, `supabase/migrations/202609030009_two_crop_owner_scope.sql`
- Modify: `supabase/migrations/202609030004_migrate_to_anonymous_language_links.sql`, `supabase/migrations/202609030007_expand_onion_strawberry_ontology.sql`, `CONTEXT.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/AI_CONTRACTS.md`, `docs/openapi.yaml`, `docs/SAFETY_POLICY.md`, `docs/FAILURE_MODES.md`, `docs/BACKLOG.md`, `docs/EVALS.md`, `docs/EXPERIMENT_LOG.md`
- Test: `backend/test_contracts.py`, `ai/tests/task-code-contract.test.mjs`, `ai/tests/structure-v2-contract.test.mjs`

**Produces:** Canonical 8-code `ontology-v2`; `structure-v2`; public `worker-briefing-v2`; farm-scoped API and DB contract.

- [ ] Write failing Node tests that accept each family/code pair and reject old code and family mismatch for new v2 output.
- [ ] Run `node --test ai/tests/task-code-contract.test.mjs ai/tests/structure-v2-contract.test.mjs`; confirm failure because v2 files do not exist.
- [ ] Add `ontology-v2` and schemas with `additionalProperties:false`, explicit `contract_version`, `ontology_version`, and identity-free WorkerBriefing fields.
- [ ] Write failing backend contract tests proving new publish requires v2, legacy quantity preview/confirm returns `LEGACY_READ_ONLY`, and WorkerBriefing excludes forbidden fields.
- [ ] Replace destructive future migration behavior in 004/007 before deployment: preserve legacy tables/rows, remove every drop/reset path, retain v1+v2 asset code union, and add new farm/package columns in 009. Backfill legacy farm/version only through an explicit legacy seed record; then add indexes and `(farm_id, work_date)` unique.
- [ ] Run schema/contract tests and SQL migration fixture test; confirm v1 fixture remains queryable and v2 mismatch is rejected.

### Task 2: Build v2 Node runtime, bridge, manifest, and evaluations

**Files:**
- Create: `ai/lib/ontology-v2.mjs`, `ai/lib/structure-v2-contract.mjs`, `ai/lib/worker-briefing-v2.mjs`, `ai/bridge-core.mjs`, `ai/bridge.mjs`, `ai/prompts/prompt-structure-005.md`, `ai/prompts/prompt-structure-supplement-002.md`, `ai/evals/transcript-v2.jsonl`, `ai/evals/transcript-jeolla-v2.jsonl`, `ai/evals/transcript-jeolla-v2.provenance.json`
- Modify: `ai/index.mjs`, `ai/lib/contracts.mjs`, `ai/lib/owner-runtime.mjs`, `ai/lib/openai-requests.mjs`, `ai/lib/openai-provider.mjs`, `ai/lib/worker-briefing.mjs`, `ai/lib/visual-match.mjs`, `ai/scripts/validate-manifests.mjs`, `ai/scripts/validate-transcript-dataset.mjs`, `assets/asset_manifest.csv`
- Delete: `ai/manifests/visual_assets.csv` after every importer/test reads `assets/asset_manifest.csv`
- Test: `ai/tests/worker-briefing-v2.test.mjs`, `ai/tests/bridge-core.test.mjs`, `ai/tests/asset-manifest-v2.test.mjs`, `ai/tests/legacy-v1-read.test.mjs`, `ai/tests/quantity-regeneration-package.test.mjs`

**Produces:** One versioned, provider-neutral Node runtime and a JSONL bridge envelope.

- [ ] Write failing tests for two language packages, 20/15 changed hash/text, unapproved video fallback, identity-free cache key, malformed JSONL/base64/oversize input, and unknown bridge operation.
- [ ] Run the scoped Node tests; confirm each fails for missing v2 runtime/bridge behavior.
- [ ] Implement v2 validation and prompts without changing v1 validators or fixtures. Reject old codes for v2; retain v1 read helpers only.
- [ ] Replace duplicate AI visual manifest reads with one `assets/asset_manifest.csv` format: `id`, logical `VIDEO`, `content_type`, MD5 checksum, review timestamp, and current flag. Require one current APPROVED LOW asset per v2 code and preserve unknown generation metadata as null.
- [ ] Implement `BUILD_OWNER_DRAFT_V2`, `MERGE_SUPPLEMENT_V2`, `PARSE_QUANTITY_CHANGE`, and `BUILD_WORKER_PACKAGES_V2` JSONL operations. Reject identity keys, use no shell, validate 10 MiB after decode, and return redacted typed errors.
- [ ] Generate 30-case v2 fixtures covering all eight codes, five quantity cases, five ambiguities, and two-crop safety/family negatives. Preserve v1 datasets unchanged.
- [ ] Run all Node AI tests and both manifest/dataset validators.

### Task 3: Replace Python AI paths with FastAPI transport and atomically publish packages

**Files:**
- Create: `backend/app/ai_bridge.py`, `backend/test_ai_bridge.py`
- Modify: `backend/app/main.py`, `backend/app/ai.py`, `backend/test_ai.py`, `backend/test_main.py`, `backend/live_e2e.py`, `backend/.env.example`, `backend/README.md`
- Modify: `supabase/migrations/202609030009_two_crop_owner_scope.sql`
- Test: `backend/test_ai_bridge.py`, `backend/test_main.py`

**Consumes:** JSONL bridge operations and v2 WorkerBriefing package.

**Produces:** Farm-scoped routes that call no Python provider/prompt/TTS code and store complete immutable localized packages.

- [ ] Write failing tests that monkeypatch the bridge process and prove draft, supplement, quantity parse, and package build invoke it once; Python OpenAI functions must not be called.
- [ ] Write failing route tests for owner A/B isolation, no client owner/farm fields, legacy `LEGACY_READ_ONLY`, remote web URL, and bridge regeneration failure/version conflict leaving no new version.
- [ ] Run backend tests with `PYTHONPATH=backend`; confirm failures are behavioral rather than missing dependency errors.
- [ ] Implement signed owner/farm claims from seeded PIN hashes, farm-filter every owner query, and give worker/member cookies only their scoped resource access.
- [ ] Implement async `create_subprocess_exec` JSONL bridge transport with bounded input/output/timeouts and schema validation. Delete provider/prompt/translation/TTS decision logic from `backend/app/ai.py`; retain only typed transport compatibility if imports require it.
- [ ] Store both requested-language packages in the new WorkVersion transaction. On quantity confirmation, validate current v2, call Node for both languages, insert the full replacement state/package, supersede old version, and roll back all writes on bridge failure or conflict.
- [ ] Make `/brief`, remote assignment, and member assignments return the stored `WorkerBriefing` DTO verbatim. Issue remote URLs only as `PUBLIC_WEB_BASE_URL/w/{token}`.
- [ ] Run backend unit/integration tests plus the live fixture E2E; verify the changed quantity reaches vi/ne text, TTS hashes, and all three delivery reads.

### Task 4: Import reviewed assets and enforce server-side eligibility

**Files:**
- Create: `backend/scripts/import_visual_assets.py`, `backend/scripts/seed_demo_owners.py`, `backend/test_visual_asset_import.py`
- Modify: `assets/asset_manifest.csv`, `backend/app/main.py`, `supabase/migrations/202609030009_two_crop_owner_scope.sql`, `docs/DATA_MODEL.md`, `docs/AI_CONTRACTS.md`

**Produces:** Repeatable 8-row import and deterministic approved-video selection.

- [ ] Write failing importer tests for first import, identical reimport, checksum mismatch rollback, historic v1 asset preservation, and duplicate v2 current asset rejection.
- [ ] Run `python -m unittest backend.test_visual_asset_import`; confirm missing importer behavior fails.
- [ ] Implement transaction-bound CSV import with stable IDs, declared checksum algorithm/value, null generation metadata, reviewed timestamp, and no rewrite/delete of existing rows. Seed only farm metadata in migration; use deployment-only environment PIN values to upsert salted demo-owner PIN hashes. Keep DB credentials and PINs server-only.
- [ ] Replace unordered `.limit(1)` selection with exact `VIDEO`, `video/mp4`, provenance, APPROVED, LOW, `is_current`, caption, checksum, reviewer, reviewed timestamp predicates.
- [ ] Run importer tests and a dry-run/read-only verification against the configured database only when credentials are available; do not mutate production without the import command explicitly invoked by deployment.

### Task 5: Render the canonical DTO and all worker delivery flows

**Files:**
- Create: `vercel.json`, `tests/webapp/two-crop-team.spec.ts`, `playwright.config.ts`
- Modify: `src/webapp/contracts.ts`, `src/webapp/api.ts`, `src/webapp/WorkerScreens.tsx`, `src/webapp/OwnerScreens.tsx`, `src/webapp/WebApp.tsx`, `src/webapp/AppShell.tsx`, `src/webapp/mock-api.ts`, `scripts/check-frontend-contract.mjs`, `package.json`

**Consumes:** OpenAPI `WorkerBriefing` DTO and farm-scoped session APIs.

**Produces:** Direct DTO rendering, explicit QR language choice, assignment list, and real worker SPA route.

- [ ] Write failing browser tests: QR join POST sends selected `vi`/`ne`; two assignments render and switch; `/w/{token}` renders remote DTO; legacy v1 renders safe read-only icon; a version update from 20 to 15 replaces text and TTS hash.
- [ ] Run `pnpm exec playwright test tests/webapp/two-crop-team.spec.ts`; confirm failures precede implementation.
- [ ] Define separate `LegacyV1TaskCode` read type and v2 publish type; discriminate all read state by `contract_version`. Add direct `WorkerBriefing` type and remove DTO reconstruction.
- [ ] Remove static CSRF header. Keep cookies/credentials and let the server enforce Origin. Never send owner/farm IDs.
- [ ] Put required `vi|ne` controls in the join form, list all member briefings, and retain selected assignment across polling/focus refresh. Render stored context, typed badges, source detail, TTS and video metadata directly.
- [ ] Split Owner confirm from delivery selection; add CO_PRESENT language action, one-time remote link action, and TodayTeam assignment UI. Add safe legacy icon/title display and remove onion-only labels.
- [ ] Add SPA rewrite for `/w/*`, update mock fixtures for one legacy read, two v2 crops, two assignments, direct DTO, and a regenerated 15-unit version.
- [ ] Run frontend contract check, typecheck, production build, and Playwright suite.

### Task 6: Execute merge gates and review integration

**Files:**
- Modify: `docs/EVALS.md`, `docs/EXPERIMENT_LOG.md`, `docs/BACKLOG.md`
- Test: all tests from Tasks 1-5

- [ ] Add release evidence rows for eight-code consistency, legacy preservation, Node-only runtime, asset importer, QR language/multiple assignments, `/w` navigation, quantity package replacement, and cross-farm denial.
- [ ] Run Node unit suite, Python backend suite, migration fixture suite, frontend contract/type/build suite, Playwright suite, and `git diff --check`.
- [ ] Run a final negative checklist: old code rejected for v2; no new v1 publish; no Owner ID/Farm ID client input; no worker identity in bridge payload; no API URL issued as worker web link; no stale 20-unit text/hash after v2 publish.
- [ ] Review every changed file against the spec, preserve unrelated dirty files, and report only command-backed results plus unavailable external DB evidence.
