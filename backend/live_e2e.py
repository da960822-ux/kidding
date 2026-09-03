"""Run the paid live P0 API smoke flow.

API checks resend extracted cookies. Separate browser checks verify cookie
acceptance through the configured frontend's same-origin proxy without injection.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE_URL = os.getenv("LIVE_API_BASE_URL", "").rstrip("/")
ORIGIN = os.getenv("LIVE_FRONTEND_ORIGIN", "").rstrip("/")
EXPECTED_REVISION = os.getenv("LIVE_EXPECTED_REVISION", "").strip()


def request(
    path: str,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
    method: str | None = None,
):
    request_headers = {"Origin": ORIGIN}
    request_headers.update(headers or {})
    response_request = urllib.request.Request(
        f"{BASE_URL}{path}", data=body, headers=request_headers, method=method or ("POST" if body is not None else "GET")
    )
    try:
        with urllib.request.urlopen(response_request, timeout=60) as response:
            return response.status, dict(response.headers), json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), json.loads(error.read())


def multipart_audio(path: pathlib.Path, fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = f"----batmeori{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    chunks.extend(
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="{path.name}"\r\n'.encode(),
            b"Content-Type: audio/wav\r\n\r\n",
            path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        )
    )
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def main() -> None:
    if os.getenv("LIVE_E2E") != "1":
        raise RuntimeError("set LIVE_E2E=1 to run the paid live flow")
    if not BASE_URL or not ORIGIN or not EXPECTED_REVISION:
        raise RuntimeError("LIVE_API_BASE_URL, LIVE_FRONTEND_ORIGIN, and LIVE_EXPECTED_REVISION are required")
    farm_code = os.getenv("LIVE_FARM_CODE")
    owner_pin = os.getenv("LIVE_FARM_OWNER_PIN")
    if not farm_code or not owner_pin:
        raise RuntimeError("LIVE_FARM_CODE and LIVE_FARM_OWNER_PIN for a provisioned farm owner are required")
    status, _, health = request("/health")
    assert status == 200 and health["revision"] == EXPECTED_REVISION, health
    status, _, readiness = request("/ready")
    assert status == 200 and readiness["revision"] == EXPECTED_REVISION, readiness
    status, _, unauthorized = request("/api/v1/work-sessions")
    assert status == 401 and unauthorized["code"] == "UNAUTHORIZED", unauthorized
    status, headers, owner_session = request(
        "/api/v1/owner/session",
        json.dumps({"farm_code": farm_code, "pin": owner_pin}).encode(),
        {"Content-Type": "application/json"},
    )
    assert status == 201 and owner_session["farm"]["code"] == farm_code.lower(), owner_session
    cookie = next(value for name, value in headers.items() if name.lower() == "set-cookie").split(";", 1)[0]
    status, _, forbidden = request(
        "/api/v1/work-teams/today",
        headers={"Cookie": cookie, "Idempotency-Key": f"live-origin-{uuid.uuid4().hex}", "Origin": "https://invalid.example"},
        method="POST",
    )
    assert status == 403 and forbidden["code"] == "UNAUTHORIZED", forbidden
    fixture_dir = pathlib.Path(__file__).resolve().parents[1] / "evals" / "audio"
    fixture_name = "01-clear-work-instruction.wav"
    manifest = [json.loads(line) for line in (fixture_dir / "manifest.jsonl").read_text(encoding="utf-8").splitlines()]
    expected_transcript = next(item["transcript"] for item in manifest if item["file"] == fixture_name)

    # This fixture covers two steps, Korean STT accuracy, reviewed harvest video,
    # and transport instructions delivered through text and TTS.
    body, content_type = multipart_audio(fixture_dir / fixture_name, {"language_hint": "ko"})
    status, _, draft = request(
        "/api/v1/work-sessions/drafts/from-audio",
        body,
        {"Content-Type": content_type, "Cookie": cookie, "Idempotency-Key": f"live-draft-{uuid.uuid4().hex}"},
    )
    assert status == 200 and draft["state"]["steps"], draft
    assert draft["transcript"] == expected_transcript, draft["transcript"]
    assert draft["state"]["quantity"] == {"value": 20, "unit": "망"}, draft["state"]["quantity"]

    status, _, published = request(
        f"/api/v1/work-sessions/drafts/{draft['draft_id']}/confirm",
        json.dumps({"expected_version": 0, "decision": "PUBLISH_AS_IS", "ambiguity_override": True, "override_reason": "IN_PERSON_BRIEFING"}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-confirm-{uuid.uuid4().hex}"},
    )
    assert status == 201
    session_id = published["work_session"]["session_id"]
    status, _, sessions = request("/api/v1/work-sessions", headers={"Cookie": cookie})
    assert status == 200 and any(item["session_id"] == session_id for item in sessions["items"]), sessions
    status, _, session = request(f"/api/v1/work-sessions/{session_id}", headers={"Cookie": cookie})
    assert status == 200 and session["session_id"] == session_id and session["current_version"] == 1, session
    status, _, issued = request(
        f"/api/v1/work-sessions/{session_id}/worker-links",
        json.dumps({"language_code": "vi"}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-link-{uuid.uuid4().hex}"},
    )
    assert status == 201 and issued["issued_worker_links"], issued
    worker_url = issued["issued_worker_links"][0]["url"]
    assert urllib.parse.urlsplit(worker_url).scheme + "://" + urllib.parse.urlsplit(worker_url).netloc == ORIGIN, worker_url
    worker_token = worker_url.rsplit("/", 1)[-1]
    status, _, worker = request(f"/api/v1/worker-links/{worker_token}/assignment")
    assert status == 200 and "transcript" not in json.dumps(worker) and "risk_assessment" not in json.dumps(worker), worker
    if worker["tts"]["audio_url"]:
        audio_url = urllib.parse.urlsplit(worker["tts"]["audio_url"])
        assert f"{audio_url.scheme}://{audio_url.netloc}" == ORIGIN, worker["tts"]["audio_url"]
    project_root = pathlib.Path(__file__).resolve().parents[1]
    policy = json.loads((project_root / "ai/references/delivery-policy-v2.json").read_text(encoding="utf-8"))
    excluded = set(policy["video_excluded_task_codes"])
    expected_videos = {
        (step["sequence"], step["task_code"]) for step in worker["steps"]
        if step["task_code"] and step["task_code"] not in excluded
    }
    actual_videos = {(video["step_sequence"], video["task_code"]) for video in worker["video"]}
    assert actual_videos == expected_videos, {"expected": sorted(expected_videos), "actual": sorted(actual_videos)}
    browser_env = {
        **os.environ,
        "LIVE_WORKER_URL": worker_url,
        "LIVE_EXPECTED_VIDEO_COUNT": str(len(actual_videos)),
    }
    subprocess.run(
        ["node", str(project_root / "scripts" / "check-live-worker-videos.mjs")],
        cwd=project_root,
        env=browser_env,
        check=True,
    )

    status, _, reissued = request(
        f"/api/v1/work-sessions/{session_id}/worker-links",
        json.dumps({"language_code": "vi"}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-reissue-{uuid.uuid4().hex}"},
    )
    assert status == 201 and reissued["issued_worker_links"], reissued
    new_worker_token = reissued["issued_worker_links"][0]["url"].rsplit("/", 1)[-1]
    assert request(f"/api/v1/worker-links/{worker_token}/assignment")[0] == 404
    assert request(f"/api/v1/worker-links/{'x' * 32}/assignment")[0] == 404
    worker_token = new_worker_token

    body, content_type = multipart_audio(fixture_dir / "02-quantity-change.wav", {"expected_version": "1"})
    status, _, preview = request(
        f"/api/v1/work-sessions/{session_id}/quantity-changes/from-audio",
        body,
        {"Content-Type": content_type, "Cookie": cookie},
    )
    assert status == 200 and preview["quantity"]["value"] == 15
    status, _, version_two = request(
        f"/api/v1/work-sessions/{session_id}/quantity-changes/confirm",
        json.dumps({"expected_version": 1, "quantity": preview["quantity"]}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-quantity-{uuid.uuid4().hex}"},
    )
    assert status == 201 and version_two["current_version"] == 2
    status, _, latest = request(f"/api/v1/worker-links/{worker_token}/assignment")
    assert status == 200 and latest["version"] == 2 and latest["context"]["quantity"]["value"] == 15, latest

    # A separate CO_PRESENT draft must produce an owner-only latest briefing,
    # not an anonymous worker link.
    body, content_type = multipart_audio(fixture_dir / "03-deictic-location.wav", {"language_hint": "ko"})
    status, _, co_present_draft = request(
        "/api/v1/work-sessions/drafts/from-audio",
        body,
        {"Content-Type": content_type, "Cookie": cookie, "Idempotency-Key": f"live-co-draft-{uuid.uuid4().hex}"},
    )
    assert status == 200, co_present_draft
    status, _, co_present = request(
        f"/api/v1/work-sessions/drafts/{co_present_draft['draft_id']}/confirm",
        json.dumps({"expected_version": 0, "decision": "PUBLISH_AS_IS", "ambiguity_override": True, "override_reason": "IN_PERSON_BRIEFING"}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-co-confirm-{uuid.uuid4().hex}"},
    )
    assert status == 201 and not co_present["issued_worker_links"], co_present
    co_session_id = co_present["work_session"]["session_id"]
    for language_code in ("vi", "ne"):
        status, _, briefing = request(
            f"/api/v1/brief?session_id={co_session_id}&language_code={language_code}",
            headers={"Cookie": cookie},
        )
        assert status == 200 and briefing["version"] == 1 and briefing["language_code"] == language_code, briefing

    # A joined anonymous team browser sees only its assigned session's latest
    # published version; this verifies the QR/team delivery path end to end.
    status, _, team = request(
        "/api/v1/work-teams/today",
        headers={"Cookie": cookie, "Idempotency-Key": f"live-team-{uuid.uuid4().hex}"},
        method="POST",
    )
    assert status in {200, 201} and team["join_url"], team
    original_team_url = team["join_url"]
    status, _, repeated_team = request(
        "/api/v1/work-teams/today",
        headers={"Cookie": cookie, "Idempotency-Key": f"live-team-repeat-{uuid.uuid4().hex}"},
        method="POST",
    )
    assert status == 200 and repeated_team["team_id"] == team["team_id"], repeated_team
    assert repeated_team["join_url"] == original_team_url, repeated_team
    status, _, stored_team = request("/api/v1/work-teams/today", headers={"Cookie": cookie})
    assert status == 200 and stored_team["team_id"] == team["team_id"], stored_team
    assert stored_team["join_url"] == original_team_url, stored_team
    old_team_token = original_team_url.rsplit("/", 1)[-1]
    rotate_key = f"live-team-rotate-{uuid.uuid4().hex}"
    status, _, rotated_team = request(
        "/api/v1/work-teams/today/invite/rotate",
        headers={"Cookie": cookie, "Idempotency-Key": rotate_key},
        method="POST",
    )
    assert status == 200 and rotated_team["team_id"] == team["team_id"], rotated_team
    assert rotated_team["join_url"] != original_team_url, rotated_team
    status, _, repeated_rotation = request(
        "/api/v1/work-teams/today/invite/rotate",
        headers={"Cookie": cookie, "Idempotency-Key": rotate_key},
        method="POST",
    )
    assert status == 200 and repeated_rotation["join_url"] == rotated_team["join_url"], repeated_rotation
    old_join_status, _, old_join = request(
        f"/api/v1/work-team-invites/{old_team_token}/join",
        json.dumps({"display_name": "old-token", "language_code": "vi"}).encode(),
        {"Content-Type": "application/json", "Idempotency-Key": f"live-old-team-join-{uuid.uuid4().hex}"},
    )
    assert old_join_status == 404 and old_join["code"] == "ACCESS_DENIED", old_join
    team_token = rotated_team["join_url"].rsplit("/", 1)[-1]
    assert request(f"/api/v1/work-team-invites/{'x' * 32}/join", json.dumps({"display_name": "invalid", "language_code": "vi"}).encode(), {"Content-Type": "application/json", "Idempotency-Key": f"live-invalid-join-{uuid.uuid4().hex}"})[0] == 404
    status, headers, member = request(
        f"/api/v1/work-team-invites/{team_token}/join",
        json.dumps({"display_name": "live-e2e", "language_code": "vi"}).encode(),
        {"Content-Type": "application/json", "Idempotency-Key": f"live-team-join-{uuid.uuid4().hex}"},
    )
    assert status == 201, member
    member_cookie = next(value for name, value in headers.items() if name.lower() == "set-cookie").split(";", 1)[0]
    status, _, empty_assignments = request("/api/v1/work-team-members/me/assignments", headers={"Cookie": member_cookie})
    assert status == 200 and empty_assignments["assignments"] == [], empty_assignments
    status, _, assignment = request(
        f"/api/v1/work-teams/today/members/{member['member_id']}/assignments",
        json.dumps({"work_session_id": session_id}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-team-assign-{uuid.uuid4().hex}"},
    )
    assert status == 201 and assignment["work_session_id"] == session_id, assignment
    status, _, assignments = request("/api/v1/work-team-members/me/assignments", headers={"Cookie": member_cookie})
    assert status == 200 and len(assignments["assignments"]) == 1, assignments
    team_assignment = assignments["assignments"][0]
    assert team_assignment["session_id"] == session_id and team_assignment["version"] == 2, team_assignment
    subprocess.run(
        ["node", str(project_root / "scripts" / "check-live-browser-sessions.mjs")],
        cwd=project_root,
        check=True,
    )
    print(json.dumps({"live_e2e": "PASS", "session_id": session_id}))


if __name__ == "__main__":
    main()
