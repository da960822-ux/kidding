# AI P0 Deliverables Design

**Goal:** Frontend and backend implementation without change, prepare the AI contracts, prompts, evaluation evidence, source provenance, and visual/TTS manifests needed for Batmeori P0.

**Scope:** Onion only; output languages only `vi` and `ne`; automatic change support only for quantities. This design does not create an AI service, queue, database schema, frontend, or backend adapter.

## Runtime choices

- LLM requests use the OpenAI Responses API. The current server-only evaluation model setting is `OPENAI_MODEL=gpt-5.6-terra`.
- `gpt-5.6-terra` is a comparison candidate only after Luna misses a P0 release gate on the same dataset and prompt version.
- STT uses OpenAI Audio Transcriptions API with `gpt-4o-transcribe`. No `faster-whisper` model deployment is part of P0.
- TTS evaluation uses OpenAI Audio Speech API with `gpt-4o-mini-tts` for Vietnamese and Nepali output. Voice selection is evaluated metadata, not a public contract field.
- Provider and model names remain execution metadata. `structure-v1`, `quantity-change-v1`, `translation-v1`, and `tts-v1` stay provider-neutral public contracts.

## Deliverable order

1. Revalidate the three existing JSON Schemas and their examples against `AI_CONTRACTS.md` and `SAFETY_POLICY.md`.
2. Author versioned OpenAI Responses API prompts for `structure-v1` and `quantity-change-v1`, using JSON Schema Structured Outputs. Prompts preserve unknowns, treat transcript text as untrusted input, and never add safety content.
3. Create a 30-case de-identified Jeolla-dialect transcript/gold set. It includes at least five quantity-change cases and five ambiguous cases. Production or collected audio is excluded.
4. Run Luna first. Record dataset version, prompt version, model metadata, metrics, and failing input IDs. Run Terra only if Luna misses a release gate.
5. Run `gpt-4o-transcribe` against the existing three synthetic Korean WAV fixtures; record file/header/duration, non-empty transcript, model metadata, and expected-case results.
6. Synthesize and human-check Vietnamese and Nepali sample text with `gpt-4o-mini-tts`. Record success or failure, voice metadata, output hash, and text fallback evidence.
7. Extract government-guide rows only after humans verify each language PDF, page, URL, license, and translation. Unverified rows never claim `OFFICIAL_GUIDE`; safety expression misses block publication.
8. Prepare one AI-generated, human-reviewed LOW video manifest row for each of the six allowlisted onion task codes. A missing video is text+TTS fallback, not a reason to invent an asset.
9. Hand BE the prompt versions, immutable schema copies, evaluation artifacts, guide provenance manifest, visual manifest, and TTS manifest. BE alone integrates adapters and applies publish gates.

## Acceptance gates

- Schema validity: 30/30.
- Step and `task_code` accuracy: at least 90%.
- Quantity change: 5/5.
- Ambiguity preservation and invented safety: 0 failures.
- Official-guide HIT and translation provenance: 100% for verified HIT rows.
- STT smoke: 3/3.
- Failed TTS still leaves verified display text available.
- Every visual asset is `AI_GENERATED_PREGENERATED`, `APPROVED`, and `LOW`; HIGH assets are never publishable.

## Required evidence format before implementation

`docs/EVALS.md` defines required evaluation artifacts but not the JSONL row shapes, prompt-file location, or manifest field layouts for this new work. Before creating those artifacts, update the documents that own each contract: `docs/EVALS.md` for evaluation JSONL/run artifacts, `docs/reference/government_guide_extraction_workbook.md` for guide imports, and `docs/DATA_MODEL.md` for visual/TTS manifest fields. This avoids undocumented formats.

## Sources

- [GPT-5.6 Terra model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [Responses API structured outputs reference](https://developers.openai.com/api/reference/cli/resources/beta/subresources/responses)
- [OpenAI Audio Speech API reference](https://platform.openai.com/docs/api-reference/audio/voice-consent-list?lang=curl)
