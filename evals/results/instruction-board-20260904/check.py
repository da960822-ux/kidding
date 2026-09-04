"""Evaluate the three supplied transcripts with real AI and production validators.

No database writes or worker delivery. Assets/guides are read from the configured
database. Only the first publish-eligible result per case generates vi/ne packages.
"""
import asyncio
import base64
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app import main as app
from app.ai import bridge_call

OUT = Path(__file__).resolve().parent
CASES = [
    "아랫밭 양파 20망 캐서 상한 건 빼고 창고로 옮겨.",
    "양파를 던지지 말고 상한 것은 절대 정상 양파랑 섞지 마.",
    "오전까지 아랫밭 양파 20망을 캐고, 상했거나 물러진 건 따로 빼. 다 끝나면 던지지 말고 상자에 담아서 창고로 옮겨.",
]

async def main():
    client = app.db_client()
    assets = app.current_assets(client)
    guides = app.current_verified_guides(client)
    files = [ROOT / "ai/index.mjs", ROOT / "ai/prompts/prompt-structure-005.md",
             ROOT / "ai/lib/worker-briefing-v2.mjs", ROOT / "backend/app/main.py",
             ROOT / "src/webapp/WorkerScreens.tsx", ROOT / "src/webapp/OwnerScreens.tsx"]
    metadata = {"started_at": datetime.now(timezone.utc).isoformat(),
                "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "model": os.getenv("OPENAI_MODEL", "default"),
                "asset_count": len(assets), "verified_guide_count": len(guides),
                "source_sha256": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
                "limits": "Text inputs; no STT, database writes, publish, real worker delivery, or native-speaker review. Actual translation and TTS provider calls. Browser rendering tested separately."}
    (OUT / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    gate = asyncio.Semaphore(3)
    async def structure(case_id, transcript, repeat):
        async with gate:
            row = {"case": case_id, "repeat": repeat, "transcript": transcript}
            try:
                raw = await bridge_call("BUILD_OWNER_DRAFT_V2", {"transcript": transcript})
                row["raw"] = raw
                state, ambiguities, interpretation = await app.parse_structure_output(raw, transcript)
                draft = app.WorkDraft(draft_id=f"evaluation-{case_id}-{repeat}", draft_revision=1,
                    summary_ko=raw["summary_ko"], interpretation=interpretation, state=state,
                    ambiguities=ambiguities, transcript=transcript)
                row["draft"] = draft.model_dump(mode="json")
                row["confirm_gates"] = {}
                for decision in ("CONFIRM", "PUBLISH_AS_IS"):
                    payload = app.DraftConfirmRequest(expected_version=0, decision=decision,
                        ambiguity_override=decision == "PUBLISH_AS_IS",
                        override_reason="OWNER_ACCEPTED_OTHER" if decision == "PUBLISH_AS_IS" else None)
                    try:
                        app.validate_confirm(draft, payload)
                        row["confirm_gates"][decision] = "ELIGIBLE_NOT_PUBLISHED"
                    except app.ApiError as error:
                        row["confirm_gates"][decision] = error.code
            except Exception as error:
                row["error"] = getattr(error, "code", type(error).__name__)
            print(json.dumps({k: row[k] for k in ("case", "repeat", "confirm_gates", "error") if k in row}), flush=True)
            (OUT / f"case-{case_id}-r{repeat}.json").write_text(json.dumps(row, ensure_ascii=False, indent=2), encoding="utf-8")
            return row
    results = await asyncio.gather(*(structure(i, text, repeat) for repeat in range(1, 4) for i, text in enumerate(CASES, 1)))
    for case_id in range(1, 4):
        row = next((r for r in results if r["case"] == case_id and "ELIGIBLE_NOT_PUBLISHED" in r.get("confirm_gates", {}).values()), None)
        if row is None:
            continue
        draft = app.WorkDraft.model_validate(row["draft"])
        session_id = f"evaluation-case-{case_id}"
        work = app.structure_v2_work_input(draft.state, session_id, 1, draft.interpretation, draft.summary_ko, draft.ambiguities)
        try:
            packages = await bridge_call("BUILD_WORKER_PACKAGES_V2", {"work": work, "languages": ["vi", "ne"], "assets": assets, "guides": guides})
            for language, package in packages.items():
                briefing = package["briefing"]
                app.validate_worker_briefing(briefing, language, session_id, 1, draft.state)
                transport = package["tts_transport"]
                assert app.worker_tts_text(briefing) == transport["text"]
                audio = transport.pop("audio_bytes_base64", None)
                if audio:
                    (OUT / f"case-{case_id}-{language}.mp3").write_bytes(base64.b64decode(audio, validate=True))
                package["evaluation"] = {"source_repeat": row["repeat"], "published": False, "audio_generated": bool(audio)}
                (OUT / f"case-{case_id}-{language}.json").write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"case {case_id}: vi/ne packages validated", flush=True)
        except Exception as error:
            (OUT / f"case-{case_id}-package-error.json").write_text(json.dumps({"error": getattr(error, "code", type(error).__name__)}), encoding="utf-8")
            print(f"case {case_id}: package failed", flush=True)
    metadata["source_changed_during_run"] = any(hashlib.sha256(p.read_bytes()).hexdigest() != metadata["source_sha256"][str(p.relative_to(ROOT))] for p in files)
    (OUT / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    asyncio.run(main())
