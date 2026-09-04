import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.ai import AiProviderError, bridge_call, provider_ready
from app.p0_runtime import BridgeError


class NodeOnlyAiTests(unittest.TestCase):
    def test_bridge_retry_uses_remaining_request_budget(self):
        from app import ai
        limits = []
        async def fake_call(_operation, _payload):
            if len(limits) == 1:
                raise BridgeError()
            return {"transcript": "양파"}
        def bridge(_binary, _path, timeout):
            limits.append(timeout)
            return SimpleNamespace(call=fake_call)
        with patch.object(ai, "request_deadline", create=True) as deadline, patch.object(ai, "NodeBridge", side_effect=bridge), patch.object(ai, "monotonic", create=True, side_effect=[100.0, 105.0]):
            deadline.get.return_value = 110.0
            result = asyncio.run(ai.bridge_call("TRANSCRIBE_AUDIO", {}))
        self.assertEqual(result, {"transcript": "양파"})
        self.assertEqual(limits, [10.0, 5.0])

    def test_expired_request_does_not_start_another_bridge(self):
        from app import ai
        with patch.object(ai, "request_deadline", create=True) as deadline, patch.object(ai, "NodeBridge") as bridge, patch.object(ai, "monotonic", create=True, return_value=111.0):
            deadline.get.return_value = 110.0
            bridge.return_value.call = AsyncMock(return_value={})
            with self.assertRaises(AiProviderError):
                asyncio.run(ai.bridge_call("PARSE_QUANTITY_CHANGE", {}))
        bridge.assert_not_called()

    def test_ready_rejects_a_missing_openai_key(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY": ""}, clear=False):
            self.assertFalse(provider_ready())

    def test_fastapi_ai_boundary_forwards_only_to_node_bridge(self):
        with patch("app.ai.NodeBridge.call", new=AsyncMock(return_value={"transcript": "양파 20망"})) as call:
            result = asyncio.run(bridge_call("TRANSCRIBE_AUDIO", {"audio_base64": "YQ==", "content_type": "audio/wav"}))

        self.assertEqual(result, {"transcript": "양파 20망"})
        self.assertEqual(call.call_args.args[0], "TRANSCRIBE_AUDIO")

    def test_fastapi_ai_boundary_retries_one_transient_failure(self):
        with patch("app.ai.NodeBridge.call", new=AsyncMock(side_effect=[BridgeError(), {"transcript": "양파 20망"}])) as call:
            result = asyncio.run(bridge_call("TRANSCRIBE_AUDIO", {"audio_base64": "YQ==", "content_type": "audio/wav"}))

        self.assertEqual(result, {"transcript": "양파 20망"})
        self.assertEqual(call.await_count, 2)

    def test_fastapi_ai_boundary_redacts_bridge_failures(self):
        with patch("app.ai.NodeBridge.call", new=AsyncMock(side_effect=BridgeError())):
            with self.assertRaisesRegex(Exception, "Node AI runtime unavailable"):
                asyncio.run(bridge_call("PARSE_QUANTITY_CHANGE", {"transcript": "15망", "expected_version": 1}))

    def test_unclear_audio_is_preserved_without_retry(self):
        with patch("app.ai.NodeBridge.call", new=AsyncMock(side_effect=BridgeError("AUDIO_UNCLEAR"))) as call:
            with self.assertRaises(AiProviderError) as raised:
                asyncio.run(bridge_call("TRANSCRIBE_AUDIO", {"audio_base64": "YQ==", "content_type": "audio/wav"}))

        self.assertEqual(raised.exception.code, "AUDIO_UNCLEAR")
        self.assertEqual(call.await_count, 1)

    def test_ready_rejects_a_missing_node_binary(self):
        with patch.dict("os.environ", {"NODE_BINARY": "missing-node"}, clear=False), patch(
            "app.ai.shutil.which", return_value=None
        ):
            self.assertFalse(provider_ready())

    def test_ready_rejects_a_non_executable_absolute_node_binary(self):
        with (
            patch.dict("os.environ", {"NODE_BINARY": r"C:\private\not-executable-node.exe"}, clear=False),
            patch("app.ai.Path.is_file", return_value=True),
            patch("app.ai.os.access", return_value=False),
        ):
            self.assertFalse(provider_ready())


if __name__ == "__main__":
    unittest.main()
