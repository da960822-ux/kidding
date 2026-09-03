import asyncio
import base64
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import Request

from app.main import (
    ApiError,
    DraftConfirmRequest,
    QuantityChangeConfirmRequest,
    OwnerWorkSession,
    RiskAssessment,
    Location,
    Step,
    WorkState,
    build_worker_packages,
    confirm_draft,
    confirm_quantity_change,
    current_assets,
    issue_link,
    parse_structure_output,
    parse_version,
    private_tts_bytes,
    settings,
    structure_v2_state_json,
    validate_contract_schema,
)
from app.p0_runtime import OwnerIdentity


def structure(task_code="ONION_HARVEST"):
    return {
        "interpretation": "READY",
        "summary_ko": "양파를 수확합니다.",
        "location": {"raw_text": "A밭", "kind": "NAMED", "canonical_name": "A밭"},
        "task_family": "ONION",
        "quantity": {"value": 20, "unit": "망"},
        "deadline": None,
        "safety": [],
        "notes": None,
        "steps": [{"sequence": 1, "task_code": task_code, "title_ko": "양파 수확", "description_ko": "양파를 수확한다", "unsupported_reason": None}],
        "ambiguities": [],
        "schema_version": "2",
        "contract_version": "structure-v2",
        "ontology_version": "ontology-v2",
    }


class BackendP0Tests(unittest.TestCase):
    def test_package_build_sends_exact_structure_and_keeps_tts_bytes_private(self):
        text_hash = "a" * 64
        briefing = {
            "session_id": "session-1", "version": 1, "contract_version": "worker-briefing-v2", "ontology_version": "ontology-v2", "language_code": "vi",
            "context": {"task_family": "ONION", "location_display": "A", "quantity": {"value": 20, "unit": "bao"}, "deadline": None, "notes": None},
            "badges": [], "steps": [{"sequence": 1, "task_code": "ONION_HARVEST", "title": "Thu hoạch", "description": "Thu hoạch", "delivery_mode": "TEXT_TTS"}],
            "source_detail": [], "tts": {"status": "READY", "text_hash": text_hash, "audio_url": None}, "video": [],
        }
        bridge_result = {
            language: {"briefing": {**briefing, "language_code": language}, "tts_transport": {"status": "READY", "text_hash": text_hash, "audio_url": None, "audio_bytes_base64": base64.b64encode(b"audio").decode()}}
            for language in ("vi", "ne")
        }
        sent = {}

        guide = {
            "canonical_ko": "양파를 수확한다",
            "language_code": "vi",
            "translated_text": "검수된 양파 수확 안내",
            "phrase_key": "onion-harvest",
            "source_page": 1,
            "source_url": "https://guide.example.test/1",
            "license": "CC-BY",
            "verified": True,
        }
        asset = {
            "id": "asset-1", "task_code": "ONION_HARVEST", "asset_type": "VIDEO", "content_type": "video/mp4",
            "public_path": "https://video.example.test/asset-1.mp4", "provenance": "AI_GENERATED_PREGENERATED",
            "review_status": "APPROVED", "safety_level": "LOW", "is_current": True, "captions_text": "양파 수확",
        }

        async def fake_bridge(_operation, payload):
            sent["work"] = payload["work"]
            sent["guides"] = payload["guides"]
            sent["assets"] = payload["assets"]
            return bridge_result

        class Table:
            def upsert(self, row, **_):
                sent.setdefault("audio", []).append(row)
                return self

            def execute(self):
                return type("Result", (), {"data": []})()

        class Client:
            def table(self, name):
                self.name = name
                return Table()

        state = WorkState(
            task_family="ONION", location=Location(raw_text="A", kind="NAMED", canonical_name="A"), location_display="A",
            quantity={"value": 20, "unit": "망"}, deadline=None, safety=[], notes=None,
            steps=[Step(sequence=1, task_code="ONION_HARVEST", title_ko="양파 수확", description_ko="양파를 수확한다", unsupported_reason=None)],
            risk_assessment=RiskAssessment(level="LOW", reasons=[]),
        )
        with (
            patch("app.main.current_assets", return_value=[asset]),
            patch("app.main.current_verified_guides", return_value=[guide]),
            patch("app.main.bridge_call", new=AsyncMock(side_effect=fake_bridge)),
            patch.object(settings, "public_api_base_url", "https://api.example.test", create=True),
        ):
            packages = asyncio.run(build_worker_packages(Client(), "session-1", 1, state, "READY", "양파 수확", []))

        self.assertEqual(set(sent["work"]), {"session_id", "version", "interpretation", "summary_ko", "location", "task_family", "quantity", "deadline", "safety", "notes", "steps", "ambiguities", "schema_version", "contract_version", "ontology_version"})
        self.assertNotIn("risk_assessment", sent["work"])
        self.assertNotIn("location_display", sent["work"])
        self.assertEqual(len(sent["audio"]), 2)
        self.assertTrue(all(row["audio_bytes"] == r"\x617564696f" for row in sent["audio"]))
        self.assertEqual(private_tts_bytes(sent["audio"][0]["audio_bytes"]), b"audio")
        self.assertEqual(sent["guides"], [guide])
        self.assertEqual(sent["assets"], [asset])
        self.assertTrue(all(item["tts"]["status"] == "READY" for item in packages))
        self.assertTrue(all(item["tts"]["audio_url"].startswith("https://api.example.test/api/v1/tts/") for item in packages))
        self.assertNotIn("audio_bytes_base64", str(packages))

    def test_current_assets_keeps_node_matcher_columns(self):
        selected = []

        class Query:
            def select(self, columns):
                selected.append(columns)
                return self

            def eq(self, *_args):
                return self

            def execute(self):
                return type("Result", (), {"data": []})()

        class Client:
            def table(self, _name):
                return Query()

        self.assertEqual(current_assets(Client()), [])
        for column in ("asset_type", "content_type", "provenance", "review_status", "safety_level", "is_current"):
            self.assertIn(column, selected[0])

    def test_new_structure_is_v2_only(self):
        state, _, interpretation = asyncio.run(parse_structure_output(structure(), "양파 20망 수확"))

        self.assertEqual(interpretation, "READY")
        self.assertEqual(state.contract_version, "structure-v2")
        self.assertEqual(state.ontology_version, "ontology-v2")

    def test_confirm_publishes_exact_structure_v2_snapshot(self):
        state, ambiguities, interpretation = asyncio.run(parse_structure_output(structure(), "양파 20망 수확"))
        summary_ko = "양파를 수확합니다."
        state_json = structure_v2_state_json(state, interpretation, summary_ko, ambiguities)
        draft_row = {
            "id": "draft-1", "draft_revision": 0, "summary_ko": summary_ko, "interpretation": interpretation,
            "state_json": state_json, "ambiguities": [], "transcript": "양파 20망 수확",
            "contract_version": "structure-v2", "ontology_version": "ontology-v2",
        }
        version_row = {
            "version": 1, "status": "PUBLISHED", "state_json": state_json,
            "ambiguity_override": False, "override_reason": None, "transcript": None,
        }
        sent = {}

        class Query:
            def __init__(self, name):
                self.name = name

            def select(self, *_args):
                return self

            def eq(self, *_args):
                return self

            def order(self, *_args, **_kwargs):
                return self

            def execute(self):
                data = {
                    "work_drafts": [draft_row],
                    "work_sessions": [{"id": "session-1", "current_version": 1, "contract_version": "structure-v2", "ontology_version": "ontology-v2"}],
                    "work_versions": [version_row],
                    "worker_links": [],
                }.get(self.name, [])
                return type("Result", (), {"data": data})()

        class Client:
            def table(self, name):
                return Query(name)

            def rpc(self, name, args):
                sent["rpc_name"] = name
                sent["rpc_args"] = args
                return type("Rpc", (), {"execute": lambda _self: type("Result", (), {"data": [{"session_id": "session-1", "version": 1}]})()})()

        request = Request({"type": "http", "method": "POST", "headers": []})
        owner = OwnerIdentity("owner-1", "farm-1", 4_102_444_800)
        with (
            patch("app.main.db_client", return_value=Client()),
            patch("app.main.require_owner", return_value=owner),
            patch("app.main.require_origin"),
            patch("app.main.require_idempotency", return_value="idempotency-key"),
            patch("app.main.build_worker_packages", new=AsyncMock(return_value=[])) as build,
        ):
            response = asyncio.run(
                confirm_draft(
                    "draft-1", DraftConfirmRequest(expected_version=0, decision="CONFIRM"), request, "idempotency-key", "cookie"
                )
            )

        self.assertEqual(response.work_session.current_version, 1)
        self.assertEqual(sent["rpc_name"], "publish_work_version_with_packages")
        validate_contract_schema(sent["rpc_args"]["p_state_json"], "structure-v2.schema.json")
        self.assertEqual(sent["rpc_args"]["p_state_json"], state_json)
        self.assertEqual(build.call_args.args[4:], ("READY", summary_ko, []))

    def test_quantity_confirm_reuses_prior_structure_metadata_in_atomic_snapshot(self):
        state, ambiguities, interpretation = asyncio.run(parse_structure_output(structure(), "양파 20망 수확"))
        state_json = structure_v2_state_json(state, interpretation, "양파 20망을 수확합니다.", ambiguities)
        previous = {
            "version": 1,
            "status": "PUBLISHED",
            "state_json": state_json,
            "ambiguity_override": False,
            "override_reason": None,
            "confirmation_decision": "CONFIRM",
            "transcript": None,
        }
        sent = {}

        class Query:
            def __init__(self, client, name):
                self.client = client
                self.name = name

            def select(self, *_args):
                return self

            def eq(self, *_args):
                return self

            def order(self, *_args, **_kwargs):
                return self

            def execute(self):
                self.client.calls[self.name] = self.client.calls.get(self.name, 0) + 1
                if self.name == "work_sessions":
                    current_version = 1 if self.client.calls[self.name] == 1 else 2
                    data = [{"id": "session-1", "current_version": current_version, "status": "PUBLISHED", "contract_version": "structure-v2", "ontology_version": "ontology-v2"}]
                elif self.name == "work_versions":
                    data = [previous] if self.client.calls[self.name] == 1 else [{**previous, "version": 2, "state_json": sent["rpc_args"]["p_state_json"]}]
                else:
                    data = []
                return type("Result", (), {"data": data})()

        class Client:
            def __init__(self):
                self.calls = {}

            def table(self, name):
                return Query(self, name)

            def rpc(self, name, args):
                sent["rpc_name"] = name
                sent["rpc_args"] = args
                return type("Rpc", (), {"execute": lambda _self: type("Result", (), {"data": [{"session_id": "session-1", "version": 2}]})()})()

        request = Request({"type": "http", "method": "POST", "headers": []})
        owner = OwnerIdentity("owner-1", "farm-1", 4_102_444_800)
        with (
            patch("app.main.db_client", return_value=Client()),
            patch("app.main.require_owner", return_value=owner),
            patch("app.main.require_origin"),
            patch("app.main.require_idempotency", return_value="idempotency-key"),
            patch("app.main.build_worker_packages", new=AsyncMock(return_value=[])) as build,
        ):
            response = asyncio.run(
                confirm_quantity_change(
                    "session-1",
                    QuantityChangeConfirmRequest(expected_version=1, quantity={"value": 15, "unit": "망"}),
                    request,
                    "idempotency-key",
                    "cookie",
                )
            )

        self.assertEqual(response.current_version, 2)
        self.assertEqual(sent["rpc_name"], "publish_work_version_with_packages")
        validate_contract_schema(sent["rpc_args"]["p_state_json"], "structure-v2.schema.json")
        self.assertEqual(sent["rpc_args"]["p_state_json"]["quantity"], {"value": 15, "unit": "망"})
        self.assertEqual(sent["rpc_args"]["p_state_json"]["interpretation"], "READY")
        self.assertEqual(build.call_args.args[4], "READY")
        self.assertIn("15망", build.call_args.args[5])

    def test_family_mismatch_is_rejected_before_publish(self):
        with self.assertRaises(ApiError) as raised:
            asyncio.run(parse_structure_output(structure("STRAWBERRY_HARVEST"), "양파 수확"))

        self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

    def test_legacy_version_reads_stored_code_without_remap(self):
        version = parse_version(
            {
                "version": 1,
                "status": "PUBLISHED",
                "state_json": {
                    "task_family": "ONION",
                    "location": {"raw_text": None, "kind": "UNSPECIFIED", "canonical_name": None},
                    "location_display": "장소 미지정",
                    "quantity": {"value": 20, "unit": "망"},
                    "deadline": None,
                    "safety": [],
                    "notes": None,
                    "steps": [{"sequence": 1, "task_code": "ONION_COLLECT", "title_ko": "모으기", "description_ko": "모은다", "unsupported_reason": None, "video": None, "audio_url": None, "delivery_mode": "TEXT", "translations": []}],
                    "risk_assessment": {"level": "LOW", "reasons": []},
                },
            }
        )

        self.assertEqual(version.state.steps[0].task_code, "ONION_COLLECT")

    def test_remote_link_is_real_worker_browser_route(self):
        with patch.object(settings, "public_web_base_url", "https://worker.example.test", create=True):
            _, issued = issue_link("ne")

        self.assertRegex(issued.url, r"^https://worker\.example\.test/w/[A-Za-z0-9_-]+$")

    def test_owner_response_exposes_only_contract_markers(self):
        owner_view = OwnerWorkSession.model_validate(
            {
                "session_id": "s1",
                "current_version": 1,
                "contract_version": "structure-v2",
                "ontology_version": "ontology-v2",
                "version": {"version": 1, "lifecycle": "PUBLISHED", "state": {"task_family": "ONION", "location": {"raw_text": None, "kind": "UNSPECIFIED", "canonical_name": None}, "location_display": "장소 미지정", "quantity": None, "deadline": None, "safety": [], "notes": None, "steps": [], "risk_assessment": {"level": "LOW", "reasons": []}}},
            }
        )

        self.assertEqual(owner_view.contract_version, "structure-v2")
        self.assertEqual(owner_view.ontology_version, "ontology-v2")


if __name__ == "__main__":
    unittest.main()
