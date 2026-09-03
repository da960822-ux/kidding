# Today Work Team AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the P1 temporary QR team boundary and make supplemented AI drafts return the same publish preflight as initial drafts.

**Architecture:** Backend resolves ephemeral team members and assignments; AI remains identity-free and renders only validated assigned work in the member's selected language. A shared owner-preflight helper keeps initial and supplemented structures under identical safety/override rules.

**Tech Stack:** Node.js built-in test runner, ES modules, JSON contract documents.

**Spec:** `docs/superpowers/specs/2026-09-03-today-work-team-design.md`

## Global Constraints

- P0 supports no worker registration; Today Work Team is P1 and has no current route, storage, or UI implementation.
- P0 supports onion only, `vi|ne` only, and quantity changes only.
- No worker account, phone number, SMS, login, provider exposure, or AI identity inference.
- Backend owns QR links, persistence, authorization, assignments, APIs, and final publish gates.
- AI preserves `UNSPECIFIED`/`null`; `HIGH`/`UNKNOWN`, blocking ambiguity, invalid schema, and empty steps remain non-overridable.
- Add no dependencies and preserve existing user changes.

---

### Task 1: Capture QR team contract and AI boundary

**Files:**
- Create: `docs/superpowers/specs/2026-09-03-today-work-team-design.md`
- Modify: `CONTEXT.md`, `README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/AI_CONTRACTS.md`, `docs/DATA_MODEL.md`, `docs/openapi.yaml`, `docs/FAILURE_MODES.md`, `docs/BACKLOG.md`, `ai/README.md`

**Interfaces:**
- Consumes: existing `WorkSession`, `workerBriefing(structure, languageCode)`, and `vi|ne` language allowlist.
- Produces: `TodayWorkTeam`, `TodayTeamMember`, and `TeamAssignment` contract terms; backend-owned QR and assignment boundary; identity-free AI invocation rule.

- [x] **Step 1: Document canonical vocabulary and product behavior**

Add glossary entries for the P1 temporary roster, anonymous member, and assignment. State that no-roster P0 delivery remains owner-present and that both QR teams and frequent saved workers are P1.

- [x] **Step 2: Document API/data/failure ownership**

Define backend-only team join, roster, assignment, and assigned-work resolution contracts. Require 24-hour expiry, generalized external errors, unassigned-work denial, redaction, and latest `PUBLISHED` work resolution.

- [x] **Step 3: Document AI isolation**

State that the backend supplies a member's validated assigned structure and selected language to `workerBriefing`; nickname never crosses into AI input, output, logs, cache keys, or prompts.

### Task 2: Return owner preflight after a supplement

**Files:**
- Modify: `ai/tests/owner-runtime.test.mjs:91-113`
- Modify: `ai/lib/owner-runtime.mjs:98-130`

**Interfaces:**
- Consumes: valid `structure-v1` returned from `mergeSupplement`.
- Produces: `{ transcript, structure, risk_assessment, publishable, requires_owner_decision, override_allowed, blockers }`.

- [x] **Step 1: Verify the existing supplement test fails**

Run:

```powershell
node --test ai/tests/owner-runtime.test.mjs
```

Expected: the supplement test fails because `result.publishable` is missing.

- [x] **Step 2: Extract one shared owner-preflight helper**

Add an internal helper that runs `preflightSafety(structure)`, derives blocking ambiguity, empty-step, and non-LOW-risk blockers, then derives `publishable`, `requires_owner_decision`, and `override_allowed`. Use it in both `buildOwnerDraft` and `mergeSupplement`.

- [x] **Step 3: Verify the focused test passes**

Run:

```powershell
node --test ai/tests/owner-runtime.test.mjs
```

Expected: all tests pass.

### Task 3: Verify the AI package and contract artifacts

**Files:**
- Modify: plan checkboxes only

**Interfaces:**
- Consumes: AI runtime, manifests, evaluation datasets, and revised contracts.
- Produces: repeatable local evidence; live provider evaluation remains explicitly unrun without server-only credentials.

- [x] **Step 1: Run all AI tests**

```powershell
node --test ai/tests/*.test.mjs
```

Expected: all tests pass.

- [x] **Step 2: Validate non-provider artifacts**

```powershell
node ai/scripts/validate-manifests.mjs ai/manifests
node ai/scripts/validate-transcript-dataset.mjs ai/evals/transcript-v1.jsonl
node ai/scripts/validate-transcript-dataset.mjs ai/evals/transcript-jeolla-v1.jsonl
git diff --check
```

Expected: each command exits 0. Keep video evidence and live provider evaluations marked unrun until their required external inputs exist.
