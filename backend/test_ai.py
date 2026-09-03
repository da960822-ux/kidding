import asyncio
import io
import json
import os
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import patch

from app import ai
from app import main
from fastapi.testclient import TestClient


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return json.dumps(self.payload).encode()


class OpenAiAdapterTests(unittest.TestCase):
    def setUp(self):
        self.environment = {
            "OPENAI_API_KEY": "test-key",
            "OPENAI_MODEL": "gpt-5.6-luna",
            "OPENAI_STT_MODEL": "gpt-4o-transcribe",
            "OPENAI_TTS_MODEL": "gpt-4o-mini-tts",
        }

    def test_transcription_uses_server_model_and_multipart_file(self):
        with patch.dict(os.environ, self.environment, clear=False), patch(
            "app.ai.urllib.request.urlopen", return_value=FakeResponse({"text": "양파 스무 망"})
        ) as urlopen:
            transcript = asyncio.run(ai.transcribe_audio(b"audio", "recording.wav", "audio/wav"))

        self.assertEqual(transcript, "양파 스무 망")
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/audio/transcriptions"))
        self.assertIn(b'gpt-4o-transcribe', request.data)
        self.assertIn(b'filename="recording.wav"', request.data)

    def test_structure_uses_strict_json_schema_responses_format(self):
        output = {
            "interpretation": "READY",
            "summary_ko": "양파를 수확합니다.",
            "location": {"raw_text": None, "kind": "UNSPECIFIED", "canonical_name": None},
            "task_family": "ONION",
            "quantity": "UNSPECIFIED",
            "deadline": None,
            "safety": [],
            "notes": None,
            "steps": [
                {
                    "sequence": 1,
                    "task_code": "ONION_HARVEST",
                    "title_ko": "양파 수확",
                    "description_ko": "양파를 수확한다",
                    "unsupported_reason": None,
                }
            ],
            "ambiguities": [],
            "schema_version": "1",
            "contract_version": "structure-v1",
        }
        with patch.dict(os.environ, self.environment, clear=False), patch(
            "app.ai.urllib.request.urlopen",
            return_value=FakeResponse({"output_text": json.dumps(output)}),
        ) as urlopen:
            parsed = asyncio.run(ai.structure_transcript("양파 수확해"))

        self.assertEqual(parsed, output)
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/responses"))
        body = json.loads(request.data)
        self.assertEqual(body["model"], "gpt-5.6-luna")
        self.assertEqual(body["text"]["format"]["type"], "json_schema")
        self.assertTrue(body["text"]["format"]["strict"])
        self.assertEqual(body["text"]["format"]["schema"]["$id"], "https://batmeori.invalid/schemas/structure-v1.schema.json")
        self.assertNotIn("allOf", body["text"]["format"]["schema"])
        self.assertEqual(body["text"]["format"]["schema"]["properties"]["task_family"]["type"], "string")

    def test_translation_uses_strict_json_schema_responses_format(self):
        output = {
            "segment": "ACTION",
            "language_code": "vi",
            "text": "Thu hoạch hành.",
            "source": "AI_TRANSLATION",
            "guide_lookup": "MISS",
            "phrase_key": None,
            "verified": False,
            "source_page": None,
            "source_url": None,
            "license": None,
            "schema_version": "1",
            "contract_version": "translation-v1",
        }
        with patch.dict(os.environ, self.environment, clear=False), patch(
            "app.ai.urllib.request.urlopen", return_value=FakeResponse({"output_text": json.dumps(output)})
        ) as urlopen:
            parsed = asyncio.run(ai.translate_segment("ACTION", "양파를 수확한다", "vi"))

        self.assertEqual(parsed, output)
        body = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(body["text"]["format"]["schema"]["$id"], "https://batmeori.invalid/schemas/translation-v1.schema.json")

    def test_draft_from_audio_route_saves_only_schema_validated_output(self):
        output = {
            "interpretation": "READY",
            "summary_ko": "양파를 수확합니다.",
            "location": {"raw_text": None, "kind": "UNSPECIFIED", "canonical_name": None},
            "task_family": "ONION",
            "quantity": {"value": 20, "unit": "망"},
            "deadline": None,
            "safety": [],
            "notes": None,
            "steps": [{"sequence": 1, "task_code": "ONION_HARVEST", "title_ko": "양파 수확", "description_ko": "수확한다", "unsupported_reason": None}],
            "ambiguities": [],
            "schema_version": "1",
            "contract_version": "structure-v1",
        }

        class DraftTable:
            payload = None

            def insert(self, payload):
                self.payload = payload
                return self

            def select(self, *_):
                return self

            def execute(self):
                return SimpleNamespace(data=[{"id": "draft-1", **self.payload}])

        table = DraftTable()
        audio = io.BytesIO()
        with wave.open(audio, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(8000)
            wav.writeframes(b"\0\0" * 8000)
        with (
            patch("app.main.require_owner"),
            patch("app.main.require_origin"),
            patch("app.main.ai_transcribe_audio", new=AsyncMock(return_value="양파 수확해")),
            patch("app.main.ai_structure_transcript", new=AsyncMock(return_value=output)),
            patch("app.main.enrich_draft_state", new=AsyncMock(side_effect=lambda _, state: state)),
            patch("app.main.db_client", return_value=SimpleNamespace(table=lambda _: table)),
            patch.object(main.settings, "demo_fallback", False),
        ):
            response = TestClient(main.app).post(
                "/api/v1/work-sessions/drafts/from-audio",
                headers={"Origin": "http://localhost:5173", "Idempotency-Key": "test-key-123"},
                files={"audio": ("instruction.wav", audio.getvalue(), "audio/wav")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["draft_id"], "draft-1")
        self.assertEqual(table.payload["interpretation"], "READY")
        self.assertNotIn("audio", table.payload)


if __name__ == "__main__":
    unittest.main()
