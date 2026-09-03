"""Run the paid live P0 smoke flow against a locally running backend."""

from __future__ import annotations

import json
import os
import pathlib
import urllib.error
import urllib.request
import uuid

BASE_URL = os.getenv("LIVE_API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
ORIGIN = os.getenv("LIVE_FRONTEND_ORIGIN", "http://127.0.0.1:5173")


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
    owner_pin = os.getenv("LIVE_DEMO_OWNER_PIN")
    if not owner_pin:
        raise RuntimeError("LIVE_DEMO_OWNER_PIN for an already seeded demo owner is required")
    status, headers, _ = request(
        "/api/v1/owner/session", json.dumps({"pin": owner_pin}).encode(), {"Content-Type": "application/json"}
    )
    assert status == 201
    cookie = next(value for name, value in headers.items() if name.lower() == "set-cookie").split(";", 1)[0]
    fixture_dir = pathlib.Path(__file__).resolve().parents[1] / "evals" / "audio"

    # The warehouse-transport fixture is intentionally safety-blocked. Use the
    # low-risk deictic fixture and exercise the documented owner override.
    body, content_type = multipart_audio(fixture_dir / "03-deictic-location.wav", {"language_hint": "ko"})
    status, _, draft = request(
        "/api/v1/work-sessions/drafts/from-audio",
        body,
        {"Content-Type": content_type, "Cookie": cookie, "Idempotency-Key": f"live-draft-{uuid.uuid4().hex}"},
    )
    assert status == 200 and draft["state"]["steps"], draft

    status, _, published = request(
        f"/api/v1/work-sessions/drafts/{draft['draft_id']}/confirm",
        json.dumps({"expected_version": 0, "decision": "PUBLISH_AS_IS", "ambiguity_override": True, "override_reason": "IN_PERSON_BRIEFING"}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-confirm-{uuid.uuid4().hex}"},
    )
    assert status == 201
    session_id = published["work_session"]["session_id"]
    status, _, issued = request(
        f"/api/v1/work-sessions/{session_id}/worker-links",
        json.dumps({"language_code": "vi"}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-link-{uuid.uuid4().hex}"},
    )
    assert status == 201 and issued["issued_worker_links"], issued
    worker_url = issued["issued_worker_links"][0]["url"]
    worker_token = worker_url.rsplit("/", 1)[-1]
    status, _, worker = request(f"/api/v1/worker-links/{worker_token}/assignment")
    assert status == 200 and "transcript" not in json.dumps(worker) and "risk_assessment" not in json.dumps(worker), worker

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
    status, _, briefing = request(
        f"/api/v1/brief?session_id={co_session_id}&language_code=ne",
        headers={"Cookie": cookie},
    )
    assert status == 200 and briefing["version"] == 1 and briefing["language_code"] == "ne", briefing

    # A joined anonymous team browser sees only its assigned session's latest
    # published version; this verifies the QR/team delivery path end to end.
    status, _, team = request(
        "/api/v1/work-teams/today",
        headers={"Cookie": cookie, "Idempotency-Key": f"live-team-{uuid.uuid4().hex}"},
        method="POST",
    )
    assert status in {200, 201} and team["join_url"], team
    team_token = team["join_url"].rsplit("/", 1)[-1]
    status, headers, member = request(
        f"/api/v1/work-team-invites/{team_token}/join",
        json.dumps({"display_name": "live-e2e", "language_code": "vi"}).encode(),
        {"Content-Type": "application/json", "Idempotency-Key": f"live-team-join-{uuid.uuid4().hex}"},
    )
    assert status == 201, member
    member_cookie = next(value for name, value in headers.items() if name.lower() == "set-cookie").split(";", 1)[0]
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
    print(json.dumps({"live_e2e": "PASS", "session_id": session_id}))


if __name__ == "__main__":
    main()
