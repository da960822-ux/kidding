import asyncio
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app.p0_runtime import (
    BridgeError,
    NodeBridge,
    OwnerIdentity,
    sign_owner_cookie,
    verify_owner_cookie,
)


class NodeBridgeTests(unittest.TestCase):
    def test_rejects_worker_identity_before_node_transport(self):
        bridge = NodeBridge("node", "ai/bridge.mjs")

        with self.assertRaises(BridgeError) as raised:
            asyncio.run(bridge.call("BUILD_WORKER_PACKAGES_V2", {"display_name": "민"}))

        self.assertEqual(raised.exception.code, "BRIDGE_INPUT_INVALID")

    def test_rejects_owner_and_farm_identity_before_node_transport(self):
        bridge = NodeBridge("node", "ai/bridge.mjs")

        with self.assertRaises(BridgeError) as raised:
            asyncio.run(bridge.call("BUILD_WORKER_PACKAGES_V2", {"owner_id": "owner-a", "farm_id": "farm-a"}))

        self.assertEqual(raised.exception.code, "BRIDGE_INPUT_INVALID")

    def test_uses_jsonl_stdio_and_returns_only_json_object(self):
        process = type("Process", (), {"stdout": b'{"ok":true,"result":{"quantity":15}}\n', "returncode": 0})()
        bridge = NodeBridge("node", "ai/bridge.mjs")

        with patch("app.p0_runtime.subprocess.run", return_value=process) as spawn:
            result = asyncio.run(bridge.call("PARSE_QUANTITY_CHANGE", {"transcript": "15망", "expected_version": 1}))

        self.assertEqual(result, {"quantity": 15})
        self.assertEqual(spawn.call_args.args[0], ["node", "ai/bridge.mjs"])
        self.assertEqual(json.loads(spawn.call_args.kwargs["input"]), {"operation": "PARSE_QUANTITY_CHANGE", "payload": {"transcript": "15망", "expected_version": 1}})

    def test_preserves_safe_bridge_failure_code(self):
        process = type("Process", (), {"stdout": b'{"ok":false,"error":{"code":"TRANSCRIBE_AUDIO_OPENAI_REQUEST_FAILED_429"}}\n', "returncode": 0})()
        bridge = NodeBridge("node", "ai/bridge.mjs")

        with patch("app.p0_runtime.subprocess.run", return_value=process):
            with self.assertRaises(BridgeError) as raised:
                asyncio.run(bridge.call("TRANSCRIBE_AUDIO", {"audio_base64": "YQ=="}))

        self.assertEqual(raised.exception.code, "TRANSCRIBE_AUDIO_OPENAI_REQUEST_FAILED_429")


class OwnerCookieTests(unittest.TestCase):
    def test_cookie_binds_owner_and_farm_and_expiry(self):
        identity = OwnerIdentity("owner-a", "farm-a", int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp()))
        cookie = sign_owner_cookie(identity, "secret")

        self.assertEqual(verify_owner_cookie(cookie, "secret"), identity)
        self.assertIsNone(verify_owner_cookie(cookie, "different-secret"))


if __name__ == "__main__":
    unittest.main()
