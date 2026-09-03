"""Run the paid live P0 smoke flow against a locally running backend."""

from __future__ import annotations

import json
import pathlib
import urllib.error
import urllib.request
import uuid

from app.main import settings


BASE_URL = "http://127.0.0.1:8000"
ORIGIN = "http://127.0.0.1:5173"


def request(path: str, body: bytes | None = None, headers: dict[str, str] | None = None):
    request_headers = {"Origin": ORIGIN, "X-CSRF-Token": "batmeori-demo"}
    request_headers.update(headers or {})
    response_request = urllib.request.Request(
        f"{BASE_URL}{path}", data=body, headers=request_headers, method="POST" if body is not None else "GET"
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
    if not settings.owner_pin:
        raise RuntimeError("OWNER_PIN is required")
    status, headers, _ = request(
        "/api/v1/owner/session", json.dumps({"pin": settings.owner_pin}).encode(), {"Content-Type": "application/json"}
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
    assert status == 200 and draft["state"]["steps"] and all(step["translations"] for step in draft["state"]["steps"]), draft

    status, _, published = request(
        f"/api/v1/work-sessions/drafts/{draft['draft_id']}/confirm",
        json.dumps({"expected_version": 0, "decision": "PUBLISH_AS_IS", "delivery_mode": "REMOTE", "language_code": "vi", "ambiguity_override": True, "override_reason": "IN_PERSON_BRIEFING"}).encode(),
        {"Content-Type": "application/json", "Cookie": cookie, "Idempotency-Key": f"live-confirm-{uuid.uuid4().hex}"},
    )
    assert status == 201
    session_id = published["work_session"]["session_id"]
    worker_url = published["issued_worker_links"][0]["url"]
    with urllib.request.urlopen(worker_url, timeout=30) as response:
        worker = json.loads(response.read())
    assert "transcript" not in json.dumps(worker) and "risk_assessment" not in worker["state"]

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
    with urllib.request.urlopen(worker_url, timeout=30) as response:
        latest = json.loads(response.read())
    assert latest["version"] == 2 and latest["state"]["quantity"]["value"] == 15
    print(json.dumps({"live_e2e": "PASS", "session_id": session_id}))


if __name__ == "__main__":
    main()
