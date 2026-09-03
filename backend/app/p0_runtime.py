"""Private Node bridge and signed P0 owner-cookie primitives."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import subprocess
import time
from dataclasses import dataclass
from typing import Any


IDENTITY_KEYS = {
    "display_name",
    "member_id",
    "worker_id",
    "worker",
    "nickname",
    "phone",
    "team_id",
    "owner_id",
    "farm_id",
}


class BridgeError(Exception):
    def __init__(self, code: str = "PROVIDER_UNAVAILABLE") -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class OwnerIdentity:
    owner_id: str
    farm_id: str
    expires_at: int


def _encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def sign_owner_cookie(identity: OwnerIdentity, secret: str) -> str:
    payload = json.dumps(identity.__dict__, separators=(",", ":"), sort_keys=True).encode()
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).digest()
    return f"{_encoded(payload)}.{_encoded(signature)}"


def verify_owner_cookie(value: str | None, secret: str) -> OwnerIdentity | None:
    if not value or not secret or "." not in value:
        return None
    encoded, encoded_signature = value.split(".", 1)
    try:
        payload = base64.urlsafe_b64decode(encoded + "===")
        signature = base64.urlsafe_b64decode(encoded_signature + "===")
        decoded = json.loads(payload)
        identity = OwnerIdentity(
            owner_id=str(decoded["owner_id"]), farm_id=str(decoded["farm_id"]), expires_at=int(decoded["expires_at"])
        )
    except (KeyError, TypeError, ValueError, base64.binascii.Error, json.JSONDecodeError):
        return None
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).digest()
    if not identity.owner_id or not identity.farm_id or identity.expires_at <= int(time.time()):
        return None
    return identity if hmac.compare_digest(signature, expected) else None


def _contains_identity(value: Any) -> bool:
    if isinstance(value, dict):
        return any(str(key).lower() in IDENTITY_KEYS or _contains_identity(item) for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_identity(item) for item in value)
    return False


class NodeBridge:
    def __init__(self, node_binary: str, bridge_path: str, timeout_seconds: float = 60) -> None:
        self.node_binary = node_binary
        self.bridge_path = bridge_path
        self.timeout_seconds = timeout_seconds

    async def call(self, operation: str, payload: dict[str, Any]) -> dict[str, Any]:
        if _contains_identity(payload):
            raise BridgeError("BRIDGE_INPUT_INVALID")
        request = json.dumps({"operation": operation, "payload": payload}, separators=(",", ":"), ensure_ascii=False).encode() + b"\n"
        try:
            process = await asyncio.to_thread(
                subprocess.run,
                [self.node_binary, self.bridge_path],
                input=request,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=self.timeout_seconds,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise BridgeError() from exc
        if process.returncode != 0:
            raise BridgeError()
        try:
            records = [json.loads(line) for line in process.stdout.splitlines() if line.strip()]
        except json.JSONDecodeError as exc:
            raise BridgeError("BRIDGE_OUTPUT_INVALID") from exc
        if len(records) != 1 or not isinstance(records[0], dict):
            raise BridgeError("BRIDGE_OUTPUT_INVALID")
        record = records[0]
        if record.get("ok") is not True or not isinstance(record.get("result"), dict):
            error = record.get("error")
            code = error.get("code") if isinstance(error, dict) else None
            raise BridgeError(code if isinstance(code, str) and code else "BRIDGE_OPERATION_FAILED")
        return record["result"]
