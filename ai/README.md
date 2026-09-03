# AI P0 artifacts

This directory contains the provider-neutral AI runtime plus versioned evaluation and import artifacts for onion P0. The runtime exposes library functions only; it does not implement HTTP routes, authentication, persistence, version transactions, links, or UI. Provider, model, and voice values below are private run metadata, never public API fields or product invariants.

The worker flow is on demand: FE sends `vi` or `ne` to BE, BE validates it and calls the AI runtime, and the runtime returns that language's translated briefing, eligible visual match, TTS result, and content cache key. FE never receives an OpenAI key or calls a provider directly.

Runtime entry point: `ai/index.mjs`. `createBatmeoriAi()` exposes `ownerDraftFromAudio`, `supplementDraftFromAudio`, `quantityChangeFromAudio`, and `workerBriefing`. Inject a fake provider for tests or omit it to use the server-only OpenAI adapter.

`supplementDraftFromAudio` returns the reinterpreted structure plus the same
owner preflight fields as `ownerDraftFromAudio`. A future P1 `TodayWorkTeam`
does not change this interface: the backend resolves a member assignment and
calls `workerBriefing` with only its validated structure and selected `vi|ne`.
Nicknames and member IDs never enter AI input, output, prompts, logs, or cache
keys.

```js
import { createBatmeoriAi } from './ai/index.mjs';

const ai = createBatmeoriAi({
  // Set true only after a person verifies the guide rows against both PDFs.
  guideReviewApproved: false,
});

const ownerDraft = await ai.ownerDraftFromAudio(audioBytes, { filename: 'recording.webm', mimeType: 'audio/webm' });
const worker = await ai.workerBriefing(publishedStructure, languageCode); // vi | ne
```

The default provider reads `OPENAI_API_KEY` and `OPENAI_MODEL` only on the server. `OPENAI_MODEL` defaults to `gpt-5.6-terra`; STT and TTS use `gpt-4o-transcribe` and `gpt-4o-mini-tts`. `worker.tts.audio` is runtime-only bytes for BE to cache or turn into a URL. When speech generation fails, `worker.text` remains the source of truth and `worker.tts.status` is `FALLBACK_TEXT`.

The canonical schemas in `docs/schemas/` remain the validation authority. The OpenAI request builder removes schema metadata and unsupported composition keywords, converts typed `oneOf` alternatives to `anyOf`, and adds required types to `const`/`enum` fields. Constraint-only alternatives are omitted from the provider schema; prompt rules and BE validation against the original contract remain mandatory.

## Required artifact paths

### `ai/evals/transcript-v1.jsonl`

Each JSONL row has one gold payload selected by `kind`:

```text
id,dataset_version,kind,transcript,gold_structure|gold_quantity
```

`gold_structure` conforms to `structure-v1`; `gold_quantity` conforms to `quantity-change-v1`.

This is the general colloquial baseline, not evidence of Jeolla dialect performance.

### `ai/evals/transcript-jeolla-v1.jsonl`

Uses the same row contract for 30 synthetic Jeolla dialect regression cases. `ai/evals/transcript-jeolla-v1.provenance.json` maps every case to documented dialect markers and source pages. It remains experiment-only while native-speaker `review_status` is `PENDING`.

### `ai/manifests/guide_phrases.csv`

```text
phrase_key,category,canonical_ko,phrase_type
```

### `ai/manifests/guide_translations.csv`

```text
phrase_key,language_code,translated_text,source_name,source_page,source_url,license,verified
```

Rows provide the verified guide input for `translation-v1`. Only `vi` and `ne` are in P0.

### `ai/manifests/visual_assets.csv`

```text
id,task_code,asset_type,public_path,provenance,generator_provider,prompt_version,generated_at,reviewer,review_status,safety_level,purpose,captions_text
```

`generator_provider` is generation-run metadata. Assets require provenance, human review status, and safety level before BE may import them.

### `ai/manifests/tts-smoke-v1.jsonl`

```text
id,language_code,text,text_sha256,model,voice,response_format,status,audio_sha256,recorded_at,contract_version
```

Each JSONL row records a `tts-v1` smoke run. `model` and `voice` are run metadata. Audio input fixtures exercise `stt-v1`; transcript gold data exercises `structure-v1` and `quantity-change-v1`.
