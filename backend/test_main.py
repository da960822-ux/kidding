import asyncio
import base64
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.main import (
    ApiError,
    RiskAssessment,
    cache_published_tts,
    demo_structure,
    enrich_draft_state,
    localized_worker_state,
    parse_quantity_output,
    parse_quantity_text,
    parse_structure_output,
    settings,
    sign_team_member,
    synthesize_tts,
    validate_state,
    verify_team_member,
)


class BackendContractTests(unittest.TestCase):
    def test_temporary_team_cookie_is_signed_and_bound_to_member(self):
        original_secret = settings.owner_session_secret
        original_pin = settings.owner_pin
        try:
            settings.owner_session_secret = "test-secret"
            settings.owner_pin = "1234"
            cookie = sign_team_member("team-1", "member-1", datetime.now(timezone.utc) + timedelta(minutes=1))
            self.assertEqual(verify_team_member(cookie), ("team-1", "member-1"))
            self.assertIsNone(verify_team_member(f"x{cookie}"))
        finally:
            settings.owner_session_secret = original_secret
            settings.owner_pin = original_pin

    def test_deictic_location_is_preserved_as_ambiguous(self):
        state, ambiguities = demo_structure("저짝 밭에서 양파 스무 망을 수확해.")

        self.assertEqual(state.location.kind, "DEICTIC")
        self.assertIsNone(state.location.canonical_name)
        self.assertEqual(len(ambiguities), 1)
        self.assertFalse(ambiguities[0].blocking)

    def test_quantity_change_uses_new_quantity(self):
        quantity = parse_quantity_text("스무 망 말고 열다섯 망으로 해.")

        self.assertIsNotNone(quantity)
        self.assertEqual(quantity.value, 15)
        self.assertEqual(quantity.unit, "망")

    def test_quantity_preview_rejects_model_version_mismatch(self):
        raw = {
            "interpretation": "READY",
            "quantity": {"value": 15, "unit": "망"},
            "expected_version": 2,
            "ambiguities": [],
            "schema_version": "1",
            "contract_version": "quantity-change-v1",
        }

        with self.assertRaises(ApiError) as raised:
            parse_quantity_output(raw, expected_version=1)
        self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

    def test_supplement_structure_applies_deterministic_risk_gate(self):
        raw = {
            "interpretation": "READY",
            "summary_ko": "양파를 수확합니다.",
            "location": {"raw_text": None, "kind": "UNSPECIFIED", "canonical_name": None},
            "task_family": "ONION",
            "quantity": {"value": 20, "unit": "망"},
            "deadline": None,
            "safety": [],
            "notes": None,
            "steps": [{
                "sequence": 1,
                "task_code": "ONION_HARVEST",
                "title_ko": "양파 수확",
                "description_ko": "양파를 수확한다",
                "unsupported_reason": None,
            }],
            "ambiguities": [],
            "schema_version": "1",
            "contract_version": "structure-v1",
        }

        with self.assertRaises(ApiError) as raised:
            asyncio.run(parse_structure_output(raw, "트랙터를 운전해서 양파를 옮겨."))
        self.assertEqual(raised.exception.code, "OVERRIDE_NOT_ALLOWED")

    def test_structure_task_code_must_match_its_task_family(self):
        raw = {
            "interpretation": "READY",
            "summary_ko": "딸기를 수확합니다.",
            "location": {"raw_text": None, "kind": "UNSPECIFIED", "canonical_name": None},
            "task_family": "STRAWBERRY",
            "quantity": {"value": 20, "unit": "상자"},
            "deadline": None,
            "safety": [],
            "notes": None,
            "steps": [{
                "sequence": 1,
                "task_code": "ONION_HARVEST",
                "title_ko": "양파 수확",
                "description_ko": "양파를 수확한다",
                "unsupported_reason": None,
            }],
            "ambiguities": [],
            "schema_version": "1",
            "contract_version": "structure-v1",
        }

        with self.assertRaises(ApiError) as raised:
            asyncio.run(parse_structure_output(raw, "딸기를 수확해."))
        self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

        raw["steps"][0]["task_code"] = "STRAWBERRY_HARVEST"
        state, _, _ = asyncio.run(parse_structure_output(raw, "딸기를 수확해."))
        self.assertEqual(state.task_family, "STRAWBERRY")

    def test_enrichment_prefers_reviewed_guide_and_low_video(self):
        state, _ = demo_structure("저짝 밭에서 양파 스무 망을 수확해.")

        class Query:
            def __init__(self, table): self.table = table
            def select(self, *_): return self
            def in_(self, *_): return self
            def eq(self, *_): return self
            def limit(self, *_): return self
            def execute(self):
                if self.table == "guide_phrases":
                    return type("Result", (), {"data": [{"phrase_key": "onion-harvest", "source_page": 1, "source_url": "https://guide.example/1", "license": "CC"}]})()
                if self.table == "guide_translations":
                    return type("Result", (), {"data": [{"translated_text": "검수 번역"}]})()
                return type("Result", (), {"data": [{"id": "video-1", "task_code": "ONION_HARVEST", "public_path": "/videos/onion.mp4", "provenance": "AI_GENERATED_PREGENERATED", "review_status": "APPROVED", "safety_level": "LOW", "captions_text": "caption"}] if self.table == "visual_assets" else []})()

        class Client:
            def table(self, table): return Query(table)

        enriched = asyncio.run(enrich_draft_state(Client(), state))

        self.assertEqual(enriched.steps[0].video.asset_id, "video-1")
        self.assertEqual(enriched.steps[0].delivery_mode, "VIDEO")
        self.assertEqual(enriched.steps[0].translations[0].source, "OFFICIAL_GUIDE")

    def test_worker_state_excludes_risk_assessment(self):
        state, _ = demo_structure("창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨.")
        worker_state = localized_worker_state(state, "vi")

        self.assertFalse(hasattr(worker_state, "risk_assessment"))

    def test_unknown_risk_cannot_be_published(self):
        state, _ = demo_structure("창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨.")
        unsafe_state = state.model_copy(
            update={
                "risk_assessment": RiskAssessment(
                    level="UNKNOWN",
                    reasons=["INSUFFICIENT_CONTEXT"],
                )
            }
        )

        with self.assertRaises(ApiError) as raised:
            validate_state(unsafe_state, allow_unsupported=True, for_publish=True)
        self.assertEqual(raised.exception.code, "OVERRIDE_NOT_ALLOWED")

    def test_worker_tts_uses_cached_language_audio_or_text_fallback(self):
        state, _ = demo_structure("창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨.")

        class Result:
            data = [{"audio_bytes": base64.b64encode(b"mp3").decode()}]

        class Query:
            def select(self, *_): return self
            def eq(self, *_): return self
            def limit(self, *_): return self
            def execute(self): return Result()

        class Client:
            def table(self, name):
                self.table_name = name
                return Query()

        with_audio = localized_worker_state(state, "vi", Client())
        self.assertTrue(with_audio.steps[0].audio_url.startswith("data:audio/mpeg;base64,"))
        self.assertEqual(with_audio.steps[0].delivery_mode, "TEXT_TTS")

    def test_tts_uses_server_model_and_returns_audio(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_): return None
            def read(self): return b"mp3"

        original_key = settings.openai_api_key
        try:
            settings.openai_api_key = "test-key"
            with patch("app.main.urllib.request.urlopen", return_value=Response()) as request:
                self.assertEqual(synthesize_tts("Thu hoạch hành."), b"mp3")
            payload = json.loads(request.call_args.args[0].data)
            self.assertEqual(payload["model"], settings.openai_tts_model)
        finally:
            settings.openai_api_key = original_key

    def test_tts_failure_does_not_block_published_state(self):
        state, _ = demo_structure("창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨.")

        class Result:
            data = []

        class Query:
            def select(self, *_): return self
            def eq(self, *_): return self
            def limit(self, *_): return self
            def upsert(self, *_ , **__): return self
            def execute(self): return Result()

        class Client:
            def table(self, _): return Query()

        with patch("app.main.synthesize_tts", side_effect=RuntimeError("provider unavailable")):
            cache_published_tts(Client(), state)


if __name__ == "__main__":
    unittest.main()
