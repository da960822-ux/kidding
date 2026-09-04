"""Regenerate the saved user examples through real translation/TTS, without DB writes."""
import asyncio
import base64
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app import main as app
from app.ai import bridge_call

OUT = Path(__file__).resolve().parent

async def main():
    client = app.db_client()
    assets, guides = app.current_assets(client), app.current_verified_guides(client)
    for case_id in (1, 3):
        baseline = json.loads((OUT.parent / "instruction-board-20260904" / f"case-{case_id}-r1.json").read_text(encoding="utf-8"))
        draft = app.WorkDraft.model_validate(baseline["draft"])
        work = app.structure_v2_work_input(draft.state, f"evaluation-case-{case_id}", 1, draft.interpretation, draft.summary_ko, draft.ambiguities)
        packages = await bridge_call("BUILD_WORKER_PACKAGES_V2", {"work": work, "languages": ["vi", "ne"], "assets": assets, "guides": guides})
        for language, package in packages.items():
            briefing = package["briefing"]
            app.validate_worker_briefing(briefing, language, work["session_id"], 1, draft.state)
            transport = package["tts_transport"]
            assert app.worker_tts_text(briefing) == transport["text"]
            assert hashlib.sha256(transport["text"].encode()).hexdigest() == transport["text_hash"]
            context = briefing["context"]
            assert context["location_display"] in transport["text"]
            assert f'{context["quantity"]["value"]} {context["quantity"]["unit"]}' in transport["text"]
            assert context["quantity"]["unit"] == ("bao" if language == "vi" else "बोरा")
            if case_id == 3:
                assert context["deadline"] in transport["text"]
                assert context["notes"] in transport["text"]
            audio = transport.pop("audio_bytes_base64", None)
            if audio:
                (OUT / f"case-{case_id}-{language}.mp3").write_bytes(base64.b64decode(audio, validate=True))
            package["evaluation"] = {"published": False, "source": "saved user transcript structure, fresh real translation and TTS", "audio_generated": bool(audio)}
            (OUT / f"case-{case_id}-{language}.json").write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8")
            print(json.dumps({"case": case_id, "language": language, "unit": context["quantity"]["unit"], "tts": transport["text"], "audio_generated": bool(audio)}, ensure_ascii=False), flush=True)

if __name__ == "__main__":
    asyncio.run(main())
