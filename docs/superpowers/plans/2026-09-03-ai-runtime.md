# AI Runtime Implementation Plan

**Goal:** Implement the AI-only owner and worker pipelines described in `docs/superpowers/specs/2026-09-03-ai-runtime-design.md`.

## Constraints

- No FE, BE route, authentication, database, link, version transaction, or deployment code.
- Contract documentation changes precede implementation.
- Use standard-library Node modules and dependency injection; add no package.
- Tests first for every non-trivial branch.

## Tasks

- [ ] Document runtime outputs and the AI/BE boundary in `docs/AI_CONTRACTS.md`, `docs/ARCHITECTURE.md`, `docs/EVALS.md`, and `ai/README.md`.
- [ ] Add a reusable OpenAI provider client for Responses, transcription, and speech with timeout, bounded retry, safe errors, and response parsing.
- [ ] Add canonical contract validation for structure, quantity change, and translation results.
- [ ] Add guide loading/matching and translation segment creation for `vi` and `ne`.
- [ ] Add deterministic quantity/order/location segments and safety translation blocking.
- [ ] Add exact visual asset eligibility/matching.
- [ ] Add owner draft orchestration, supplement interpretation, quantity preview, on-demand `vi|ne` worker briefing, content cache key, and TTS fallback.
- [ ] Add unit/integration tests with fake providers and CLI smoke coverage.
- [ ] Run all AI tests, validators, help commands, and `git diff --check`; report live-provider checks separately.
