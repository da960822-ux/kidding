# Full workflow integration E2E — 2026-09-04

## Scope and environment

- Production frontend: https://batmeori.vercel.app
- Production API: https://batmeori-api.onrender.com
- Fix under test: `36f90e1cc16d000727beac4e93058754b91e9454` (frontend only).
- Backend runtime: `a12aca0b059f2e57c37ee04d663188e8abdf3962`; `/health` and `/ready` both verified after the frontend deployment.
- Real Chromium UI, MediaRecorder, multipart upload, STT, LLM, Supabase, translation, video and TTS. Only the microphone source is replaced with documented synthetic WAV audio. No API responses, cookies, work versions or confirmation receipts are injected.
- Owner, Vietnamese worker, Nepali worker and anonymous remote visitor use separate browser contexts. Owner monitoring views remain open while a separate owner tab changes the instruction.
- Audio scenario: harvest and transport 20 onion bags; owner corrects the draft to 15 bags before publishing v1; owner previews and confirms 10 bags as v2 after both workers acknowledge v1.

## Reproduced defects and fixes

Owner current-work view, home work list and team assignment labels retained an earlier quantity after another tab published a new version. The worker, remote and co-present paths already refreshed. Separate failing browser tests reproduced all three owner cases. The production browser run also reproduced the stale current-work screen after real v2 publication.

The fix adds visible-page polling/focus refresh to owner current/home views and refreshes the team's work list along with its receipt roster. Single-flight guards prevent overlapping reads. Existing ownership, PIN, QR, expiry and publication contracts remain unchanged. Three regression tests passed after the fix; the full current-working-tree browser suite passed **53/53**, and TypeScript/Vite build passed.

Two initial browser failures referenced an old delivery button removed by concurrent UI work. Those tests were updated in that UI work and passed in the full rerun. Concurrent landing/accessibility changes were not included in the refresh-fix commit.

## Live verification

Final production run: **PASS — 9/9 stages in 215.5 seconds**, using a fresh team after the frontend fix was deployed. Full stage results, input provenance, deployment revisions and a read-only stored-version check are preserved in `evals/results/full-workflow-20260904/`.

The final run verified the following with actual services:

| Check | Evidence |
|---|---|
| Recording, STT, structure | `ONION_HARVEST`, `ONION_TRANSPORT`, order 1–2, 20 bags, named field before warehouse |
| Owner correction before confirmation | 20 → 15 bags; no WorkSession exists before confirmation |
| Owner publication | Immutable v1; active team management access appears only after confirmation |
| Translated storyboard and media | vi/ne complete ordered steps and context; no Korean leakage; APPROVED/LOW harvest video plays |
| Missing video fallback | Transport has no matched video; text guidance remains; full vi/ne TTS audio actually plays |
| Remote and QR/team entry | Rendered QR successfully decoded and matched the real team URL; anonymous remote URL; separate vi/ne member browser sessions |
| Individual assignment and acknowledgement | Explicit acknowledgement v1, owner shows confirmed; reading alone does not acknowledge |
| Quantity preview and v2 | Preview keeps v1; owner confirmation publishes v2 with 10 bags |
| All views after v2 | Existing owner current/home/team/storyboard, remote, vi/ne co-present and vi/ne worker pages update without reload; both worker TTS hashes change |
| Reconfirmation | Both workers remain acknowledged at v1 until explicitly acknowledging v2; owner transitions through changed-confirmation-needed to confirmed |
| Team access stability | Same PIN, QR URL and expiry after v2 |
| Immutable storage | Read-only DB check confirms v1 remains 15 bags/SUPERSEDED; v2 is 10 bags/PUBLISHED |

Test-harness corrections were kept separate from product defects: localized units are not restricted to a single translated word; old and newer delivery-choice UIs both use the real link-issue action; a full-navigation join is checked by status plus owner roster rather than reading a Chrome-evicted response body.

## Separate live STT/structure checks

The three existing synthetic WAVs passed **3/3** in this run: clear harvest+transport, quantity correction, and `저짝 밭` deictic location. The deictic case checks a non-blocking location advisory, null canonical location, harvest action and 20 bags. Sources did not change during the run.

- Raw results and source hashes: `evals/results/dialect-20260903T225329549947Z/`
- Preserved input dataset: `evals/full-workflow-stt-20260904.jsonl` (identical bytes to the temporary input path recorded in the original run metadata).
- Original fixtures: `evals/audio/manifest.jsonl`
- Additional change fixture and provenance: `evals/audio/workflow/manifest.jsonl`

This is one synthetic smoke run, not a reversal of all earlier dialect findings or a full STT accuracy benchmark.

## Reproduction

```powershell
$env:PLAYWRIGHT_PORT='4193'
pnpm exec playwright test tests/webapp

$env:LIVE_E2E='1'
$env:LIVE_FRONTEND_ORIGIN='https://batmeori.vercel.app'
node scripts/check-live-workflow.mjs
```

The live command uses paid providers and creates a synthetic temporary team. Reports contain no PIN, cookie or QR tokens. Its output directory contains stage results, audio metadata and worker confirmation screenshots. An optional `LIVE_REPORT_DIR` chooses a fresh output location.

## Limits

- P0 version changes cover quantities. Arbitrary task/location/safety edits are not implemented as automatic post-publication changes.
- Worker acknowledgement records an explicit button press, not task completion or independently verified understanding.
- Foreground/focus notifications are tested. Closed-browser/locked-device OS push is not implemented.
- Separate browser contexts with mobile viewports do not replace physical QR camera tests on two phones. Recorded human dialects and native-speaker translation/TTS quality review are outside this run.
- The observed quantity-unit translations include Vietnamese `lưới` and Nepali `जाल`; this run checks number preservation and locale purity, not native agricultural terminology approval.
- The live main scenario uses onion harvest/transport. Strawberry and other supported task presentation/isolation are covered by the local browser suite, not by every live AI task combination.
