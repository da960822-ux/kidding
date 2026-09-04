"""Regression checks for quantity text, catalog boundaries, and bounded DB reads."""
import asyncio
import copy
import threading
import time
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import Request, Response

from app import main
from app.p0_runtime import OwnerIdentity
from test_main import structure, worker_briefing
from test_temporary_team import Query


class ReadDatabase:
    def __init__(self, rows, delay=0):
        self.rows, self.delay, self.calls = rows, delay, []

    def table(self, name):
        database = self

        class ReadQuery(Query):
            def select(self, columns):
                self.columns = columns
                return self

            def execute(self):
                database.calls.append((name, threading.get_ident()))
                time.sleep(database.delay)
                if hasattr(database, "before_read"):
                    database.before_read(name, self)
                result = super().execute()
                if self.columns != "*":
                    result.data = [{key: row[key] for key in self.columns.split(",") if key in row} for row in result.data]
                return result

        return ReadQuery(copy.deepcopy(self.rows.get(name, [])))


class RemediationTests(unittest.TestCase):
    def test_concurrent_wrong_pin_requests_reserve_the_existing_attempt_limit(self):
        request = Request({"type": "http", "method": "POST", "headers": []})

        class Rpc:
            def execute(self):
                time.sleep(0.04)
                return SimpleNamespace(data=[])

        async def login():
            try:
                await main.issue_owner_session(main.PinLoginRequest(farm_code="FARM", pin="123456"), request, Response())
            except main.ApiError as error:
                return error.status_code

        async def requests():
            return await asyncio.gather(*(login() for _ in range(10)))

        main.pin_failures.clear()
        with patch.object(main, "require_origin"), patch.object(main.settings, "owner_session_secret", "secret"), patch.object(main, "db_client", return_value=SimpleNamespace(rpc=lambda *_: Rpc())):
            statuses = asyncio.run(requests())
        self.assertEqual(statuses.count(401), 5)
        self.assertEqual(statuses.count(429), 5)
        main.pin_failures.clear()
        with patch.object(main, "require_origin"), patch.object(main.settings, "owner_session_secret", "secret"), patch.object(main, "db_client", side_effect=RuntimeError("database unavailable")):
            self.assertEqual([asyncio.run(login()) for _ in range(6)], [503] * 6)

    def state(self, description, title="양파 수확", notes=None):
        raw = structure()
        raw["steps"][0].update(title_ko=title, description_ko=description)
        raw["notes"] = notes
        return main.work_state_from_structure_v2(main.StructureOutputV2.model_validate(raw))

    def test_quantity_change_updates_target_spans_and_preserves_other_numbers_and_history(self):
        state = self.state("20번 밭에서 양파 20망, 2번 나눠 수확", "20망 수확", "스무 망, 창고 20번에 둔다")
        before = state.model_dump()
        updated = main.replace_quantity_for_v2(state, main.Quantity(value=15, unit="상자"))
        self.assertEqual(updated.steps[0].description_ko, "20번 밭에서 양파 15상자, 2번 나눠 수확")
        self.assertEqual(updated.steps[0].title_ko, "15상자 수확")
        self.assertEqual(updated.notes, "15 상자, 창고 20번에 둔다")
        self.assertEqual(state.model_dump(), before)

    def test_quantity_change_rejects_conflicting_same_unit_instead_of_guessing(self):
        for description in ("20망을 수확하고 5망씩 묶는다", "스무망 중 열망만 옮긴다", "이십 망의 절반을 옮긴다", "20망을 수확하고 트럭당20망 적재", "20망을 수확하고 한 창고에20망 적재"):
            with self.subTest(description=description):
                with self.assertRaises(main.ApiError) as raised:
                    main.replace_quantity_for_v2(self.state(description), main.Quantity(value=15, unit="망"))
                self.assertEqual(raised.exception.code, "SCHEMA_INVALID")

    def test_quantity_change_accepts_korean_target_and_does_not_match_larger_number(self):
        for spelling in ("스무", "스물", "이십"):
            with self.subTest(spelling=spelling):
                state = self.state(f"120번 밭의 {spelling} 망을 수확한다")
                changed = main.replace_quantity_for_v2(state, main.Quantity(value=15, unit="망"))
                self.assertEqual(changed.steps[0].description_ko, "120번 밭의 15 망을 수확한다")

    def test_quantity_change_rejects_unrecognized_target_suffix_without_stale_text(self):
        for text in ("양파20망정도 수확한다", "양파 20망쯤 수확한다", "20망분량을 창고로 옮긴다", "양파 20망을 수확하고 20망짜리 운반 상자에 담으세요"):
            with self.subTest(text=text):
                state = self.state(text)
                before = state.model_dump()
                with self.assertRaises(main.ApiError) as raised:
                    main.replace_quantity_for_v2(state, main.Quantity(value=15, unit="망"))
                self.assertEqual(raised.exception.code, "SCHEMA_INVALID")
                self.assertEqual(state.model_dump(), before)

    def test_quantity_change_handles_attached_target_and_preserves_other_unit_counts(self):
        for text, expected in (("양파20망을 수확한다", "양파15망을 수확한다"), ("총20망", "총15망"), ("양파스무망", "양파15망"), ("20망 수확 후 상자에 5개씩 넣는다", "15망 수확 후 상자에 5개씩 넣는다")):
            with self.subTest(text=text):
                changed = main.replace_quantity_for_v2(self.state(text), main.Quantity(value=15, unit="망"))
                self.assertEqual(changed.steps[0].description_ko, expected)
        for value, text in ((1, "하나 망"), (2, "둘 망"), (3, "셋 망"), (4, "넷 망"), (22, "스물둘 망")):
            with self.subTest(text=text):
                state = self.state(text)
                state.quantity = main.Quantity(value=value, unit="망")
                changed = main.replace_quantity_for_v2(state, main.Quantity(value=15, unit="망"))
                self.assertEqual(changed.steps[0].description_ko, "15 망")

    def test_verified_guide_metadata_survives_database_projection(self):
        db = ReadDatabase({
            "guide_phrases": [{"phrase_key": "wash", "canonical_ko": "손 씻기", "category": "SAFETY", "phrase_type": "INSTRUCTION", "source_name": "Reviewed guide", "source_page": 3, "source_url": "https://example.test/guide.pdf", "license": "public", "verified": True}],
            "guide_translations": [{"phrase_key": "wash", "language_code": "vi", "translated_text": "Rửa tay", "verified": True}],
        })
        guide = main.current_verified_guides(db)[0]
        self.assertEqual({key: guide.get(key) for key in ("category", "phrase_type", "source_name")}, {"category": "SAFETY", "phrase_type": "INSTRUCTION", "source_name": "Reviewed guide"})

    def test_stored_package_cannot_claim_a_different_session_version_or_language(self):
        for field, invalid in (("session_id", "foreign"), ("version", 1), ("language_code", "ne")):
            with self.subTest(field=field):
                rows = self.owner_rows(1)
                package = worker_briefing()
                package.update(session_id="session-0", version=2)
                package[field] = invalid
                rows["worker_briefing_packages"] = [{"work_version_id": "version-0", "language_code": "vi", "package_json": package}]
                with self.assertRaises(main.ApiError):
                    main.stored_worker_briefing(ReadDatabase(rows), "session-0", "vi", "farm-1")

    def test_asset_transport_failure_falls_back_but_schema_errors_do_not(self):
        db = ReadDatabase({})
        for error in (httpx.ReadTimeout("catalog timeout"), httpx.ConnectError("catalog unavailable")):
            with self.subTest(error=type(error).__name__), patch.object(db, "table", side_effect=error):
                self.assertEqual(main.current_assets(db), [])
        with patch.object(db, "table", side_effect=RuntimeError("missing visual_assets column")):
            with self.assertRaises(RuntimeError):
                main.current_assets(db)

    def owner_rows(self, count):
        rows = {"work_sessions": [], "work_versions": [], "worker_links": []}
        for number in range(count):
            session_id = f"session-{number}"
            rows["work_sessions"].append({"id": session_id, "farm_id": "farm-1", "current_version": 2, "status": "PUBLISHED", "contract_version": "structure-v2", "ontology_version": "ontology-v2"})
            rows["work_versions"].extend([
                {"id": f"old-{number}", "work_session_id": session_id, "version": 1, "status": "SUPERSEDED", "state_json": structure()},
                {"id": f"version-{number}", "work_session_id": session_id, "version": 2, "status": "PUBLISHED", "state_json": structure()},
            ])
            rows["worker_links"].append({"work_session_id": session_id, "language_code": "vi", "expires_at": "2100-01-01T00:00:00Z", "issued_at": "2026-01-01T00:00:00Z", "revoked_at": None})
        return rows

    def test_owner_list_has_constant_reads_and_keeps_latest_and_farm_scope(self):
        counts = []
        for count in (1, 5):
            rows = self.owner_rows(count)
            rows["work_sessions"].append({"id": "foreign", "farm_id": "farm-2"})
            db = ReadDatabase(rows)
            with patch.object(main, "db_client", return_value=db), patch.object(main, "require_owner", return_value=OwnerIdentity("owner-1", "farm-1", 4102444800)):
                result = asyncio.run(main.list_sessions("cookie"))
            self.assertEqual(len(result["items"]), count)
            self.assertTrue(all(item.version.version == 2 and len(item.worker_link_meta) == 1 for item in result["items"]))
            counts.append(len(db.calls))
        self.assertEqual(counts, [3, 3])

    def test_list_retries_publication_race_once_and_rejects_persistent_mismatch(self):
        owner = OwnerIdentity("owner-1", "farm-1", 4102444800)
        for resolves in (True, False):
            with self.subTest(resolves=resolves):
                rows = self.owner_rows(1)
                db = ReadDatabase(rows)

                def publish_during_read(name, query):
                    if name != "work_versions":
                        return
                    rows["work_sessions"][0]["current_version"] = 3
                    query.rows = [{"id": "version-3", "work_session_id": "session-0", "version": 3 if resolves else 4, "status": "PUBLISHED", "state_json": structure()}]

                db.before_read = publish_during_read
                with patch.object(main, "db_client", return_value=db), patch.object(main, "require_owner", return_value=owner):
                    if resolves:
                        response = asyncio.run(main.list_sessions("cookie"))
                        self.assertEqual(response["items"][0].version.version, 3)
                    else:
                        with self.assertRaises(main.ApiError) as raised:
                            asyncio.run(main.list_sessions("cookie"))
                        self.assertEqual(raised.exception.code, "VERSION_CONFLICT")
                self.assertEqual(len([call for call in db.calls if call[0] == "work_sessions"]), 2)

    def test_batched_briefings_keep_legacy_and_reject_foreign_farm(self):
        rows = self.owner_rows(1)
        rows["work_sessions"][0].update(contract_version="structure-v1", ontology_version="ontology-v1")
        legacy = self.state("양파를 수확한다").model_dump(mode="json")
        legacy.update(contract_version="structure-v1", ontology_version="ontology-v1", schema_version="1")
        legacy["steps"][0]["task_code"] = "ONION_COLLECT"
        rows["work_versions"][1]["state_json"] = legacy
        result = main.stored_worker_briefings(ReadDatabase(rows), ["session-0"], "vi", "farm-1")
        self.assertEqual(result[0]["steps"][0]["task_code"], "ONION_COLLECT")
        self.assertEqual(result[0]["badge_codes"], ["LEGACY_READ_ONLY"])
        with self.assertRaises(main.ApiError) as raised:
            main.stored_worker_briefings(ReadDatabase(rows), ["session-0"], "vi", "farm-2")
        self.assertEqual(raised.exception.code, "ACCESS_DENIED")

    def test_owner_database_wait_does_not_stall_event_loop(self):
        db = ReadDatabase(self.owner_rows(1), delay=0.06)

        async def probe():
            loop_thread = threading.get_ident()
            task = asyncio.create_task(main.list_sessions("cookie"))
            started = time.monotonic()
            await asyncio.sleep(0.01)
            delay = time.monotonic() - started
            await task
            return delay, loop_thread

        with patch.object(main, "db_client", return_value=db), patch.object(main, "require_owner", return_value=OwnerIdentity("owner-1", "farm-1", 4102444800)):
            delay, loop_thread = asyncio.run(probe())
        self.assertLess(delay, 0.05)
        self.assertTrue(all(thread_id != loop_thread for _, thread_id in db.calls))

    def test_member_assignments_batch_latest_packages_and_preserve_receipts(self):
        counts = []
        for count in (1, 5):
            rows = self.owner_rows(count)
            rows.update({
                "today_work_teams": [{"id": "team-1", "farm_id": "farm-1", "expires_at": (main.now_utc() + timedelta(hours=1)).isoformat()}],
                "today_work_team_members": [{"id": "member-1", "team_id": "team-1", "farm_id": "farm-1", "language_code": "vi"}],
                "today_work_assignments": [], "worker_briefing_packages": [],
            })
            for number in range(count):
                rows["today_work_assignments"].append({"team_member_id": "member-1", "farm_id": "farm-1", "work_session_id": f"session-{number}", "revoked_at": None, "acknowledged_version": 1, "acknowledged_at": "2026-01-01T00:00:00Z"})
                package = worker_briefing()
                package.update(session_id=f"session-{number}", version=2)
                rows["worker_briefing_packages"].append({"work_version_id": f"version-{number}", "language_code": "vi", "package_json": package})
            db = ReadDatabase(rows)
            with patch.object(main, "db_client", return_value=db), patch.object(main, "require_team_member", return_value=("team-1", "member-1")):
                result = asyncio.run(main.get_my_today_assignments("cookie"))
            self.assertEqual([package["session_id"] for package in result["assignments"]], [f"session-{n}" for n in range(count)])
            self.assertTrue(all(receipt.current_version == 2 and receipt.acknowledged_version == 1 for receipt in result["receipts"]))
            counts.append(len(db.calls))
        self.assertEqual(counts, [6, 6])


if __name__ == "__main__":
    unittest.main()
