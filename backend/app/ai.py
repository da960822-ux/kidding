"""Small server-only adapters for the provider-neutral AI contracts."""

from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
import os
import re
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


OPENAI_API_URL = "https://api.openai.com/v1"
ROOT = Path(__file__).resolve().parents[2]
PROMPT_DIR = ROOT / "ai" / "prompts"
SCHEMA_DIR = ROOT / "docs" / "schemas"
LOGGER = logging.getLogger(__name__)


class AiProviderError(Exception):
    """A provider failure safe to return through the API error envelope."""


def _setting(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def provider_ready() -> bool:
    return bool(
        _setting("OPENAI_API_KEY")
        and _setting("OPENAI_MODEL")
        and _setting("OPENAI_STT_MODEL")
        and _setting("OPENAI_TTS_MODEL")
    )


def _timeout_seconds() -> float:
    try:
        return min(float(_setting("OPENAI_TIMEOUT_SECONDS", "55")), 55.0)
    except ValueError:
        return 55.0


def _openai_request(path: str, body: bytes, content_type: str) -> dict[str, Any]:
    api_key = _setting("OPENAI_API_KEY")
    if not api_key:
        raise AiProviderError("OpenAI is not configured")
    request = urllib.request.Request(
        f"{OPENAI_API_URL}{path}",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": content_type,
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=_timeout_seconds()) as response:
            payload = response.read()
    except urllib.error.HTTPError as exc:
        try:
            error_body = json.loads(exc.read())
            error = error_body.get("error", {}) if isinstance(error_body, dict) else {}
            LOGGER.warning(
                "OpenAI request rejected path=%s status=%s type=%s code=%s message=%s",
                path,
                exc.code,
                error.get("type"),
                error.get("code"),
                str(error.get("message", ""))[:300],
            )
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            LOGGER.warning("OpenAI request rejected path=%s status=%s", path, exc.code)
        raise AiProviderError("OpenAI request failed") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise AiProviderError("OpenAI request failed") from exc
    try:
        parsed = json.loads(payload)
    except (TypeError, json.JSONDecodeError) as exc:
        raise AiProviderError("OpenAI returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise AiProviderError("OpenAI returned invalid JSON")
    return parsed


def _multipart(fields: dict[str, str], file_bytes: bytes, filename: str, content_type: str) -> tuple[bytes, str]:
    boundary = f"----batmeori-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            (
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            )
        )
    safe_filename = re.sub(r"[^A-Za-z0-9._-]", "_", filename) or "audio.webm"
    chunks.extend(
        (
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="file"; filename="{safe_filename}"\r\n'.encode(),
            f"Content-Type: {content_type}\r\n\r\n".encode(),
            file_bytes,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        )
    )
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _filename(filename: str | None, content_type: str) -> str:
    if filename and "." in filename:
        return filename
    extension = mimetypes.guess_extension(content_type) or ".webm"
    return f"audio{extension}"


def _transcribe_audio(audio: bytes, filename: str | None, content_type: str, language_hint: str = "ko") -> str:
    model = _setting("OPENAI_STT_MODEL")
    if not provider_ready() or not model:
        raise AiProviderError("OpenAI is not configured")
    body, multipart_type = _multipart(
        {"model": model, "language": language_hint, "response_format": "json"},
        audio,
        _filename(filename, content_type),
        content_type,
    )
    response = _openai_request("/audio/transcriptions", body, multipart_type)
    text = response.get("text")
    if not isinstance(text, str) or not text.strip():
        raise AiProviderError("OpenAI returned an empty transcript")
    return text.strip()


async def transcribe_audio(audio: bytes, filename: str | None, content_type: str, language_hint: str = "ko") -> str:
    return await asyncio.to_thread(_transcribe_audio, audio, filename, content_type, language_hint)


def _schema(name: str) -> dict[str, Any]:
    try:
        value = json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise AiProviderError("AI contract is unavailable") from exc
    if not isinstance(value, dict):
        raise AiProviderError("AI contract is unavailable")
    return value


def _provider_schema(value: Any) -> Any:
    """Keep canonical validation in BE while omitting unsupported provider combinators."""
    if isinstance(value, list):
        return [_provider_schema(item) for item in value]
    if not isinstance(value, dict):
        return value
    provider_value: dict[str, Any] = {}
    for key, item in value.items():
        if key in {"allOf", "if", "then", "else", "not", "contains", "minContains", "maxContains", "format"}:
            continue
        # A root oneOf alongside properties is a semantic constraint. BE validates
        # it canonically; the provider only needs the object shape.
        if key == "oneOf" and ("type" in value or "properties" in value):
            continue
        provider_value["anyOf" if key == "oneOf" else key] = _provider_schema(item)
    if "type" not in provider_value:
        if "properties" in provider_value:
            provider_value["type"] = "object"
        elif "const" in provider_value:
            constant = provider_value["const"]
            provider_value["type"] = (
                "boolean" if isinstance(constant, bool) else "integer" if isinstance(constant, int) else
                "number" if isinstance(constant, float) else "string" if isinstance(constant, str) else "null"
            )
        elif isinstance(provider_value.get("enum"), list) and provider_value["enum"]:
            values = provider_value["enum"]
            kinds = {
                "boolean" if isinstance(item, bool) else "integer" if isinstance(item, int) else
                "number" if isinstance(item, float) else "string" if isinstance(item, str) else "null"
                for item in values
            }
            provider_value["type"] = next(iter(kinds)) if len(kinds) == 1 else sorted(kinds)
    return provider_value


def _prompt(name: str) -> str:
    try:
        return (PROMPT_DIR / name).read_text(encoding="utf-8")
    except OSError as exc:
        raise AiProviderError("AI prompt is unavailable") from exc


def _output_text(response: dict[str, Any]) -> str:
    text = response.get("output_text")
    if isinstance(text, str):
        return text
    for output in response.get("output", []):
        if not isinstance(output, dict):
            continue
        for content in output.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise AiProviderError("OpenAI returned no structured output")


def _structured_output(prompt_name: str, schema_name: str, schema_key: str, input_text: str) -> dict[str, Any]:
    model = _setting("OPENAI_MODEL")
    if not provider_ready() or not model:
        raise AiProviderError("OpenAI is not configured")
    payload = {
        "model": model,
        "instructions": _prompt(prompt_name),
        "input": input_text,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_key,
                "strict": True,
                "schema": _provider_schema(_schema(schema_name)),
            }
        },
    }
    response = _openai_request("/responses", json.dumps(payload).encode(), "application/json")
    try:
        parsed = json.loads(_output_text(response))
    except json.JSONDecodeError as exc:
        raise AiProviderError("OpenAI returned invalid structured output") from exc
    if not isinstance(parsed, dict):
        raise AiProviderError("OpenAI returned invalid structured output")
    return parsed


async def structure_transcript(transcript: str) -> dict[str, Any]:
    input_text = f"<owner_transcript>\n{transcript}\n</owner_transcript>"
    return await asyncio.to_thread(
        _structured_output,
        "prompt-structure-001.md",
        "structure-v1.schema.json",
        "structure_v1",
        input_text,
    )


async def merge_structure_transcript(existing_draft: dict[str, Any], transcript: str) -> dict[str, Any]:
    input_text = (
        "<existing_draft_json>\n"
        f"{json.dumps(existing_draft, ensure_ascii=False)}\n"
        "</existing_draft_json>\n"
        "<owner_supplement_transcript>\n"
        f"{transcript}\n"
        "</owner_supplement_transcript>"
    )
    return await asyncio.to_thread(
        _structured_output,
        "prompt-structure-001.md",
        "structure-v1.schema.json",
        "structure_v1",
        input_text,
    )


async def quantity_change_transcript(transcript: str, expected_version: int) -> dict[str, Any]:
    input_text = (
        f"<expected_version>{expected_version}</expected_version>\n"
        "<owner_transcript>\n"
        f"{transcript}\n"
        "</owner_transcript>"
    )
    return await asyncio.to_thread(
        _structured_output,
        "prompt-quantity-change-001.md",
        "quantity-change-v1.schema.json",
        "quantity_change_v1",
        input_text,
    )


async def translate_segment(segment: str, korean_text: str, language_code: str) -> dict[str, Any]:
    input_text = (
        f"<segment>{segment}</segment>\n"
        f"<language_code>{language_code}</language_code>\n"
        "<korean_text>\n"
        f"{korean_text}\n"
        "</korean_text>"
    )
    return await asyncio.to_thread(
        _structured_output,
        "prompt-translation-001.md",
        "translation-v1.schema.json",
        "translation_v1",
        input_text,
    )
