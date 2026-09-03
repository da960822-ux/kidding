# AI P0 Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI-owned prompt, evaluation, smoke-test, and manifest artifacts for onion-only Batmeori P0 without changing frontend or backend implementation.

**Architecture:** `ai/` is an offline, AI-owned artifact workspace. Node built-ins run validation and optional provider smoke tests; no server, database, queue, frontend, or backend adapter is created. OpenAI Responses uses `gpt-5.6-terra` and the existing JSON Schemas; OpenAI Audio APIs use `gpt-4o-transcribe` and `gpt-4o-mini-tts` only through server-style environment variables when a smoke run is explicitly launched.

**Tech Stack:** Markdown, JSON Schema, JSONL/CSV, Node.js built-in `node:test`, built-in `fetch`, OpenAI APIs for optional live smoke runs.

**Spec:** `docs/superpowers/specs/2026-09-03-ai-p0-deliverables-design.md`

## Global Constraints

- P0 supports only `ONION`, `vi`, `ne`, and quantity changes.
- Do not modify frontend or backend source, database schema, OpenAPI, or public API behavior.
- Preserve unknown facts as `UNSPECIFIED` or `null`; never invent safety content.
- `SAFETY` ambiguity, HIGH/UNKNOWN risk, invalid schema, and empty executable steps remain blocking.
- AI contracts remain provider-neutral; provider/model values are run metadata only.
- `OPENAI_MODEL=gpt-5.6-terra` is the current evaluation model after the recorded Luna gate failure.
- STT smoke target is `gpt-4o-transcribe`; TTS smoke target is `gpt-4o-mini-tts`.
- Live runs require `OPENAI_API_KEY`; no secrets, raw audio, or fabricated provider results enter Git.
- Guide rows require human-verifiable PDF/page/URL/license evidence; video rows require human review. Missing evidence stays absent or `PENDING`, never `APPROVED`.

---

### Task 1: Define AI artifact contracts before artifacts

**Files:**
- Modify: `docs/EVALS.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/reference/government_guide_extraction_workbook.md`
- Create: `ai/README.md`

**Interfaces:**
- Produces: exact paths and row shapes for Tasks 2-5.
- Consumes: `structure-v1`, `quantity-change-v1`, `translation-v1`, `stt-v1`, `tts-v1` contracts.

- [ ] **Step 1: Add the contract assertions as a failing test**

Create `ai/tests/artifact-contracts.test.mjs` to require these paths and tokens:

```js
assert.match(evals, /ai\/evals\/transcript-v1\.jsonl/);
assert.match(dataModel, /ai\/manifests\/visual_assets\.csv/);
assert.match(workbook, /ai\/manifests\/guide_translations\.csv/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test ai/tests/artifact-contracts.test.mjs`
Expected: FAIL because artifact paths are not documented.

- [ ] **Step 3: Add minimal contract documentation and README**

Document these paths and fields exactly:

```text
ai/evals/transcript-v1.jsonl
id, dataset_version, kind, transcript, gold_structure|gold_quantity

ai/manifests/guide_phrases.csv
phrase_key,category,canonical_ko,phrase_type

ai/manifests/guide_translations.csv
phrase_key,language_code,translated_text,source_name,source_page,source_url,license,verified

ai/manifests/visual_assets.csv
id,task_code,asset_type,public_path,provenance,generator_provider,prompt_version,generated_at,reviewer,review_status,safety_level,purpose,captions_text

ai/manifests/tts-smoke-v1.jsonl
id,language_code,text,text_sha256,model,voice,response_format,status,audio_sha256,recorded_at,contract_version
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test ai/tests/artifact-contracts.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add docs/EVALS.md docs/DATA_MODEL.md docs/reference/government_guide_extraction_workbook.md ai/README.md ai/tests/artifact-contracts.test.mjs && git commit -m "docs: define AI artifact contracts"`

### Task 2: Create schema-bound OpenAI prompt artifacts

**Files:**
- Create: `ai/prompts/prompt-structure-001.md`
- Create: `ai/prompts/prompt-quantity-change-001.md`
- Create: `ai/lib/openai-requests.mjs`
- Create: `ai/tests/openai-requests.test.mjs`

**Interfaces:**
- Consumes: `docs/schemas/structure-v1.schema.json`, `docs/schemas/quantity-change-v1.schema.json`, `OPENAI_MODEL`.
- Produces: `buildStructureRequest(transcript)` and `buildQuantityChangeRequest(transcript, expectedVersion)` request objects for `POST /v1/responses`.

- [ ] **Step 1: Write failing request-builder tests**

```js
assert.equal(request.model, process.env.OPENAI_MODEL || 'gpt-5.6-terra');
assert.equal(request.text.format.type, 'json_schema');
assert.equal(request.text.format.name, 'structure_v1');
assert.match(request.input.at(-1).content, /<untrusted_transcript>/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test ai/tests/openai-requests.test.mjs`
Expected: FAIL because `ai/lib/openai-requests.mjs` does not exist.

- [ ] **Step 3: Write minimal prompts and request builders**

The structure prompt must allow only six canonical task codes, preserve unknowns, prohibit invented safety, prohibit tool use, and put transcript content in delimiter tags. The quantity prompt must return only one positive integer `{value, unit}` candidate or one blocking `QUANTITY` ambiguity. Builders read the checked-in schema JSON and set Responses `text.format` to `{type:'json_schema', strict:true, name, schema}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test ai/tests/openai-requests.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add ai/prompts ai/lib/openai-requests.mjs ai/tests/openai-requests.test.mjs && git commit -m "feat: add schema-bound AI prompts"`

### Task 3: Build de-identified transcript evaluation dataset and validator

**Files:**
- Create: `ai/evals/transcript-v1.jsonl`
- Create: `ai/scripts/validate-transcript-dataset.mjs`
- Create: `ai/tests/validate-transcript-dataset.test.mjs`

**Interfaces:**
- Consumes: Task 1 dataset shape, Task 2 prompt contract, current JSON Schemas.
- Produces: `validateDataset(records)` returning `{caseCount, quantityChangeCount, ambiguousCount}` or throwing a specific validation error.

- [ ] **Step 1: Write failing validator tests**

```js
assert.deepEqual(validateDataset(validCases), {
  caseCount: 30,
  quantityChangeCount: 5,
  ambiguousCount: 5,
});
assert.throws(() => validateDataset(validCases.slice(0, 29)), /exactly 30/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test ai/tests/validate-transcript-dataset.test.mjs`
Expected: FAIL because validator does not exist.

- [ ] **Step 3: Add the minimal validator and 30 cases**

Use fictional, de-identified Korean transcript text only. Add at least five `kind: "QUANTITY_CHANGE"` cases with `gold_quantity` and five `kind: "AMBIGUOUS"` cases that preserve a real ambiguity. Do not add raw audio, personal data, unsafe task instructions, unverified translations, or invented safety text.

- [ ] **Step 4: Run validator and tests**

Run: `node ai/scripts/validate-transcript-dataset.mjs ai/evals/transcript-v1.jsonl && node --test ai/tests/validate-transcript-dataset.test.mjs`
Expected: reports 30 cases, at least five quantity changes, at least five ambiguities; tests PASS.

- [ ] **Step 5: Commit**

Run: `git add ai/evals ai/scripts/validate-transcript-dataset.mjs ai/tests/validate-transcript-dataset.test.mjs && git commit -m "test: add AI transcript evaluation set"`

### Task 4: Add optional OpenAI evaluation and audio smoke runners

**Files:**
- Create: `ai/scripts/run-openai-eval.mjs`
- Create: `ai/scripts/run-stt-smoke.mjs`
- Create: `ai/scripts/run-tts-smoke.mjs`
- Create: `ai/tests/provider-requests.test.mjs`

**Interfaces:**
- Consumes: Task 2 builders, Task 3 dataset, `evals/audio/manifest.jsonl`, `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Produces: local untracked run artifacts `metrics.json`, `failures.jsonl`, `stt-smoke-results.jsonl`, `tts-smoke-results.jsonl`.

- [ ] **Step 1: Write failing provider-request tests**

```js
assert.equal(sttRequest.url, 'https://api.openai.com/v1/audio/transcriptions');
assert.equal(ttsRequest.url, 'https://api.openai.com/v1/audio/speech');
assert.equal(ttsRequest.body.model, 'gpt-4o-mini-tts');
assert.throws(() => requireOpenAiKey({}), /OPENAI_API_KEY/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test ai/tests/provider-requests.test.mjs`
Expected: FAIL because provider request helpers do not exist.

- [ ] **Step 3: Write minimal runners**

Use built-in `fetch`, `FormData`, and `Blob`; do not add an SDK. Each runner requires `OPENAI_API_KEY`, redacts it from output, uses a user-selected output directory outside Git, and writes no audio or transcript beyond designated local run artifacts. STT sends `model=gpt-4o-transcribe`; TTS sends `model=gpt-4o-mini-tts`, a built-in voice, `mp3`, and at most 4096 input characters. The runner never treats output as release evidence until human review.

- [ ] **Step 4: Run tests and no-key guard**

Run: `node --test ai/tests/provider-requests.test.mjs && node ai/scripts/run-stt-smoke.mjs --help && node ai/scripts/run-tts-smoke.mjs --help`
Expected: tests PASS; help exits 0 without requiring a key.

- [ ] **Step 5: Commit**

Run: `git add ai/scripts/run-openai-eval.mjs ai/scripts/run-stt-smoke.mjs ai/scripts/run-tts-smoke.mjs ai/tests/provider-requests.test.mjs && git commit -m "feat: add AI evaluation smoke runners"`

### Task 5: Create safe guide, visual, and TTS manifests

**Files:**
- Create: `ai/manifests/guide_phrases.csv`
- Create: `ai/manifests/guide_translations.csv`
- Create: `ai/manifests/visual_assets.csv`
- Create: `ai/manifests/tts-smoke-v1.jsonl`
- Create: `ai/scripts/validate-manifests.mjs`
- Create: `ai/tests/validate-manifests.test.mjs`

**Interfaces:**
- Consumes: Task 1 manifest contracts.
- Produces: import-ready empty guide templates, a six-row PENDING visual production plan, two PENDING TTS checks, and `validateManifests(root)`.

- [ ] **Step 1: Write failing manifest tests**

```js
assert.equal(visualRows.length, 6);
assert.deepEqual(visualRows.map(({ task_code }) => task_code), TASK_CODES);
assert.ok(visualRows.every(({ review_status }) => review_status === 'PENDING'));
assert.throws(() => validateGuideRow(unverifiedOfficialRow), /OFFICIAL_GUIDE/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test ai/tests/validate-manifests.test.mjs`
Expected: FAIL because manifest validator does not exist.

- [ ] **Step 3: Add minimal manifests and validator**

Create empty guide CSVs with only canonical headers. Create six visual rows, one for each allowed task code, with `review_status:PENDING`, no `public_path`, no reviewer, and no `APPROVED` claim. Create one `PENDING` TTS check for each `vi` and `ne` sample. Validator rejects a claimed official guide without evidence and any visual `APPROVED` row that is not LOW, pre-generated AI provenance, complete, and human-reviewed.

- [ ] **Step 4: Run tests and validator**

Run: `node --test ai/tests/validate-manifests.test.mjs && node ai/scripts/validate-manifests.mjs ai/manifests`
Expected: tests PASS; templates report pending work, not publishable evidence.

- [ ] **Step 5: Commit**

Run: `git add ai/manifests ai/scripts/validate-manifests.mjs ai/tests/validate-manifests.test.mjs && git commit -m "docs: add AI review manifests"`

## Verification

- [ ] Run all AI tests: `node --test ai/tests/*.test.mjs`.
- [ ] Validate dataset and manifests with their CLI scripts.
- [ ] Run `git diff --check`.
- [ ] Verify only `ai/` and documented AI contract files changed: `git diff --name-only HEAD`.
- [ ] Do not claim live OpenAI evidence until `OPENAI_API_KEY` is configured and each smoke/evaluation runner has a fresh result artifact.
