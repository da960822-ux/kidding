# Release Blocker Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deployed FE links/configuration, BE URL and Origin handling, AI adapter configuration, and migration safety agree with current two-crop/team P0 behavior.

**Architecture:** The browser owns public worker routes; BE exposes only JSON assignment endpoints. Deployment configuration is fail-closed outside explicit demo mode. Existing immutable versions remain readable under their stored ontology; no migration resets or rewrites them.

**Tech Stack:** React/Vite, FastAPI, PostgreSQL/Supabase SQL, Python unittest, Node contract checks.

**Spec:** `docs/TEAM_UPDATE_ONION_STRAWBERRY_P0.md`, `docs/openapi.yaml`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/AI_CONTRACTS.md`

## Global Constraints

- P0 supports only `ONION|STRAWBERRY`, `vi|ne`, and quantity changes.
- Owner mutation uses PIN cookie plus exact allowed Origin; no static CSRF header is a security control.
- Anonymous WorkerLink is a 24-hour browser URL that resolves latest `PUBLISHED` without returning a transcript.
- HIGH/UNKNOWN risk, safety ambiguity, invalid schema, and no executable step remain non-overridable.
- Provider/model selection remains server-only environment metadata; FE receives no secret.
- Migrations never drop, reset, rewrite, or silently re-map immutable WorkVersion data.

---

### Task 1: Public worker routing and fail-closed FE configuration

**Files:**
- Modify: `src/webapp/api.ts`, `src/webapp/WebApp.tsx`, `src/webapp/WorkerScreens.tsx`, `scripts/check-frontend-contract.mjs`
- Test: `ai/tests/` or a new Node contract test

- [x] Write a failing contract test: `VITE_USE_MOCK_API=false` with no `VITE_API_BASE_URL` must not select mock; issued links must be `/w/{token}` browser URLs.
- [x] Run the test and verify expected failure.
- [x] Add only explicit mock opt-in and parse `/w/{token}` into the assignment request path.
- [x] Run focused contract test and `node scripts/check-frontend-contract.mjs`.

### Task 2: BE deployment boundary and worker link contract

**Files:**
- Modify: `backend/app/main.py`, `backend/.env.example`, `backend/test_main.py`, `backend/test_contracts.py`, `docs/openapi.yaml`, `docs/ARCHITECTURE.md`, `docs/FAILURE_MODES.md`

- [x] Write failing tests proving configured `PUBLIC_WEB_BASE_URL` creates `/w/{token}`, absent production public URLs fail readiness, and static `X-CSRF-Token` is neither required nor documented.
- [x] Run focused unittest and verify expected failure.
- [x] Make minimal Settings/link/header/ready changes; keep exact Origin checks for owner mutations.
- [x] Synchronize OpenAPI and operational/failure documentation with the implementation.
- [x] Run backend test suite and frontend contract check.

### Task 3: AI configuration boundary

**Files:**
- Modify: `backend/app/ai.py`, `backend/.env.example`, `backend/test_ai.py`, `docs/AI_CONTRACTS.md`

- [x] Write failing tests proving endpoint and provider choice come from server-only configuration and no provider value reaches API contracts.
- [x] Run focused unittest and verify expected failure.
- [x] Add the smallest configured OpenAI adapter boundary; retain canonical schema validation in BE.
- [x] Run AI and backend unit tests.

### Task 4: Non-destructive ontology migration

**Files:**
- Modify: `supabase/migrations/202609030007_expand_onion_strawberry_ontology.sql`, `docs/DATA_MODEL.md`, `docs/TEAM_UPDATE_ONION_STRAWBERRY_P0.md`
- Test: SQL migration contract assertions in `backend/test_contracts.py`

- [x] Write a failing source-level migration test rejecting `reset` and retired-code blocking while requiring preserved legacy ontology metadata.
- [x] Run focused test and verify expected failure.
- [x] Replace reset/blocking migration behavior with additive legacy-version handling and retain stored legacy-code asset/record readability.
- [x] Update data/migration documentation and run test suite.

### Task 5: Contract cleanup and verification

**Files:**
- Modify: `README.md`, `CONTEXT.md`, `docs/PRODUCT_SPEC.md`, `docs/BACKLOG.md`, `docs/EVALS.md`, `docs/EXPERIMENT_LOG.md` only where current code behavior differs

- [x] Reconcile P0 two-crop/team terms, worker-link browser routing, environment requirements, and migration non-destructiveness.
- [x] Run Python unittests, Node contract checks, AI Node tests, and production build when package manager is available.
- [x] Check `git diff` for scope and no secrets.
