"""Temporary owner scope, fixed expiry, and explicit assignment receipt boundaries."""
import copy
import unittest
import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app import main
from test_main import structure, worker_briefing


class Query:
    def __init__(self, rows):
        self.source = rows
        self.rows = rows

    def insert(self, row):
        inserted = {**row, "assigned_at": "2026-09-04T00:00:00+00:00", "revoked_at": None}
        self.source.append(inserted)
        self.rows = [inserted]
        return self
    def select(self, *_): return self
    def limit(self, *_): return self
    def order(self, *_, **__): return self
    def eq(self, key, value):
        self.rows = [r for r in self.rows if str(r.get(key)) == str(value)]
        return self
    def in_(self, key, values):
        self.rows = [r for r in self.rows if r.get(key) in values]
        return self
    def is_(self, key, _):
        self.rows = [r for r in self.rows if r.get(key) is None]
        return self
    def execute(self): return SimpleNamespace(data=copy.deepcopy(self.rows))


class TemporaryTeamTests(unittest.TestCase):
    def setUp(self):
        self.now = main.now_utc()
        self.team_id = str(uuid.uuid4())
        self.session_id = str(uuid.uuid4())
        self.foreign_session_id = str(uuid.uuid4())
        self.team = {
            "id": self.team_id, "owner_id": "owner-1", "farm_id": "farm-1",
            "work_date": "2000-01-01", "activated_at": self.now.isoformat(),
            "expires_at": (self.now + timedelta(hours=24)).isoformat(),
            "invite_issue_idempotency_key": "initial-invite-key", "status": "ACTIVE",
        }
        self.rows = {
            "today_work_teams": [self.team],
            "farms": [{"id": "farm-1", "slug": "internal-farm", "display_name": "작업팀"}],
            "today_work_team_members": [], "today_work_assignments": [], "work_sessions": [],
        }
        self.db = SimpleNamespace(table=lambda name: Query(self.rows[name]), rpc=self.rpc)
        for target, value in (("db_client", self.db),):
            mocked = patch.object(main, target, return_value=value)
            mocked.start()
            self.addCleanup(mocked.stop)
        for key, value in (("owner_session_secret", "test-secret"), ("frontend_origins", "https://testserver"), ("public_web_base_url", "https://testserver")):
            mocked = patch.object(main.settings, key, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        main.pin_failures.clear()
        main.team_join_requests.clear()
        main.owner_start_requests.clear()
        self.client = TestClient(main.app, base_url="https://testserver", headers={"Origin": "https://testserver"})
        self.addCleanup(self.client.close)

    def rpc(self, name, args):
        if name == "start_temporary_work_team":
            self.team.update(id=args["p_team_id"], owner_id=args["p_owner_id"], farm_id=args["p_farm_id"], activated_at=None, status="PENDING", expires_at=(self.now + timedelta(hours=1)).isoformat())
            self.rows["farms"][0]["id"] = args["p_farm_id"]
            return Query([self.team])
        if name == "authenticate_temporary_team":
            valid = args["p_team_id"] == self.team_id and args["p_pin"] == "123456" and main.utc_datetime(self.team["expires_at"]) > self.now
            return Query([self.team] if valid else [])
        if name == "acknowledge_team_assignment":
            if args["p_session_id"] == self.foreign_session_id: raise RuntimeError("assignment_not_found")
            if args["p_expected_version"] != 2: raise RuntimeError("version_conflict")
            return Query([{"work_session_id": "session-1", "current_version": 2, "acknowledged_version": 2, "acknowledged_at": self.now.isoformat()}])
        raise AssertionError(name)

    def owner_cookie(self, **changes):
        # A signed extended bootstrap cookie cannot bypass the database expiry or scope.
        data = {"owner_id": "owner-1", "farm_id": "farm-1", "expires_at": int((self.now + timedelta(hours=25)).timestamp()), "team_id": self.team_id}
        data.update(changes)
        import base64, hashlib, hmac, json
        payload = json.dumps(data).encode()
        encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
        cookie = encode(payload) + "." + encode(hmac.new(b"test-secret", payload, hashlib.sha256).digest())
        self.client.cookies.set(main.COOKIE_NAME, cookie)

    def test_start_has_no_input_and_pending_hides_pin(self):
        response = self.client.post("/api/v1/owner/start", headers={"Idempotency-Key": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["team"]["status"], "PENDING")
        self.assertIsNone(response.json()["team"]["pin"])
        self.assertIsNone(response.json()["team"]["management_url"])
        self.assertEqual(self.client.post("/api/v1/work-teams/today", headers={"Idempotency-Key": "pending-key"}).status_code, 409)
        self.team.update(activated_at=self.now.isoformat(), expires_at=(self.now + timedelta(hours=24)).isoformat(), status="ACTIVE")
        active = self.client.get("/api/v1/owner/session").json()
        self.assertEqual(active["team"]["status"], "ACTIVE")
        self.assertRegex(active["team"]["pin"], r"^\d{6}$")
        self.assertEqual(main.utc_datetime(active["expires_at"]), self.now + timedelta(hours=24))
        self.assertEqual(self.client.get("/api/v1/owner/session").headers.get("Cache-Control"), "no-store")

    def test_owner_database_expiry_and_farm_scope_override_signed_cookie(self):
        self.owner_cookie(farm_id="foreign")
        self.assertEqual(self.client.get("/api/v1/work-sessions").status_code, 401)
        self.owner_cookie()
        self.team["expires_at"] = (self.now - timedelta(seconds=1)).isoformat()
        self.assertEqual(self.client.get("/api/v1/work-sessions").status_code, 401)

    def test_team_survives_midnight_and_get_does_not_extend_expiry(self):
        self.owner_cookie()
        response = self.client.get("/api/v1/work-teams/today")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["team_id"], self.team_id)
        self.assertEqual(main.utc_datetime(response.json()["expires_at"]), self.now + timedelta(hours=24))

    def test_management_pin_failures_are_general_and_limited(self):
        for _ in range(5):
            response = self.client.post("/api/v1/owner/team-session", json={"team_id": self.team_id, "pin": "000000"})
            self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.post("/api/v1/owner/team-session", json={"team_id": self.team_id, "pin": "123456"}).status_code, 429)

    def test_start_resumes_existing_active_team_and_management_login_keeps_expiry(self):
        self.owner_cookie()
        response = self.client.post("/api/v1/owner/start", headers={"Idempotency-Key": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["team"]["team_id"], self.team_id)
        self.client.cookies.clear()
        login = self.client.post("/api/v1/owner/team-session", json={"team_id": self.team_id, "pin": "123456"})
        self.assertEqual(login.status_code, 201)
        self.assertEqual(login.json()["team"], response.json()["team"])

    def test_start_replaces_legacy_cookie_with_temporary_workspace(self):
        self.owner_cookie(team_id=None)
        legacy = self.client.get("/api/v1/owner/session")
        self.assertEqual(legacy.status_code, 200)
        self.assertIsNone(legacy.json()["team"])
        response = self.client.post("/api/v1/owner/start", headers={"Idempotency-Key": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 201)
        self.assertIsNotNone(response.json()["team"])
        self.assertEqual(response.json()["team"]["status"], "PENDING")
        cookie = response.cookies.get(main.COOKIE_NAME)
        identity = main.verify_session(cookie)
        self.assertEqual(identity.team_id, response.json()["team"]["team_id"])
        self.assertNotEqual(identity.farm_id, "farm-1")

    def test_publish_expiry_during_package_build_is_unauthorized(self):
        self.owner_cookie()
        self.rows["work_drafts"] = [{"id": "draft-1", "farm_id": "farm-1", "draft_revision": 0, "summary_ko": "양파 수확", "interpretation": "READY", "state_json": structure(), "contract_version": "structure-v2", "ontology_version": "ontology-v2"}]
        with patch.object(main, "build_worker_packages", new=AsyncMock(return_value=[])), patch.object(self.db, "rpc", side_effect=RuntimeError("expired_team")):
            result = self.client.post("/api/v1/work-sessions/drafts/draft-1/confirm", json={"decision": "CONFIRM", "expected_version": 0}, headers={"Idempotency-Key": "publish-expired"})
        self.assertEqual(result.status_code, 401)

    def test_explicit_acknowledgement_rejects_stale_foreign_and_bad_origin(self):
        cookie = main.sign_team_member(self.team_id, "member-1", self.now + timedelta(hours=24))
        self.client.cookies.set(main.TEAM_MEMBER_COOKIE_NAME, cookie)
        url = f"/api/v1/work-team-members/me/assignments/{self.session_id}/acknowledgement"
        self.assertEqual(self.client.post(url.replace(self.session_id, "not-uuid"), json={"expected_version": 2}).status_code, 422)
        self.assertEqual(self.client.post(url, json={"expected_version": 1}).status_code, 409)
        self.assertEqual(self.client.post(url.replace(self.session_id, self.foreign_session_id), json={"expected_version": 2}).status_code, 404)
        self.assertEqual(self.client.post(url, json={"expected_version": 2}, headers={"Origin": "https://foreign.test"}).status_code, 403)
        first = self.client.post(url, json={"expected_version": 2})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["acknowledged_version"], 2)
        self.assertEqual(self.client.post(url, json={"expected_version": 2}).json(), first.json())

    def test_repeated_assignment_reuses_one_active_row(self):
        self.owner_cookie()
        self.rows["today_work_team_members"] = [{"id": "member-1", "team_id": self.team_id, "farm_id": "farm-1"}]
        self.rows["work_sessions"] = [{"id": self.session_id, "farm_id": "farm-1", "status": "PUBLISHED"}]
        url = "/api/v1/work-teams/today/members/member-1/assignments"
        body = {"work_session_id": self.session_id}

        first = self.client.post(url, json=body, headers={"Idempotency-Key": "assignment-first"})
        second = self.client.post(url, json=body, headers={"Idempotency-Key": "assignment-retry"})

        self.assertEqual((first.status_code, second.status_code), (201, 201))
        self.assertEqual(second.json(), first.json())
        self.assertEqual(len([row for row in self.rows["today_work_assignments"] if row["revoked_at"] is None]), 1)

    def test_assignment_reads_expose_receipts_without_acknowledging(self):
        self.rows["today_work_team_members"] = [{"id": "member-1", "team_id": self.team_id, "farm_id": "farm-1", "display_name": "Min", "language_code": "vi", "joined_at": self.now.isoformat()}]
        self.rows["today_work_assignments"] = [{"team_member_id": "member-1", "work_session_id": "session-1", "farm_id": "farm-1", "acknowledged_version": 1, "acknowledged_at": self.now.isoformat(), "revoked_at": None}]
        self.rows["work_sessions"] = [{"id": "session-1", "farm_id": "farm-1", "current_version": 2, "status": "PUBLISHED", "contract_version": "structure-v2", "ontology_version": "ontology-v2"}]
        self.rows["work_versions"] = [{"id": "version-2", "work_session_id": "session-1", "version": 2, "status": "PUBLISHED"}]
        cookie = main.sign_team_member(self.team_id, "member-1", self.now + timedelta(hours=24))
        self.client.cookies.set(main.TEAM_MEMBER_COOKIE_NAME, cookie)
        package = worker_briefing()
        package["version"] = 2
        self.rows["worker_briefing_packages"] = [{"work_version_id": "version-2", "language_code": "vi", "package_json": package}]
        result = self.client.get("/api/v1/work-team-members/me/assignments")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["assignments"], [package])
        self.assertEqual(result.json()["receipts"][0]["current_version"], 2)
        self.assertEqual(result.json()["receipts"][0]["acknowledged_version"], 1)
        self.owner_cookie()
        roster = self.client.get("/api/v1/work-teams/today").json()
        self.assertEqual(roster["members"][0]["assignment_receipts"][0]["acknowledged_version"], 1)


if __name__ == "__main__":
    unittest.main()
