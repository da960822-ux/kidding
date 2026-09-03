# Dialect context and delivery review — 2026-09-04

## Changes and scope

- Luna added `ai/references/dialect-v2.json`: 16 semantic groups and 96 distinct surface forms for onion/strawberry work, quantities, places, directions, and sequence. These are advisory candidates, not a phrase-to-answer replacement table.
- Each selected reference retains its pending-review/advisory status. Evidence-bearing entries link to source IDs; lookup-only pages do not verify a form. Standard agricultural terminology evidence does not verify every dialect variant in a group. Self-authored examples are not official quotations or human-verified field recordings.
- Initial structure, supplement, and quantity parsing reuse bounded lexical selection (at most eight groups). No vector database, dependency, additional model call, or transcript rewriting was introduced. Existing STT verification is unchanged.
- Backend adds a non-blocking LOCATION question for unqualified DEICTIC output and reconciles READY with remaining ambiguities. Safety validation still runs first.
- New ONION_TRANSPORT packages retain the action, text, and TTS while omitting only the transport video. Existing stored packages and other videos are unchanged.
- Docker context now includes the two active reference JSON files. Docker CLI was unavailable, so no container-image build is claimed.

## First comparison, unchanged inputs and model

Model metadata: `gpt-5.6-terra`; STT `gpt-transcribe`. Results are production Node bridge calls with backend validation, without database writes. These are not production HTTP/browser E2E calls. The combined 50-case diagnostic run mixes 47 text cases and three STT smoke cases; it is not the separate release-tier denominator.

| Set | Before | First candidate | Evidence directory |
|---|---:|---:|---|
| Existing 47 text + 3 synthetic smoke inputs | 43/50 | 47/50 | `dialect-20260903T202447Z` |
| Seven synthesized dialect recordings | 4/7 | 6/7 | `dialect-20260903T202451Z` |
| Four spoken-numeral/named-location recordings | 1/4 | 3/4 | `dialect-20260903T202513Z` |
| Six new context holdouts | Not run before | 4/6 | `dialect-20260903T202407Z` |

These are specified-field check counts, **not full semantic accuracy**. Old raw results and expectations are preserved. Prompt, dictionary, and backend guard changed together; this experiment does not isolate dictionary-only improvement or establish statistical significance.

Observed improvements include dialect transport classification, unresolved quantity clarification, deictic clarification, and preserving quantity/action boundaries and multi-step sequences in several recordings. The model no longer assigned the field number as the unknown quantity in the repeated unknown-quantity recording.

## Failures and scoring caveats

- `v2-25`/`v2-26`: raw safety ambiguity labels differ from the old gold, but both still produce HIGH risk and `OVERRIDE_NOT_ALLOWED`. These are not safety bypasses.
- `v2-29`: mixed onion/strawberry instructions regressed to an invalid single-family structure. The final refinement explicitly requests separate crop instructions instead of combining incompatible task codes.
- `audio-holdout-02`: STT still changes the harvest verb into a generic verb. Structure preserves transport but loses harvest. A dictionary cannot establish a missing spoken fact; no fixed word replacement was added.
- `audio-spoken-01`: field check says PASS, but STT corrupts the initial field into unrelated words and structure uses the destination as location. This is **not** full semantic success. The final refinement separates source location from movement destination and requests clarification for unresolved source text.
- `audio-spoken-07`: STT corrupts the source location; quantity remains unknown with a blocking question, but the location is lost.
- New holdout 01: all four steps and 17 sacks are retained, but an anchored relative location is classified DEICTIC instead of NAMED. New holdout 05 preserves the original named field and unknown quantity; its exact canonical-name assertion fails because canonical_name is null. The schema permits null; this strict canonicalization check must not be misreported as a lost spoken number.
- Synthetic Windows TTS is not a farmer's dialect pronunciation. Real-speaker recording quality, noise, accent, and mobile microphone accuracy remain unmeasured.

## Verification

- First candidate `pnpm test`: 9/9 suites, including 53 Node tests, 73 backend tests, and 32 mock browser tests (46.7 s).
- Stored transport-video read regression passes without invoking package regeneration.
- No migration, deployment, database reset, commit, or push was performed for this work.

## Final prompt refinement and source audit

| Set | Specified-field checks | Evidence directory |
|---|---:|---|
| Existing 47 text + 3 synthetic smoke inputs | 47/50 | `dialect-20260903T202803Z` |
| Seven synthesized dialect recordings | 6/7 | `dialect-20260903T202729Z` |
| Four spoken-numeral/named-location recordings | 1/4 | `dialect-20260903T202741Z` |
| Six new context holdouts | 5/6 | `dialect-20260903T202722Z` |

Mixed-family `v2-29` now asks for clarification instead of failing the runtime contract. `v2-24` still labels raw output READY while including a location question; the backend correctly returns AMBIGUOUS. Safety cases remain blocked. The lower 1/4 audio count is not hidden: the old score accepted the destination substituted for the source field; the refined output leaves corrupted source text unspecified or deictic instead. Those are safer fallbacks, not successful recognition of the original spoken field.

The new holdout 05 now intermittently omits the explicitly unresolved-quantity question, despite preserving its unknown value. This remains a release-quality issue. A finite advisory dictionary and prompt rules cannot guarantee all semantic ambiguity decisions, and inventing the missing facts or universally blocking every optional missing quantity would not be an acceptable fix.

Parent source audit rejected the supposed transport citation `nknews/200107/36_8.html`: that text concerns flying in a poem, not carrying produce. It was removed from the dictionary. The transport hint remains a self-authored candidate. The `여그` newsletter example is an internet-post observation, not evidence of regional frequency. The Gurye research is labeled primary research rather than attributed to NIKL. This final provenance-only correction changed the reference hash from `678aa255828001bc84548721f185aec02f7edf552407a3fd007e7a7526634b64` to `0e202c400b3679fce0bda967b8d6ea1025e662cad86b023dcbba1af433a8b36b`; no forms, semantic candidates, or retrieval rules changed. The full live counts above precede that metadata correction; final Node tests pass 53/53 afterward.

Conclusion: dictionary/runtime implementation is complete; semantic release approval is **not** established. Preserve raw failures and continue testing real speech when available. No claim of fully corrected STT, human dialect accuracy, or deployment readiness is made.
