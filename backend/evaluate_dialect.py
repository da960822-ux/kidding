"""Paid, DB-free evaluation through the production AI bridge and BE validators.

Inputs are authored text fixtures and synthetic WAVs, not recordings of farmers.
Run: backend/.venv/Scripts/python.exe backend/evaluate_dialect.py
Outputs contain only synthetic evaluation input/output; never credentials or audio.
"""
import asyncio
import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

from app import main as app
from app.ai import bridge_call
from app.p0_runtime import NodeBridge

ROOT = Path(__file__).resolve().parents[1]
DATASETS = ["ai/evals/transcript-v2.jsonl", "ai/evals/transcript-jeolla-v2.jsonl", "evals/dialect-holdout-20260904.jsonl"]


def rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]


def mismatches(expected, raw, state, ambiguities):
    failures = []
    for key in ("interpretation", "task_family", "quantity"):
        if key in expected and raw.get(key) != expected[key]:
            failures.append(key)
    codes = [step["task_code"] for step in raw.get("steps", [])]
    if "task_code" in expected and expected["task_code"] not in codes:
        failures.append("task_code")
    if "task_codes" in expected and codes != expected["task_codes"]:
        failures.append("task_codes_order")
    if "ambiguity_kind" in expected and not any(a["kind"] == expected["ambiguity_kind"] and a["blocking"] == expected["blocking"] for a in ambiguities):
        failures.append("ambiguity")
    if expected.get("unknown_quantity") and raw.get("quantity") not in (None, "UNSPECIFIED"):
        failures.append("invented_quantity")
    if "location_kind" in expected and raw.get("location", {}).get("kind") != expected["location_kind"]:
        failures.append("location_kind")
    if "location_name" in expected and raw.get("location", {}).get("canonical_name") != expected["location_name"]:
        failures.append("location_name")
    if "location_names" in expected and raw.get("location", {}).get("canonical_name") not in expected["location_names"]:
        failures.append("location_name")
    if expected.get("location_kind") == "DEICTIC" and raw.get("location", {}).get("canonical_name") is not None:
        failures.append("invented_location")
    if "location_raw" in expected and raw.get("location", {}).get("raw_text") != expected["location_raw"]:
        failures.append("location_raw")
    if expected.get("no_blocking") and any(item["blocking"] for item in ambiguities):
        failures.append("unexpected_blocking")
    if expected.get("no_safety") and raw.get("safety"):
        failures.append("invented_safety")
    if "risk" in expected and state.risk_assessment.level != expected["risk"]:
        failures.append("risk")
    return failures


async def evaluate(case, gate, call=bridge_call):
    async with gate:
        started = time.monotonic()
        record = {"id": case["id"], "dataset_version": case.get("dataset_version", "synthetic-stt"), "input": case["transcript"], "expected": case["expected"]}
        try:
            transcript = case["transcript"]
            if "file" in case:
                audio_path = ROOT / "evals/audio" / case["file"]
                content = audio_path.read_bytes()
                with wave.open(str(audio_path), "rb") as wav:
                    duration = wav.getnframes() / wav.getframerate()
                record["audio"] = {"synthetic": case.get("synthetic", False), "voice": case.get("voice"), "rate": case.get("rate"), "sha256": hashlib.sha256(content).hexdigest(), "duration_seconds": duration}
                result = await call("TRANSCRIBE_AUDIO", {"audio_base64": base64.b64encode(content).decode(), "filename": audio_path.name, "content_type": "audio/wav", "language_hint": "ko"})
                transcript = result["transcript"]
                record["recognized_transcript"] = transcript
            if case.get("kind") == "QUANTITY_CHANGE":
                raw = await call("PARSE_QUANTITY_CHANGE", {"transcript": transcript, "expected_version": 1})
                app.parse_quantity_output(raw, 1)
                failures = mismatches(case["expected"], raw, None, raw["ambiguities"])
            else:
                raw = await call("BUILD_OWNER_DRAFT_V2", {"transcript": transcript})
                record["raw_output"] = raw
                app.validate_contract_schema(raw, "structure-v2.schema.json")
                state = app.work_state_from_structure_v2(app.StructureOutputV2.model_validate(raw), transcript)
                record["risk"] = state.risk_assessment.level
                try:
                    state, ambiguities, interpretation = await app.parse_structure_output(raw, transcript)
                    ambiguities = [item.model_dump(mode="json") for item in ambiguities]
                    record["backend_interpretation"] = interpretation
                    record["backend_ambiguities"] = ambiguities
                    record["backend_gate"] = "ACCEPTED_DRAFT"
                except app.ApiError as error:
                    record["backend_gate"] = error.code
                    if case["expected"].get("risk") != "HIGH" or error.code != "OVERRIDE_NOT_ALLOWED":
                        raise
                    ambiguities = raw["ambiguities"]
                failures = mismatches(case["expected"], raw, state, ambiguities)
            record.update(raw_output=raw, failures=failures, passed=not failures)
        except Exception as error:
            record.update(passed=False, failures=["runtime_or_backend_error"], error=getattr(error, "code", type(error).__name__))
        record["elapsed_seconds"] = round(time.monotonic() - started, 3)
        print(json.dumps({k: record[k] for k in ("id", "passed", "failures", "elapsed_seconds")}, ensure_ascii=False), flush=True)
        return record


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", nargs="?")
    parser.add_argument("--without-dialect", action="store_true")
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()
    if args.repeat < 1:
        parser.error("--repeat must be positive")
    source_files = [*sorted((ROOT / "ai/prompts").glob("*.md")), *sorted((ROOT / "ai/lib").glob("*.mjs")), ROOT / "ai/references/dialect-v2.json", ROOT / "ai/index.mjs", ROOT / "ai/scripts/eval-without-dialect.mjs", ROOT / "backend/app/main.py", Path(__file__).resolve()]
    source_hashes = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files}
    cases = [row for file in DATASETS for row in rows(ROOT / file)]
    excluded = [case["id"] for case in cases if case.get("kind") == "NEGATIVE_FAMILY"]
    cases = [case for case in cases if case["id"] not in excluded]
    audio_expected = [
        {"task_family": "ONION", "quantity": {"value": 20, "unit": "망"}, "task_codes": ["ONION_HARVEST", "ONION_TRANSPORT"], "location_kind": "NAMED", "no_safety": True},
        {"interpretation": "READY", "quantity": {"value": 15, "unit": "망"}},
        {"task_family": "ONION", "quantity": {"value": 20, "unit": "망"}, "location_kind": "DEICTIC", "ambiguity_kind": "LOCATION", "blocking": False},
    ]
    for index, case in enumerate(rows(ROOT / "evals/audio/manifest.jsonl")):
        cases.append({**case, "kind": "QUANTITY_CHANGE" if index == 1 else "STRUCTURE", "expected": audio_expected[index]})
    if args.dataset:
        cases = rows(Path(args.dataset))
        excluded = []
    cases = [{**case, "id": f"{case['id']}#r{repeat + 1}"} for repeat in range(args.repeat) for case in cases]
    gate = asyncio.Semaphore(3)
    bridge_path = ROOT / ("ai/scripts/eval-without-dialect.mjs" if args.without_dialect else "ai/bridge.mjs")
    # Both arms use one attempt; production's transport retry must not favor one arm.
    call = NodeBridge(os.getenv("NODE_BINARY", "node"), str(bridge_path), float(os.getenv("AI_BRIDGE_TIMEOUT_SECONDS", "60"))).call
    results = await asyncio.gather(*(evaluate(case, gate, call) for case in cases))
    output = ROOT / "evals/results" / datetime.now(timezone.utc).strftime("dialect-%Y%m%dT%H%M%S%fZ")
    output.mkdir(parents=True, exist_ok=False)
    (output / "results.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in results), encoding="utf-8")
    input_files = [args.dataset] if args.dataset else DATASETS + ["evals/audio/manifest.jsonl"]
    summary = {"total": len(results), "passed": sum(r["passed"] for r in results), "failed": [r["id"] for r in results if not r["passed"]], "excluded_negative_family": excluded, "model": os.getenv("OPENAI_MODEL", "default"), "transcription_model": os.getenv("OPENAI_TRANSCRIBE_MODEL", "default"), "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "prompt_sha256": hashlib.sha256((ROOT / "ai/prompts/prompt-structure-005.md").read_bytes()).hexdigest(), "dataset_sha256": {file: hashlib.sha256((ROOT / file).read_bytes()).hexdigest() for file in input_files}, "audio_count": sum("file" in case for case in cases), "limits": "Authored synthetic text and synthetic WAVs, no real-speaker accuracy claim. No database writes. Validator-negative cases are excluded from live model scoring. Field-level checks are not full human semantic review."}
    summary["context_sha256"] = {
        str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (ROOT / "ai/references").glob("*.json")
    }
    summary.update(dialect_context=not args.without_dialect, repetitions=args.repeat, attempts_per_case=1, source_sha256_before=source_hashes,
                   source_changed_during_run=any(hashlib.sha256(path.read_bytes()).hexdigest() != source_hashes[str(path.relative_to(ROOT))] for path in source_files))
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({**summary, "output": str(output)}, ensure_ascii=False), flush=True)
    return 0 if summary["passed"] == summary["total"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
