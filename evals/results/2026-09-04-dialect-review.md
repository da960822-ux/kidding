# 2026-09-04 mock E2E and live dialect evaluation

## Decision

Not release-ready on dialect quality. Passing mock E2E does not prove STT or semantic accuracy. No production prompt, application behavior, database, deployment, or existing assets were changed in this evaluation.

## Runs

| Run | Inputs and boundary | Field checks |
| --- | --- | --- |
| Mock browser E2E | Login, draft, confirmation, co-present, remote, team join/assignment, quantity refresh, errors and UI regressions; mock API/media | 32/32 pass; parent repeat 46.4 seconds |
| `dialect-20260903T195646Z` | Production Node AI bridge plus backend validators; 31 existing transcript cases, 8 existing authored dialect cases, 8 new holdout cases, 3 synthetic audio cases | 43/50 pass |
| `dialect-20260903T195734Z` | 7 newly synthesized dialect WAVs through STT then production structure/quantity parsing and backend validators | 4/7 pass |
| `dialect-20260903T195911Z` | 4 follow-up synthetic WAVs with spoken numerals or a named field | 1/4 pass |

UTC directory timestamps correspond to September 4 in Korea. These are small authored fixtures, not representative human speech or an unbiased accuracy estimate. Existing `transcript-v2` contains two negative-family validator fixtures; they were excluded from live-model scoring, not counted as model successes. New holdout text field checks passed 8/8, but matching audio exposed additional failures.

The initial audio score is incomplete: cases 03 and 05 passed their declared fields despite losing the numbered field identity; 03 also added a blocking ambiguity. Therefore 4/7 is not a complete semantic success rate. Raw outputs are preserved unchanged. Two initial safety-case failures concern expected AI labels; the backend correctly blocked both pesticide and tractor instructions. Do not describe these as safety bypasses.

## Concrete findings

1. **Dialect action recall:** `양파 창고로 날러부러` returned `UNSUPPORTED` with null task code. The intended manual movement with an explicit destination is `ONION_TRANSPORT`. Video availability must remain separate from classification.
2. **Unit/action boundary:** Follow-up speech transcribed `스무 망캐갖고`. Structure returned `{value:20, unit:"망캐"}`, omitted harvesting, and marked the draft `READY`. This is a semantic failure despite valid schema and a LOW risk result.
3. **Lost harvesting:** Synthetic `서른두 망 캐서` became `서른두 망 해서`; the first audio run retained transport only. A follow-up correctly transcribed `망캐서` but added an unnecessary ambiguity and omitted transport.
4. **Numbered field/quantity confusion:** Synthesized `2번 밭` was transcribed as `두 번 밭`. Despite `수량은 아직 모르겠어`, structure assigned `{value:2, unit:"번"}` and returned `READY`. System.Speech numeral pronunciation contributes to this fixture; it is not evidence about a real speaker's pronunciation. Spelled-out numerals still produced `이번` and lost the field. A named-field control preserved unknown quantity.
5. **Missing clarification:** `저짝`/`저쪽` produced DEICTIC location with no LOCATION ambiguity; `수량은 나중에` produced READY with unspecified quantity and no QUANTITY ambiguity. Current backend normalization changes existing ambiguity flags but does not add missing ambiguities.
6. **Display fidelity:** `잎하고` became `입하고` in the initial synthetic audio, and that wording remained in the trimming title. This reproduces the class of user-visible transcription error previously reported.
7. **Golden-data review:** `딸기 담아부러` is expected as packing in the authored regression set but is less explicit than `상자에 포장해부러`; review the expected meaning rather than silently changing output to match.

## Why prior tests missed this

`src/webapp/mock-api.ts` returns the same draft from `createDraft(_audio)`, regardless of audio. Browser tests correctly exercise frontend wiring but cannot detect missing task recognition, bad STT, server authorization, database transactions, or translation correctness. Production structure validation primarily checks shape, allowed codes, family, and policy; syntactically valid wrong units or omitted steps can pass.

## Reproduction

```powershell
$env:PYTHONIOENCODING = 'utf-8'
& backend/.venv/Scripts/python.exe backend/evaluate_dialect.py
& C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -File scripts/generate-dialect-audio.ps1 -OutputDirectory tmp/dialect-new-run
& backend/.venv/Scripts/python.exe backend/evaluate_dialect.py tmp/dialect-new-run/manifest.jsonl
```

Live evaluation makes paid provider calls using existing server-only environment configuration. It does not write to Supabase. Use a fresh audio output directory. Generated WAVs and their voice/rate/hash manifests for this run are under `tmp/dialect-audio-20260904-run1` and `tmp/dialect-spoken-20260904-run1`; no human recording is stored. Persistent JSONL results contain authored input, recognized transcript, raw structure and backend gate result, not credentials or audio bytes.

The evaluator's unit, missing-step, unknown-quantity and ambiguity checks have four offline regression tests in `backend/test_dialect_evaluation.py`. Field-level scoring is intentionally not presented as complete human semantic evaluation or full production HTTP E2E.

## Next changes to agree and verify

- Recognize ordinary dialect movement semantically, without a phrase-specific replacement table.
- Keep transport task classification independent from media; user requested onion transport with text/audio but no video. Existing manifest currently contains an approved current transport video. Confirm whether to disable it for all new onion-transport packages while preserving previously published immutable versions.
- Prevent uncertain unit/action splits and contradictory quantity statements from silently reaching READY; test new wording, not only the failing fixture.
- Require the specified clarification for deictic location and explicitly unresolved quantity.
- Tighten semantic evaluation (numbered location identity, unexpected blocking questions, omitted steps), then rerun without changing the original failing evidence.
