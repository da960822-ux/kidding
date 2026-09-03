# AI runtime

`ai/bridge.mjs` is the sole private JSONL entry point. It calls `createRuntime` in
`ai/index.mjs` for STT, `structure-v2`, quantity parsing, guide lookup,
translation, visual matching, and TTS.

The runtime accepts no worker, owner, farm, nickname, or member identifiers.
`structure-v1` and its existing evaluation/manifest artifacts remain read-only
archives; no v1 publish or active v1 runtime exists. The active visual input is
[`assets/asset_manifest.csv`](../assets/asset_manifest.csv).

Run `node --test ai/tests/*.test.mjs` for the active runtime contract suite.
