import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.ai import bridge_call, provider_ready
from app.p0_runtime import BridgeError


class NodeOnlyAiTests(unittest.TestCase):
    def test_fastapi_ai_boundary_forwards_only_to_node_bridge(self):
        with patch("app.ai.NodeBridge.call", new=AsyncMock(return_value={"transcript": "양파 20망"})) as call:
            result = asyncio.run(bridge_call("TRANSCRIBE_AUDIO", {"audio_base64": "YQ==", "content_type": "audio/wav"}))

        self.assertEqual(result, {"transcript": "양파 20망"})
        self.assertEqual(call.call_args.args[0], "TRANSCRIBE_AUDIO")

    def test_fastapi_ai_boundary_redacts_bridge_failures(self):
        with patch("app.ai.NodeBridge.call", new=AsyncMock(side_effect=BridgeError())):
            with self.assertRaisesRegex(Exception, "Node AI runtime unavailable"):
                asyncio.run(bridge_call("PARSE_QUANTITY_CHANGE", {"transcript": "15망", "expected_version": 1}))

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
