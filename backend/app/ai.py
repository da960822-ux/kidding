"""FastAPI's private transport-only boundary to the Node AI runtime."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

from .p0_runtime import BridgeError, NodeBridge


ROOT = Path(__file__).resolve().parents[2]


class AiProviderError(Exception):
    """A Node runtime failure safe to expose through the API envelope."""


def provider_ready() -> bool:
    node_binary = os.getenv("NODE_BINARY", "node").strip()
    if not node_binary or not (ROOT / "ai" / "bridge.mjs").is_file():
        return False
    node_path = Path(node_binary)
    return (
        node_path.is_file() and os.access(node_path, os.X_OK)
        if node_path.is_absolute()
        else shutil.which(node_binary) is not None
    )


async def bridge_call(operation: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return await NodeBridge(
            os.getenv("NODE_BINARY", "node").strip() or "node",
            str(ROOT / "ai" / "bridge.mjs"),
            float(os.getenv("AI_BRIDGE_TIMEOUT_SECONDS", "60")),
        ).call(operation, payload)
    except (BridgeError, ValueError) as exc:
        raise AiProviderError("Node AI runtime unavailable") from exc
