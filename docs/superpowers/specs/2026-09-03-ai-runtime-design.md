# AI Runtime Design

**Goal:** Complete Batmeori's AI-owned runtime from owner audio to a store-ready bilingual worker briefing, without implementing HTTP, authentication, persistence, version transactions, or UI.

## Scope

- Onion task codes only: `ONION_HARVEST`, `ONION_COLLECT`, `BAGGING`, `LOADING`, `WAREHOUSE_TRANSPORT`, `STACKING`.
- Worker languages only: Vietnamese (`vi`) and Nepali (`ne`).
- Automatic work change only: quantity preview.
- Providers: `gpt-4o-transcribe`, Responses API model from `OPENAI_MODEL` (default `gpt-5.6-terra`), and `gpt-4o-mini-tts`.
- Provider names remain runtime metadata, not fields in the provider-neutral product contracts.

## Boundary

The AI package accepts bytes/text plus checked-in guide and visual manifests and returns validated, store-ready values. It does not expose routes, accept cookies, persist WorkDraft/WorkVersion, issue links, decide the final publish transaction, or render screens. BE must revalidate every AI result before storage and publishing.

## Runtime flow

1. `transcribeAudio` validates non-empty audio input, calls the transcription provider, rejects empty text, and returns `stt-v1`.
2. `interpretTranscript` calls Responses Structured Outputs, parses the response, and validates `structure-v1`.
3. `buildWorkerBriefing(work, languageCode)` creates the requested `vi` or `ne` bundle on demand after BE receives the worker language from FE. Each step is split into action, quantity, order, location, and safety segments.
4. Verified guide rows are preferred for matching action/safety phrases. General misses use schema-bound AI translation. Quantity and order use deterministic templates. Safety misses are blocking and are never AI-translated for publication.
5. `matchVisualAsset` returns only an `APPROVED`, `LOW`, `AI_GENERATED_PREGENERATED` asset for the exact task code; otherwise it returns `null`.
6. `synthesizeSpeech` returns audio bytes plus content hash and provider metadata. TTS failure preserves text and returns an explicit fallback status.
7. `buildOwnerDraft` composes STT, structure, and the single deterministic safety preflight. It returns a publishability report for BE to enforce, not a persisted WorkDraft.
8. `buildWorkerBriefing` validates `languageCode`, performs guide lookup/fallback translation, visual matching, and TTS for only that language, then returns the translated explanation plus a content-based cache key. FE never calls an OpenAI provider directly; BE invokes this AI function and may cache its result.
9. `interpretQuantityChange` returns validated `quantity-change-v1` only; it never stores or confirms a version.

## Failure rules

- Invalid provider response or schema: fail closed with a typed AI error.
- Empty transcript: request re-recording; no structure call.
- Blocking ambiguity, no executable step, HIGH/UNKNOWN risk, or unverified safety translation: `publishable:false`.
- General translation failure: step remains unavailable for that language; publication is blocked until both requested P0 language bundles are complete.
- TTS failure: text remains available and `tts.status` records fallback.
- Missing/rejected/high-risk visual: `visual_asset:null`; text+TTS remains usable.
- Secrets, raw audio, full provider error bodies, and transcripts never appear in error metadata.

## Testing

Use Node built-ins and injected fake provider functions. Tests cover request construction, response extraction, schema rejection, safety gates, guide HIT/MISS, unverified guide rejection, visual eligibility, independent `vi`/`ne` on-demand output, invalid-language rejection, content cache keys, TTS text fallback, and quantity-change parsing. Live provider runs remain separate smoke evidence.
