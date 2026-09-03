# Batmeori Agent Rules

These rules are mandatory for every agent and subagent working in this project.

## Karpathy's Three Principles

1. **Think before coding.** State assumptions, inspect the relevant code and its real execution path, then make a plan proportionate to the change.
2. **Simplicity first.** Prefer the smallest solution that fulfils the stated requirement. Reuse existing code; use standard-library and native platform features before adding dependencies or abstractions.
3. **Surgical changes.** Touch only the files and lines required for the task. Do not refactor adjacent code, reformat unrelated files, or change existing behaviour without an explicit request.

## Mandatory Ponytail for Coding

- For every coding task, invoke the `ponytail` skill in `.agents/skills/ponytail/` before designing, modifying, reviewing, or debugging code. Default level: `full`.
- Follow its solution ladder: first determine whether the work is needed, then reuse local code, standard library, native platform features, installed dependencies, and finally the minimum new code.
- Never simplify away trust-boundary validation, data-loss safeguards, security, accessibility, or explicitly requested behaviour.
- Parent agents must pass this rule to every subagent. Every subagent performing a coding task must invoke `ponytail` before work; no coding subagent is exempt.
- Use the companion Ponytail skills when their trigger matches: `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, and `ponytail-help`.

## Caveman Communication

- Use the `caveman` skill in `.agents/skills/caveman/` as the default response style: concise, precise, no filler, and preserve the user's language.
- Do not sacrifice clarity for brevity in warnings, irreversible actions, security guidance, or multi-step instructions.
- Caveman affects conversational prose only. Keep source code, comments, documentation, commit messages, and externally shared text normally clear and complete.

## Project Skills

- Use `domain-modeling` when defining or changing domain language, `CONTEXT.md`, or ADRs.
- Use `prompt-engineering-patterns` for prompt design and refinement.
- Use `llm-evaluation` when measuring, comparing, or regression-testing LLM behaviour.
- Invoke `grill-me` only when the user explicitly requests a plan or design interview.
- Use `grill-with-docs` when that interview should be grounded in the codebase and its conclusions captured in `CONTEXT.md` or ADRs.

## Batmeori documentation contract

- Product scope for the 1-night/2-day hackathon is onion and strawberry only, Vietnamese (`vi`) and Nepali (`ne`) only, plus quantity changes. Keep this scope explicit; do not imply all-crop or all-language support.
- P0 videos are eight AI-generated-in-advance, human-reviewed assets for the canonical task codes. Store provenance and `review_status`; assets with `safety_level: HIGH` are never publishable. Do not describe direct filming as an implementation path.
- `WorkDraft` is the pre-confirmation state. In P0 a `WorkSession` exists after confirmation and is `PUBLISHED`; its `WorkVersion` values are `PUBLISHED` and `SUPERSEDED`. AI interpretation values are `READY`, `AMBIGUOUS`, and `UNSUPPORTED`; ambiguity is an owner decision state, not a lifecycle state. Canonical version is an integer (`1`, `2`); UI may display `v1`, `v2`.
- Canonical task codes are `ONION_HARVEST`, `ONION_TRIMMING`, `ONION_SORTING`, `ONION_TRANSPORT`, `STRAWBERRY_HARVEST`, `STRAWBERRY_SORTING`, `STRAWBERRY_INSPECTION`, and `STRAWBERRY_PACKING`. Use uppercase snake case. A non-null code must match its `ONION|STRAWBERRY` task family; mismatch is `422 SCHEMA_INVALID`. Do not retain or silently map retired codes.
- P0 has no login UI. Choosing the owner role creates a short automatic demo-owner session cookie; owner mutations still require that cookie and exact Origin validation. Worker links expire 24 hours after issue and always resolve the latest `PUBLISHED` WorkSession version. External access errors are generalized; expired links receive reissue guidance.
- P0 has no worker account, seed worker, phone number, SMS, or worker login. A worker may join an expiring `오늘 작업팀` with a nickname, one of eight nationality codes, and `vi|ne`; this is temporary team membership, not registration. Delivery is either owner-present briefing (`vi|ne`) or one anonymous language-specific 24-hour link.
- STT, LLM, translation, and TTS contracts are provider-neutral. Provider/model selection comes from server-only environment variables; provider names are experiment metadata, never product invariants.
- Government-guide URLs, pages, and translations are data-collection-gate fields until a person verifies the source PDF. Never invent source facts or label unverified text official.
- Product principle: `AI는 추측하지 않는다. 결정은 농장주가 한다.` AI preserves unknowns as `UNSPECIFIED`/`null`. Non-blocking ambiguity can be published as-is only with owner override and reason. Safety ambiguity, HIGH/UNKNOWN risk, schema invalidity, auth/version conflict, or no executable step cannot be overridden; only a LOW-risk unsupported non-safety task may be marked unsupported and sent with text+TTS fallback.
- Every backlog row has exactly one primary owner (`FE`, `BE`, or `AI`).

## 작업 전 필수 문서 읽기

모든 작업은 먼저 `AGENTS.md`→`README.md`→`CONTEXT.md`→`docs/PRODUCT_SPEC.md`→`docs/ARCHITECTURE.md`를 읽는다.

- FE: 위 문서 + `docs/openapi.yaml` + `docs/SAFETY_POLICY.md` + `docs/FAILURE_MODES.md` + `docs/BACKLOG.md`
- BE: 위 문서 + `docs/DATA_MODEL.md` + `docs/openapi.yaml` + `docs/AI_CONTRACTS.md` + `docs/schemas/*.schema.json` + `docs/SAFETY_POLICY.md` + `docs/FAILURE_MODES.md` + `docs/BACKLOG.md`
- AI: 위 문서 + `docs/AI_CONTRACTS.md` + `docs/schemas/*.schema.json` + `docs/SAFETY_POLICY.md` + `docs/EVALS.md` + `docs/EXPERIMENT_LOG.md` + `docs/BACKLOG.md`

문서 충돌 우선순위: `AGENTS.md`(작업규칙) → `CONTEXT.md`(용어) → `docs/PRODUCT_SPEC.md`(범위) → `docs/SAFETY_POLICY.md`(게시 안전) → `docs/openapi.yaml`/`docs/AI_CONTRACTS.md`/`docs/schemas/*.schema.json`(인터페이스) → `docs/DATA_MODEL.md`(저장) → `docs/FAILURE_MODES.md`(실패). 불일치 발견 시 추측 구현 금지; 우선 계약 문서를 수정하고 나머지를 동기화한다.

## 새 기능·계약 문서 게이트

- public behavior, domain, API, AI, data, failure contract에 영향을 주는 구현이나 계약 변경 전에 위 필수 문서와 영향받는 모든 문서를 최대한 읽고 근거를 확인한다.
- 계약에 영향을 주는 구현보다 계약이 먼저다. 도메인 용어는 `CONTEXT.md`, 제품 동작은 `docs/PRODUCT_SPEC.md`, 구성요소 경계는 `docs/ARCHITECTURE.md`, 저장 구조는 `docs/DATA_MODEL.md`, HTTP 계약은 `docs/openapi.yaml`, AI 입출력은 `docs/AI_CONTRACTS.md`와 `docs/schemas/*.schema.json`, 게시 안전은 `docs/SAFETY_POLICY.md`, 평가와 실패는 `docs/EVALS.md`와 `docs/FAILURE_MODES.md`, 실행 순서는 `docs/BACKLOG.md`를 먼저 갱신한다.
- 계약 영향이 없는 스타일, 문구 오탈자, 내부 리팩터링, 계약 불변 버그 수정은 이 게이트 적용 대상이 아니다. 기존 관련 계약을 읽고 불변임을 확인하는 것은 유지한다.
- 계약 영향 작업에 필요한 권위 문서가 없으면 조용히 새 형식이나 파일을 만들지 않는다. 사용자에게 제안 파일 경로, 필요한 이유, 그 문서가 소유할 계약, 영향받는 역할을 반드시 보고한다.
- 계약 영향 작업에서 새 문서가 필요하다고 보고한 경우 문서를 생성·연결하고, 기존 문서가 있으면 해당 문서를 수정한 뒤 구현을 시작한다.
- 계약 영향 코드와 문서 갱신은 같은 작업에서 완료한다. `code first, docs later`와 문서에 없는 임시 계약을 금지한다.
- 계약을 바꾼 작업은 관련 예제·오류·상태·버전·역할별 인계물과 검증 기준도 함께 갱신한다.
- 부모 에이전트는 이 게이트와 필수 문서 목록을 모든 서브에이전트에게 전달한다.
- 문서끼리 충돌하거나 새 문서가 기존 책임을 중복하면 임의로 선택하지 말고 사용자에게 보고한 뒤 위 우선순위의 권위 문서부터 정리한다.
