# AI runtime

`ai/bridge.mjs` is the sole private JSONL entry point. It calls `createRuntime` in
`ai/index.mjs` for STT, `structure-v2`, quantity parsing, guide lookup,
translation, visual matching, and TTS.

`references/dialect-v2.json` is an editable, self-authored dialect knowledge
file for the two-crop P0 scope. `lib/dialect-reference.mjs` validates it and
selects a small lexical subset for each transcript. The selected context is a
read-only hint for semantic normalization; it cannot force a task, quantity,
location, destination, or safety result. Reference IDs, provenance, and source
metadata never enter model output. Selected hints retain an `unverified advisory`
flag. Source IDs link observed terminology to official text or primary research;
`LOOKUP_ONLY` pages establish no term meaning. All entries remain pending human
review. A source supporting standard terminology does not verify every dialect
form in the same group. Examples are marked `SELF_AUTHORED`.

The runtime accepts no worker, owner, farm, nickname, or member identifiers.
`structure-v1` and its existing evaluation/manifest artifacts remain read-only
archives; no v1 publish or active v1 runtime exists. The active visual input is
[`assets/asset_manifest.csv`](../assets/asset_manifest.csv).

Run `node --test ai/tests/*.test.mjs` for the active runtime contract suite.
