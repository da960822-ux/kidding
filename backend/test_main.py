import asyncio
import base64
import hashlib
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi import Request, Response

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
    create_today_team,
    clear_pin_failures,
    check_pin_rate_limit,
    current_owner_session,
    current_assets,
    delete_owner_session,
    get_draft,
    draft_summary,
    finalize_tts_package,
    get_today_team,
    health,
    issue_owner_session,
    issue_link,
    join_today_team,
    JoinTeamRequest,
    node_transcript,
    parse_structure_output,
    parse_version,
    PinLoginRequest,
    pin_failures,
    private_tts_bytes,
    read_audio_upload,
    require_initial_instruction,
    ready,
    record_pin_failure,
    request_validation_handler,
    rotate_today_team,
    settings,
    structure_v2_state_json,
    tts_url,
    valid_public_url,
    sign_team_member,
    validate_contract_schema,
    validate_worker_briefing,
    worker_tts_text,
)
from app.ai import AiProviderError
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


def worker_briefing(language_code="vi", steps=None, safety=None, source_detail=None):
    steps = steps or [{"sequence": 1, "task_code": "ONION_HARVEST", "title": "Thu hoạch", "description": "Thu hoạch hành", "delivery_mode": "TEXT_TTS"}]
    safety = safety or []
    source_detail = source_detail or [{"step_sequence": 1, "segment": "ACTION", "source": "AI_TRANSLATION", "guide_lookup": "MISS", "verified": False, "source_page": None, "source_url": None, "license": None}]
    text = "\n".join(["Khu A", "20 bao", *safety, *(f'{step["title"]} {step["description"]}' for step in steps)])
    return {
        "session_id": "session-1", "version": 1, "contract_version": "worker-briefing-v2", "ontology_version": "ontology-v2", "language_code": language_code,
        "context": {"task_family": "ONION", "location_display": "Khu A", "quantity": {"value": 20, "unit": "bao"}, "deadline": None, "notes": None, "safety": safety},
        "badges": [], "steps": steps, "source_detail": source_detail,
        "tts": {"status": "READY", "text_hash": hashlib.sha256(text.encode()).hexdigest(), "audio_url": None}, "video": [],
    }


class BackendP0Tests(unittest.TestCase):
    def test_owner_can_recover_only_an_active_v2_draft_without_caching(self):
        state, ambiguities, interpretation = asyncio.run(parse_structure_output(structure(), "양파 20망 수확"))
        draft_row = {
            "id": "draft-1", "draft_revision": 0, "summary_ko": "양파를 수확합니다.",
            "interpretation": interpretation,
            "state_json": structure_v2_state_json(state, interpretation, "양파를 수확합니다.", ambiguities),
            "ambiguities": [], "transcript": "양파 20망 수확", "contract_version": "structure-v2",
            "ontology_version": "ontology-v2", "confirmed_session_id": None,
            "expires_at": "2100-01-01T00:00:00+00:00",
        }
        selected: list[tuple[str, str]] = []

        class Query:
            def select(self, *_args): return self
            def eq(self, key, value): selected.append((key, value)); return self
            def limit(self, *_args): return self
            def execute(self): return type("Result", (), {"data": [draft_row]})()

        class Client:
            def table(self, name):
                if name != "work_drafts":
                    raise AssertionError(name)
                return Query()

        response = Response()
        with (
            patch("app.main.db_client", return_value=Client()),
            patch("app.main.require_owner", return_value=OwnerIdentity("owner-1", "farm-1", 4_102_444_800)),
        ):
            recovered = asyncio.run(get_draft("draft-1", response, "cookie"))

        self.assertEqual(recovered.draft_id, "draft-1")
        self.assertEqual(selected, [("id", "draft-1"), ("farm_id", "farm-1")])
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_owner_cannot_recover_expired_or_confirmed_draft(self):
        owner = OwnerIdentity("owner-1", "farm-1", 4_102_444_800)
        for row, status, code in (
            ({"expires_at": "2000-01-01T00:00:00+00:00", "confirmed_session_id": None}, 404, "NOT_FOUND"),
            ({"expires_at": "2100-01-01T00:00:00+00:00", "confirmed_session_id": "session-1"}, 409, "VERSION_CONFLICT"),
        ):
            with self.subTest(code=code):
                class Query:
                    def select(self, *_args): return self
                    def eq(self, *_args): return self
                    def limit(self, *_args): return self
                    def execute(self): return type("Result", (), {"data": [row]})()
                class Client:
                    def table(self, *_args): return Query()
                with patch("app.main.db_client", return_value=Client()), patch("app.main.require_owner", return_value=owner):
                    with self.assertRaises(ApiError) as raised:
                        asyncio.run(get_draft("draft-1", Response(), "cookie"))
                self.assertEqual((raised.exception.status_code, raised.exception.code), (status, code))

    def test_public_urls_are_absolute_and_do_not_embed_credentials(self):
        self.assertTrue(valid_public_url("https://app.example.com"))
        self.assertTrue(valid_public_url("http://127.0.0.1:8000"))
        for value in ("", "app.example.com", "ftp://app.example.com", "https://user:secret@app.example.com"):
            with self.subTest(value=value):
                self.assertFalse(valid_public_url(value))

    def test_ready_rejects_a_missing_public_api_url(self):
        with (
            patch.object(settings, "supabase_url", "https://example.supabase.co"),
            patch.object(settings, "supabase_secret_key", "secret"),
            patch.object(settings, "owner_session_secret", "secret"),
            patch.object(settings, "public_web_base_url", "https://app.example.com"),
            patch.object(settings, "public_api_base_url", ""),
            patch.object(settings, "demo_fallback", False),
        ):
            with self.assertRaises(ApiError) as raised:
                asyncio.run(ready())

        self.assertEqual(raised.exception.status_code, 503)

    def test_health_and_ready_expose_revision_and_verify_current_database_contract(self):
        class Query:
            def select(self, columns):
                package_columns = {
                    "id", "work_version_id", "language_code", "contract_version",
                    "ontology_version", "package_json", "created_at",
                }
                if not set(columns.split(",")).issubset(package_columns):
                    raise ValueError("worker_briefing_packages column does not exist")
                return self
            def limit(self, *_args): return self
            def execute(self): return type("Result", (), {"data": []})()

        class Client:
            def rpc(self, name):
                self.rpc_name = name
                return type("Rpc", (), {"execute": lambda _self: type("Result", (), {"data": [{"ready": True}]})()})()
            def table(self, name):
                self.table_name = name
                return Query()

        client = Client()
        with (
            patch("app.main.db_client", return_value=client),
            patch("app.main.provider_ready", return_value=True),
            patch.object(settings, "supabase_url", "https://example.supabase.co"),
            patch.object(settings, "supabase_secret_key", "secret"),
            patch.object(settings, "owner_session_secret", "secret"),
            patch.object(settings, "public_web_base_url", "https://app.example.com"),
            patch.object(settings, "public_api_base_url", "https://app.example.com"),
            patch.object(settings, "app_revision", "abc123"),
        ):
            self.assertEqual(asyncio.run(health()), {"status": "ok", "revision": "abc123"})
            self.assertEqual(asyncio.run(ready()), {"status": "ready", "revision": "abc123"})

        self.assertEqual(client.rpc_name, "p0_readiness")
        self.assertEqual(client.table_name, "worker_briefing_packages")

    def test_tts_url_never_falls_back_to_frontend_origin(self):
        with (
            patch.object(settings, "public_api_base_url", ""),
            patch.object(settings, "frontend_origins", "https://app.example.com"),
            patch.object(settings, "demo_fallback", True),
        ):
            self.assertIsNone(tts_url("a" * 64, "vi"))

    def test_owner_session_uses_farm_code_and_exposes_farm_identity(self):
        sent = {}

        class Client:
            def rpc(self, name, args):
                sent["name"] = name
                sent["args"] = args
                return type(
                    "Rpc",
                    (),
                    {
                        "execute": lambda _self: type(
                            "Result",
                            (),
                            {
                                "data": [{
                                    "owner_id": "owner-1",
                                    "farm_id": "farm-1",
                                    "farm_code": "green-farm",
                                    "farm_name": "초록 농장",
                                }]
                            },
                        )()
                    },
                )()

        request = Request({"type": "http", "method": "POST", "headers": [(b"origin", b"https://app.example.test")]})
        response = Response()
        with (
            patch("app.main.db_client", return_value=Client()),
            patch("app.main.require_origin"),
            patch.object(settings, "owner_session_secret", "test-secret"),
        ):
            result = asyncio.run(
                issue_owner_session(PinLoginRequest(farm_code=" green-farm ", pin="1234"), request, response)
            )

        self.assertEqual(sent, {
            "name": "authenticate_farm_owner",
            "args": {"p_farm_code": "green-farm", "p_pin": "1234"},
        })
        self.assertEqual(result.farm.code, "green-farm")
        self.assertEqual(result.farm.display_name, "초록 농장")
        self.assertIn("batmeori_owner_session=", response.headers["set-cookie"])

    def test_current_owner_session_and_logout_support_reauthentication(self):
        class Query:
            def select(self, *_args): return self
            def eq(self, *_args): return self
            def limit(self, *_args): return self
            def execute(self):
                return type("Result", (), {"data": [{"slug": "green-farm", "display_name": "초록 농장"}]})()

        class Client:
            def table(self, name):
                self.assert_name = name
                return Query()

        owner = OwnerIdentity("owner-1", "farm-1", 4_102_444_800)
        with (
            patch("app.main.db_client", return_value=Client()),
            patch("app.main.require_owner", return_value=owner),
        ):
            current = asyncio.run(current_owner_session("cookie"))

        self.assertEqual(current.farm.code, "green-farm")
        self.assertEqual(int(current.expires_at.timestamp()), owner.expires_at)

        request = Request({"type": "http", "method": "DELETE", "headers": [(b"origin", b"https://app.example.test")]})
        with patch("app.main.require_origin"):
            logged_out = asyncio.run(delete_owner_session(request, Response()))
        self.assertEqual(logged_out.status_code, 204)
        self.assertIn("batmeori_owner_session=", logged_out.headers["set-cookie"])
        self.assertIn("Max-Age=0", logged_out.headers["set-cookie"])

    def test_daily_team_qr_is_stable_until_explicit_rotation(self):
        team = {
            "id": "team-1",
            "farm_id": "farm-1",
            "work_date": "2026-09-04",
            "invite_issue_idempotency_key": "create-key-a",
            "invite_token_hash": "stored-hash",
            "issued_at": "2026-09-04T00:00:00+00:00",
            "expires_at": "2099-09-05T00:00:00+00:00",
        }

        class Query:
            def __init__(self, client, name):
                self.client = client
                self.name = name
                self.update_value = None
            def select(self, *_args): return self
            def eq(self, *_args): return self
            def limit(self, *_args): return self
            def order(self, *_args, **_kwargs): return self
            def update(self, value): self.update_value = value; return self
            def execute(self):
                if self.name == "today_work_team_members":
                    return type("Result", (), {"data": []})()
                if self.update_value is not None:
                    self.client.update_count += 1
                    self.client.team.update(self.update_value)
                return type("Result", (), {"data": [dict(self.client.team)]})()

        class Client:
            def __init__(self):
                self.team = dict(team)
                self.update_count = 0
                self.rotation_keys = {self.team["invite_issue_idempotency_key"]}
            def table(self, name): return Query(self, name)
            def rpc(self, name, args):
                self.assert_name = name
                if args["p_idempotency_key"] not in self.rotation_keys:
                    self.rotation_keys.add(args["p_idempotency_key"])
                    self.update_count += 1
                    self.team.update({
                        "invite_token_hash": args["p_invite_token_hash"],
                        "invite_issue_idempotency_key": args["p_idempotency_key"],
                        "issued_at": args["p_issued_at"],
                        "expires_at": args["p_expires_at"],
                    })
                return type("Rpc", (), {"execute": lambda _self: type("Result", (), {"data": [dict(self.team)]})()})()

        client = Client()
        owner = OwnerIdentity("owner-1", "farm-1", 4_102_444_800)
        request = Request({"type": "http", "method": "POST", "headers": [(b"origin", b"https://app.example.test")]})
        with (
            patch("app.main.db_client", return_value=client),
            patch("app.main.require_owner", return_value=owner),
            patch("app.main.require_origin"),
            patch.object(settings, "owner_session_secret", "test-secret"),
            patch.object(settings, "public_web_base_url", "https://app.example.test"),
        ):
            created = asyncio.run(create_today_team(request, Response(), "create-key-a", "cookie"))
            restored = asyncio.run(get_today_team(request, "cookie"))
            rotated_b = asyncio.run(rotate_today_team(request, "rotate-key-b", "cookie"))
            replayed_a = asyncio.run(rotate_today_team(request, "create-key-a", "cookie"))

        self.assertEqual(created.join_url, restored.join_url)
        self.assertNotEqual(restored.join_url, rotated_b.join_url)
        self.assertEqual(rotated_b.join_url, replayed_a.join_url)
        self.assertEqual(client.update_count, 1)

    def test_ready_requires_015_readiness_rpc(self):
        called = []

        class Query:
            def select(self, *_args): return self
            def limit(self, *_args): return self
            def execute(self): return type("Result", (), {"data": []})()

        class Client:
            def __init__(self, is_ready=True): self.is_ready = is_ready
            def table(self, _name): return Query()
            def rpc(self, name):
                called.append(name)
                data = [{"ready": True}] if self.is_ready else []
                return type("Rpc", (), {"execute": lambda _self: type("Result", (), {"data": data})()})()

        with (
            patch("app.main.db_client", return_value=Client()),
            patch("app.main.provider_ready", return_value=True),
            patch.object(settings, "supabase_url", "https://example.supabase.co"),
            patch.object(settings, "supabase_secret_key", "secret"),
            patch.object(settings, "owner_session_secret", "secret"),
            patch.object(settings, "public_web_base_url", "https://app.example.com"),
            patch.object(settings, "public_api_base_url", "https://api.example.com"),
            patch.object(settings, "demo_fallback", False),
        ):
            self.assertEqual(asyncio.run(ready()), {"status": "ready", "revision": settings.app_revision})
        with (
            patch("app.main.db_client", return_value=Client(False)),
            patch("app.main.provider_ready", return_value=True),
            patch.object(settings, "supabase_url", "https://example.supabase.co"),
            patch.object(settings, "supabase_secret_key", "secret"),
            patch.object(settings, "owner_session_secret", "secret"),
            patch.object(settings, "public_web_base_url", "https://app.example.com"),
            patch.object(settings, "public_api_base_url", "https://api.example.com"),
            patch.object(settings, "demo_fallback", False),
        ):
            with self.assertRaises(ApiError) as missing:
                asyncio.run(ready())

        self.assertEqual(missing.exception.status_code, 503)
        self.assertEqual(called, ["p0_readiness", "p0_readiness"])

    def test_pin_failures_are_scoped_to_farm_and_validation_hides_pin(self):
        request = Request({"type": "http", "client": ("203.0.113.7", 443), "headers": []})
        pin_failures.clear()
        try:
            for _ in range(5):
                record_pin_failure(request, "farm-a")
            with self.assertRaises(ApiError) as limited:
                check_pin_rate_limit(request, "farm-a")
            self.assertEqual(limited.exception.status_code, 429)
            check_pin_rate_limit(request, "farm-b")
            clear_pin_failures(request, "farm-b")
            with self.assertRaises(ApiError):
                check_pin_rate_limit(request, "farm-a")
        finally:
            pin_failures.clear()

        class ValidationErrors:
            def errors(self):
                return [{"type": "string_too_short", "loc": ("body", "pin"), "msg": "too short", "input": "1234"}]

        response = asyncio.run(request_validation_handler(request, ValidationErrors()))
        self.assertNotIn("1234", response.body.decode())

    def test_join_reuses_existing_member_cookie_for_same_team(self):
        expires_at = datetime(2099, 9, 5, tzinfo=timezone.utc)
        team = {
            "id": "team-1", "farm_id": "farm-1", "expires_at": expires_at.isoformat(),
        }
        member = {
            "id": "member-1", "team_id": "team-1", "farm_id": "farm-1",
            "display_name": "기존 근로자", "language_code": "vi", "joined_at": expires_at.isoformat(),
        }

        class Query:
            def __init__(self, client, name): self.client, self.name, self.inserted = client, name, False
            def select(self, *_args): return self
            def eq(self, *_args): return self
            def limit(self, *_args): return self
            def insert(self, _row): self.inserted = True; return self
            def execute(self):
                if self.name == "today_work_teams":
                    data = [team]
                elif self.inserted:
                    self.client.inserts += 1
                    data = [member]
                else:
                    data = [member]
                return type("Result", (), {"data": data})()

        class Client:
            def __init__(self): self.inserts = 0
            def table(self, name): return Query(self, name)

        request = Request({"type": "http", "client": ("203.0.113.8", 443), "headers": []})
        client = Client()
        with (
            patch("app.main.db_client", return_value=client),
            patch.object(settings, "owner_session_secret", "test-secret"),
        ):
            cookie = sign_team_member("team-1", "member-1", expires_at)
            result = asyncio.run(
                join_today_team("valid-token", JoinTeamRequest(display_name="새 이름", language_code="ne"), request, Response(), "new-join-key", cookie)
            )

        self.assertEqual(result.member_id, "member-1")
        self.assertEqual(result.display_name, "기존 근로자")
        self.assertEqual(client.inserts, 0)

    def test_browser_webm_codec_parameter_is_accepted_and_normalized(self):
        class BrowserRecording:
            content_type = "audio/webm;codecs=opus"

            async def read(self, _limit):
                return b"recording"

        bridge = AsyncMock(return_value={"transcript": "녹음 내용"})
        with (
            patch("app.main.audio_duration_seconds", return_value=1),
            patch("app.main.bridge_call", new=bridge),
        ):
            content = asyncio.run(read_audio_upload(BrowserRecording()))
            transcript = asyncio.run(node_transcript(content, "recording.webm", BrowserRecording.content_type, "ko"))

        self.assertEqual(transcript, "녹음 내용")
        self.assertEqual(bridge.await_args.args[1]["content_type"], "audio/webm")

    def test_foreign_hallucination_is_rejected_before_structuring(self):
        with patch("app.main.bridge_call", new=AsyncMock(return_value={"transcript": "Haciendo ejercicio."})):
            with self.assertRaises(ApiError) as raised:
                asyncio.run(node_transcript(b"audio", "recording.webm", "audio/webm", "ko"))

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.code, "AUDIO_UNCLEAR")
        self.assertIn("다시 녹음", raised.exception.message)

    def test_empty_stt_result_is_reported_as_unclear_audio(self):
        with patch("app.main.bridge_call", new=AsyncMock(side_effect=AiProviderError("AUDIO_UNCLEAR"))):
            with self.assertRaises(ApiError) as raised:
                asyncio.run(node_transcript(b"audio", "recording.webm", "audio/webm", "ko"))

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(raised.exception.code, "AUDIO_UNCLEAR")
        self.assertIn("녹음을 재생", raised.exception.message)

    def test_initial_instruction_requires_an_in_scope_crop_but_preserves_task_ambiguity(self):
        require_initial_instruction("1번 밭에서 양파 스무 망을 수확해")
        require_initial_instruction("양파를 어떻게 좀 해줘")

        for transcript in ("들리는 한국어만 그대로 전사하고", "도시농업이란", "핑크색"):
            with self.subTest(transcript=transcript), self.assertRaises(ApiError) as raised:
                require_initial_instruction(transcript)
            self.assertEqual(raised.exception.code, "AUDIO_UNCLEAR")

    def test_ambiguous_task_can_be_saved_as_a_blocking_empty_draft(self):
        raw = structure()
        raw.update({
            "interpretation": "AMBIGUOUS",
            "steps": [],
            "ambiguities": [{"field": "task", "message": "작업을 확인하세요.", "blocking": True, "kind": "TASK"}],
        })

        state, ambiguities, interpretation = asyncio.run(parse_structure_output(raw, "양파를 어떻게 좀 해줘"))

        self.assertEqual(interpretation, "AMBIGUOUS")
        self.assertEqual(state.steps, [])
        self.assertTrue(ambiguities[0].blocking)

    def test_package_build_sends_exact_structure_and_keeps_tts_bytes_private(self):
        briefings = {
            "vi": worker_briefing(),
            "ne": worker_briefing(
                "ne",
                [{"sequence": 1, "task_code": "ONION_HARVEST", "title": "प्याज काट्नु", "description": "प्याज काट्नुहोस्", "delivery_mode": "TEXT_TTS"}],
            ),
        }
        bridge_result = {
            language: {
                "briefing": briefing,
                "tts_transport": {
                    "status": "READY",
                    "text": "\n".join(["Khu A", "20 bao", *briefing["context"]["safety"], *(f'{step["title"]} {step["description"]}' for step in briefing["steps"])]),
                    "text_hash": briefing["tts"]["text_hash"],
                    "audio_url": None,
                    "audio_bytes_base64": base64.b64encode(b"audio").decode(),
                },
            }
            for language, briefing in briefings.items()
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
        self.assertNotIn('"text":', str(packages))

    def test_worker_briefing_blocks_unverified_safety_and_changed_steps(self):
        state = WorkState(
            task_family="ONION", location=Location(raw_text="A", kind="NAMED", canonical_name="A"), location_display="A",
            quantity={"value": 20, "unit": "망"}, deadline=None, safety=[], notes=None,
            steps=[Step(sequence=1, task_code="ONION_HARVEST", title_ko="양파 수확", description_ko="양파를 수확한다", unsupported_reason=None)],
            risk_assessment=RiskAssessment(level="LOW", reasons=[]),
        )
        safety_detail = {"step_sequence": None, "segment": "SAFETY", "source": "OFFICIAL_GUIDE", "guide_lookup": "HIT", "verified": True, "source_page": 1, "source_url": "https://guide.example.test/1", "license": "CC-BY"}
        package = worker_briefing(safety=["Đeo găng tay."], source_detail=[
            {"step_sequence": 1, "segment": "ACTION", "source": "AI_TRANSLATION", "guide_lookup": "MISS", "verified": False, "source_page": None, "source_url": None, "license": None},
            safety_detail,
        ])
        validate_worker_briefing(package, "vi", "session-1", 1, state)

        package["source_detail"][1] = {**safety_detail, "verified": False}
        with self.assertRaises(ApiError) as safety_error:
            validate_worker_briefing(package, "vi", "session-1", 1, state)
        self.assertEqual(safety_error.exception.code, "SCHEMA_INVALID")

        package = worker_briefing(steps=[{"sequence": 1, "task_code": "STRAWBERRY_HARVEST", "title": "Thu hoạch", "description": "Thu hoạch", "delivery_mode": "TEXT"}])
        with self.assertRaises(ApiError) as step_error:
            validate_worker_briefing(package, "vi", "session-1", 1, state)
        self.assertEqual(step_error.exception.code, "SCHEMA_INVALID")

    def test_full_tts_includes_context_safety_source_order_steps_and_notes(self):
        briefing = worker_briefing(safety=["Đeo găng tay."])
        briefing["context"].update(deadline="Trước 11 giờ", notes="Không ném hành.")
        briefing["steps"].insert(0, {"sequence": 2, "title": "Cắt", "description": "Cắt lá hành"})
        expected = "Khu A\n20 bao\nTrước 11 giờ\nĐeo găng tay.\nCắt Cắt lá hành\nThu hoạch Thu hoạch hành\nKhông ném hành."
        self.assertEqual(worker_tts_text(briefing), expected)
        text_hash = hashlib.sha256(expected.encode()).hexdigest()
        briefing["tts"]["text_hash"] = text_hash
        result = finalize_tts_package(None, "vi", {
            "briefing": briefing,
            "tts_transport": {"status": "FALLBACK", "text": expected, "text_hash": text_hash},
        })
        self.assertEqual(result["tts"]["status"], "FALLBACK")
        for line in expected.splitlines():
            with self.subTest(omitted=line):
                incomplete = "\n".join(part for part in expected.splitlines() if part != line)
                incomplete_hash = hashlib.sha256(incomplete.encode()).hexdigest()
                briefing["tts"]["text_hash"] = incomplete_hash
                with self.assertRaises(ApiError) as raised:
                    finalize_tts_package(None, "vi", {
                        "briefing": briefing,
                        "tts_transport": {"status": "FALLBACK", "text": incomplete, "text_hash": incomplete_hash},
                    })
                self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

    def test_full_tts_omits_unknown_quantity_and_absent_optional_context(self):
        for quantity in [None, "UNSPECIFIED"]:
            briefing = worker_briefing()
            briefing["context"]["quantity"] = quantity
            self.assertEqual(worker_tts_text(briefing), "Khu A\nThu hoạch Thu hoạch hành")

    def test_full_tts_rejects_malformed_quantity_before_speaking(self):
        for quantity in [{}, {"value": None, "unit": "bao"}, {"value": 20, "unit": None}]:
            with self.subTest(quantity=quantity):
                briefing = worker_briefing()
                briefing["context"]["quantity"] = quantity
                with self.assertRaises(ApiError) as raised:
                    worker_tts_text(briefing)
                self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

    def test_tts_transport_must_match_complete_briefing(self):
        briefing = worker_briefing(safety=["Đeo găng tay."])
        with self.assertRaises(ApiError) as raised:
            finalize_tts_package(
                None,
                "vi",
                {"briefing": briefing, "tts_transport": {"status": "FALLBACK", "text": "Thu hoạch", "text_hash": briefing["tts"]["text_hash"]}},
            )
        self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

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

    def test_task_ambiguity_is_always_blocking(self):
        raw = structure("ONION_TRANSPORT")
        raw["interpretation"] = "AMBIGUOUS"
        raw["ambiguities"] = [{"field": "task_code", "message": "작업 불명확", "blocking": False, "kind": "TASK"}]

        _, ambiguities, _ = asyncio.run(parse_structure_output(raw, "양파를 담아"))

        self.assertTrue(ambiguities[0].blocking)

    def test_draft_summary_never_invents_harvest_or_destination(self):
        state, _, _ = asyncio.run(parse_structure_output(structure("ONION_TRANSPORT"), "양파를 지정 장소로 옮겨"))
        state.steps[0].title_ko = "양파 운반"

        summary = draft_summary(state)

        self.assertIn("양파 운반", summary)
        self.assertNotIn("수확", summary)
        self.assertNotIn("창고", summary)

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

    def test_duplicate_confirm_returns_the_existing_published_session(self):
        state, ambiguities, interpretation = asyncio.run(parse_structure_output(structure(), "양파 20망 수확"))
        state_json = structure_v2_state_json(state, interpretation, "양파를 수확합니다.", ambiguities)
        draft_row = {
            "id": "draft-1", "confirmed_session_id": "session-1", "draft_revision": 0,
            "summary_ko": "양파를 수확합니다.", "interpretation": interpretation,
            "state_json": state_json, "ambiguities": [], "transcript": "양파 20망 수확",
            "contract_version": "structure-v2", "ontology_version": "ontology-v2",
        }
        version_row = {
            "version": 1, "status": "PUBLISHED", "state_json": state_json,
            "ambiguity_override": False, "override_reason": None, "transcript": None,
        }

        class Query:
            def __init__(self, name): self.name = name
            def select(self, *_args): return self
            def eq(self, *_args): return self
            def order(self, *_args, **_kwargs): return self
            def execute(self):
                data = {
                    "work_drafts": [draft_row],
                    "work_sessions": [{"id": "session-1", "current_version": 1, "contract_version": "structure-v2", "ontology_version": "ontology-v2"}],
                    "work_versions": [version_row],
                    "worker_links": [],
                }.get(self.name, [])
                return type("Result", (), {"data": data})()

        class Client:
            def table(self, name): return Query(name)
            def rpc(self, *_args): raise AssertionError("duplicate confirm must not publish again")

        request = Request({"type": "http", "method": "POST", "headers": []})
        owner = OwnerIdentity("owner-1", "farm-1", 4_102_444_800)
        with (
            patch("app.main.db_client", return_value=Client()),
            patch("app.main.require_owner", return_value=owner),
            patch("app.main.require_origin"),
            patch("app.main.require_idempotency", return_value="idempotency-key"),
            patch("app.main.build_worker_packages", new=AsyncMock()) as build,
        ):
            response = asyncio.run(
                confirm_draft(
                    "draft-1", DraftConfirmRequest(expected_version=0, decision="CONFIRM"), request, "idempotency-key", "cookie"
                )
            )

        self.assertEqual(response.work_session.session_id, "session-1")
        build.assert_not_awaited()

    def test_quantity_confirm_reuses_prior_structure_metadata_in_atomic_snapshot(self):
        state, ambiguities, interpretation = asyncio.run(parse_structure_output(structure(), "양파 20망 수확"))
        state.steps[0].description_ko = "20번 밭에서 양파 20망을 수확한다"
        state.notes = "스무 망을 창고에 둔다"
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
        self.assertEqual(sent["rpc_args"]["p_state_json"]["steps"][0]["description_ko"], "20번 밭에서 양파 15망을 수확한다")
        self.assertEqual(sent["rpc_args"]["p_state_json"]["notes"], "15 망을 창고에 둔다")
        self.assertEqual(previous["state_json"]["notes"], "스무 망을 창고에 둔다")

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
