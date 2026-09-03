from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import struct
import time
import urllib.error
import urllib.request
import uuid
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import Cookie, FastAPI, File, Form, Header, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from supabase import Client, create_client

from .ai import (
    AiProviderError,
    merge_structure_transcript as ai_merge_structure_transcript,
    provider_ready,
    quantity_change_transcript as ai_quantity_change_transcript,
    structure_transcript as ai_structure_transcript,
    transcribe_audio as ai_transcribe_audio,
    translate_segment as ai_translate_segment,
)


TASK_CODES_BY_FAMILY = {
    "ONION": {"ONION_HARVEST", "ONION_TRIMMING", "ONION_SORTING", "ONION_TRANSPORT"},
    "STRAWBERRY": {"STRAWBERRY_HARVEST", "STRAWBERRY_SORTING", "STRAWBERRY_INSPECTION", "STRAWBERRY_PACKING"},
}
TASK_CODES = set().union(*TASK_CODES_BY_FAMILY.values())
LANGUAGES = {"vi", "ne"}
OVERRIDE_REASONS = {
    "EXPERIENCED_WORKER",
    "IN_PERSON_BRIEFING",
    "OWNER_ACCEPTED_OTHER",
}
COOKIE_NAME = "batmeori_owner_session"
TEAM_MEMBER_COOKIE_NAME = "batmeori_team_member"
MAX_AUDIO_BYTES = 10 * 1024 * 1024
CSRF_TOKEN = "batmeori-demo"
PIN_FAILURE_WINDOW_SECONDS = 300
PIN_FAILURE_LIMIT = 5
AI_REQUEST_WINDOW_SECONDS = 60
AI_REQUEST_LIMIT = 12
TEAM_JOIN_REQUEST_LIMIT = 12

# ponytail: process-local rate limit; use a shared limiter before multi-worker deployment.
pin_failures: dict[str, list[float]] = {}
ai_requests: dict[str, list[float]] = {}
team_join_requests: dict[str, list[float]] = {}


def load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()


class Settings:
    def __init__(self) -> None:
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_secret_key = os.getenv("SUPABASE_SECRET_KEY", "")
        self.owner_pin = os.getenv("OWNER_PIN", "")
        self.owner_session_secret = os.getenv("OWNER_SESSION_SECRET", "")
        self.owner_session_ttl_seconds = int(os.getenv("OWNER_SESSION_TTL_SECONDS", "7200"))
        self.frontend_origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        self.public_api_base_url = os.getenv("PUBLIC_API_BASE_URL", "http://127.0.0.1:8000")
        self.demo_fallback = os.getenv("DEMO_FALLBACK", "0").lower() in {"1", "true", "yes"}
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_model = os.getenv("OPENAI_MODEL", "")
        self.openai_stt_model = os.getenv("OPENAI_STT_MODEL", "")
        self.openai_tts_model = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
        self.openai_tts_voice = os.getenv("OPENAI_TTS_VOICE", "alloy")
        self.openai_timeout_seconds = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "20"))

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.frontend_origins.split(",") if item.strip()]

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_secret_key)

    @property
    def auth_configured(self) -> bool:
        return bool(self.owner_pin and self.owner_session_secret)


settings = Settings()
app = FastAPI(
    title="Batmeori API",
    version="1.1.0",
    description="Provider-neutral P0 REST service for onion work instructions.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Idempotency-Key", "X-CSRF-Token"],
)


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: dict[str, Any] | None = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    body: dict[str, Any] = {"code": exc.code, "message": exc.message}
    if exc.details:
        body["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(AiProviderError)
async def ai_provider_error_handler(_: Request, __: AiProviderError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"code": "PROVIDER_UNAVAILABLE", "message": "AI 제공자가 준비되지 않았습니다."},
    )


@app.exception_handler(RequestValidationError)
async def request_validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "code": "SCHEMA_INVALID",
            "message": "입력 형식이 올바르지 않습니다.",
            "details": {"errors": exc.errors()},
        },
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    return response


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Quantity(StrictModel):
    value: int = Field(ge=1)
    unit: str = Field(min_length=1)


class Location(StrictModel):
    raw_text: str | None = None
    kind: str = "UNSPECIFIED"
    canonical_name: str | None = None

    @field_validator("kind")
    @classmethod
    def valid_kind(cls, value: str) -> str:
        if value not in {"DEICTIC", "NAMED", "UNSPECIFIED"}:
            raise ValueError("invalid location kind")
        return value


class Ambiguity(StrictModel):
    field: str = Field(min_length=1)
    message: str = Field(min_length=1)
    blocking: bool
    kind: str

    @field_validator("kind")
    @classmethod
    def valid_kind(cls, value: str) -> str:
        if value not in {"SAFETY", "TASK", "LOCATION", "QUANTITY", "TIME", "OTHER"}:
            raise ValueError("invalid ambiguity kind")
        return value


class RiskAssessment(StrictModel):
    level: str
    reasons: list[str] = Field(default_factory=list)
    schema_version: str = "1"
    contract_version: str = "safety-policy-v1"

    @field_validator("level")
    @classmethod
    def valid_level(cls, value: str) -> str:
        if value not in {"LOW", "HIGH", "UNKNOWN"}:
            raise ValueError("invalid risk level")
        return value

    @field_validator("reasons")
    @classmethod
    def valid_reasons(cls, value: list[str]) -> list[str]:
        allowed = {
            "VEHICLE_OPERATION",
            "ROTATING_BLADE",
            "PESTICIDE_OR_CHEMICAL",
            "WORK_AT_HEIGHT",
            "POWERED_MACHINERY",
            "INSUFFICIENT_CONTEXT",
            "OTHER_HIGH_RISK",
        }
        if len(value) != len(set(value)) or any(item not in allowed for item in value):
            raise ValueError("invalid risk reason")
        return value


class SegmentTranslation(StrictModel):
    segment: str
    language_code: str
    text: str = Field(min_length=1)
    source: str
    verified: bool
    guide_lookup: str
    phrase_key: str | None = None
    source_page: int | None = None
    source_url: str | None = None
    license: str | None = None

    @field_validator("segment")
    @classmethod
    def valid_segment(cls, value: str) -> str:
        if value not in {"ACTION", "QUANTITY", "ORDER", "SAFETY", "LOCATION", "OTHER"}:
            raise ValueError("invalid segment")
        return value


class VideoAsset(StrictModel):
    asset_id: str
    task_code: str
    video_url: str
    provenance: str
    review_status: str
    safety_level: str
    captions_text: str


class Step(StrictModel):
    sequence: int = Field(ge=1)
    task_code: str | None
    title_ko: str = Field(min_length=1)
    description_ko: str = Field(min_length=1)
    video: VideoAsset | None = None
    audio_url: str | None = None
    delivery_mode: str = "TEXT"
    unsupported_reason: str | None = None
    translations: list[SegmentTranslation] = Field(default_factory=list)


class WorkState(StrictModel):
    task_family: Literal["ONION", "STRAWBERRY"]
    location: Location
    location_display: str
    quantity: Quantity | str | None = None
    deadline: str | None = None
    safety: list[str] = Field(default_factory=list)
    notes: str | None = None
    steps: list[Step] = Field(default_factory=list)
    risk_assessment: RiskAssessment


class WorkerState(StrictModel):
    task_family: Literal["ONION", "STRAWBERRY"]
    location: Location
    location_display: str
    quantity: Quantity | str | None = None
    deadline: str | None = None
    safety: list[str] = Field(default_factory=list)
    notes: str | None = None
    steps: list[Step] = Field(default_factory=list)


class PinLoginRequest(StrictModel):
    pin: str = Field(min_length=4, max_length=32)


class OwnerSession(StrictModel):
    authenticated: bool = True
    expires_at: datetime


class WorkDraft(StrictModel):
    draft_id: str
    draft_revision: int
    summary_ko: str
    interpretation: str
    state: WorkState
    ambiguities: list[Ambiguity]
    transcript: str
    schema_version: str = "1"
    contract_version: str = "structure-v1"


class DraftConfirmRequest(StrictModel):
    expected_version: int = Field(ge=0, le=0)
    decision: str
    delivery_mode: str
    language_code: str
    ambiguity_override: bool = False
    override_reason: str | None = None

    @field_validator("decision")
    @classmethod
    def valid_decision(cls, value: str) -> str:
        if value not in {"CONFIRM", "PUBLISH_AS_IS"}:
            raise ValueError("invalid decision")
        return value

    @field_validator("delivery_mode")
    @classmethod
    def valid_delivery_mode(cls, value: str) -> str:
        if value not in {"CO_PRESENT", "REMOTE"}:
            raise ValueError("invalid delivery mode")
        return value

    @field_validator("language_code")
    @classmethod
    def valid_language(cls, value: str) -> str:
        if value not in LANGUAGES:
            raise ValueError("language_code must be vi or ne")
        return value

    @field_validator("override_reason")
    @classmethod
    def valid_reason(cls, value: str | None) -> str | None:
        if value is not None and value not in OVERRIDE_REASONS:
            raise ValueError("invalid override reason")
        return value


class QuantityChangeConfirmRequest(StrictModel):
    quantity: Quantity
    expected_version: int = Field(ge=1)


class WorkerLinkIssueRequest(StrictModel):
    language_code: str

    @field_validator("language_code")
    @classmethod
    def valid_language(cls, value: str) -> str:
        if value not in LANGUAGES:
            raise ValueError("language_code must be vi or ne")
        return value


class WorkerLinkMeta(StrictModel):
    language_code: str
    expires_at: datetime
    revoked_at: datetime | None


class IssuedWorkerLink(StrictModel):
    language_code: str
    url: str
    expires_at: datetime


class WorkVersion(StrictModel):
    version: int
    lifecycle: str
    state: WorkState
    ambiguity_override: bool = False
    override_reason: str | None = None
    overridden_at: datetime | None = None
    transcript: str | None = None


class OwnerWorkSession(StrictModel):
    session_id: str
    current_version: int
    lifecycle: str = "PUBLISHED"
    version: WorkVersion
    worker_link_meta: list[WorkerLinkMeta] = Field(default_factory=list)


class InitialPublishResponse(StrictModel):
    work_session: OwnerWorkSession
    issued_worker_links: list[IssuedWorkerLink]


class WorkerLinkIssueResponse(StrictModel):
    session_id: str
    issued_worker_links: list[IssuedWorkerLink]


class WorkerAssignment(StrictModel):
    language_code: str
    session_id: str
    version: int
    lifecycle: str = "PUBLISHED"
    state: WorkerState
    badges: list[str]
    source_detail: list[SegmentTranslation] = Field(default_factory=list)


class TeamMember(StrictModel):
    member_id: str
    display_name: str = Field(min_length=1, max_length=30)
    language_code: str
    joined_at: datetime
    assignment_session_ids: list[str] = Field(default_factory=list)

    @field_validator("language_code")
    @classmethod
    def valid_language(cls, value: str) -> str:
        if value not in LANGUAGES:
            raise ValueError("language_code must be vi or ne")
        return value


class TodayWorkTeam(StrictModel):
    team_id: str
    work_date: str
    status: str = "ACTIVE"
    join_url: str | None = None
    expires_at: datetime
    members: list[TeamMember] = Field(default_factory=list)


class JoinTeamRequest(StrictModel):
    display_name: str = Field(min_length=1, max_length=30)
    language_code: str

    @field_validator("display_name")
    @classmethod
    def normalized_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("display_name is required")
        return normalized

    @field_validator("language_code")
    @classmethod
    def valid_language(cls, value: str) -> str:
        if value not in LANGUAGES:
            raise ValueError("language_code must be vi or ne")
        return value


class TeamAssignmentRequest(StrictModel):
    work_session_id: str = Field(min_length=1)


class TeamAssignmentMeta(StrictModel):
    member_id: str
    work_session_id: str
    assigned_at: datetime


class TeamAssignmentsResponse(StrictModel):
    assignments: list[WorkerAssignment] = Field(default_factory=list)


class Briefing(StrictModel):
    session_id: str
    version: int
    language_code: str
    steps: list[Step] = Field(min_length=1)
    demo_badge: str | None = None


class QuantityChangeParseResult(StrictModel):
    interpretation: str
    quantity: Quantity | None
    expected_version: int = Field(ge=1)
    ambiguities: list[Ambiguity]
    schema_version: str = "1"
    contract_version: str = "quantity-change-v1"


class StructureStepOutput(StrictModel):
    sequence: int = Field(ge=1)
    task_code: str | None
    title_ko: str = Field(min_length=1)
    description_ko: str = Field(min_length=1)
    unsupported_reason: str | None

    @model_validator(mode="after")
    def validate_task_shape(self) -> "StructureStepOutput":
        if self.task_code is None and not self.unsupported_reason:
            raise ValueError("unsupported task requires unsupported_reason")
        if self.task_code is not None and self.unsupported_reason is not None:
            raise ValueError("supported task cannot have unsupported_reason")
        return self


class StructureOutput(StrictModel):
    interpretation: Literal["READY", "AMBIGUOUS", "UNSUPPORTED"]
    summary_ko: str = Field(min_length=1)
    location: Location
    task_family: Literal["ONION", "STRAWBERRY"]
    quantity: Quantity | Literal["UNSPECIFIED"] | None
    deadline: str | None
    safety: list[str]
    notes: str | None
    steps: list[StructureStepOutput]
    ambiguities: list[Ambiguity]
    schema_version: Literal["1"]
    contract_version: Literal["structure-v1"]

    @model_validator(mode="after")
    def validate_contract(self) -> "StructureOutput":
        if self.interpretation == "READY" and not self.steps:
            raise ValueError("READY requires steps")
        if self.interpretation == "AMBIGUOUS" and not self.ambiguities:
            raise ValueError("AMBIGUOUS requires ambiguities")
        if not self.steps and not any(item.blocking and item.kind == "TASK" for item in self.ambiguities):
            raise ValueError("empty steps require blocking task ambiguity")
        return self


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def utc_datetime(value: datetime | str) -> datetime:
    return value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))


def jsonable(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    return value


def db_client() -> Client:
    if not settings.supabase_configured:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "잠시 후 다시 시도하세요.")
    client = getattr(app.state, "supabase", None)
    if client is None:
        client = create_client(settings.supabase_url, settings.supabase_secret_key)
        app.state.supabase = client
    return client


def row_data(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if data is None:
        return []
    if isinstance(data, list):
        return data
    return [data]


def one_row(result: Any, not_found_code: str = "NOT_FOUND") -> dict[str, Any]:
    rows = row_data(result)
    if not rows:
        raise ApiError(404, not_found_code, "찾을 수 없습니다.")
    return rows[0]


def parse_state(raw: Any) -> WorkState:
    if not isinstance(raw, dict):
        raise ApiError(422, "SCHEMA_INVALID", "작업 상태 형식이 올바르지 않습니다.")
    state_data = dict(raw)
    state_data.setdefault(
        "risk_assessment",
        {
            "level": "UNKNOWN",
            "reasons": ["INSUFFICIENT_CONTEXT"],
            "schema_version": "1",
            "contract_version": "safety-policy-v1",
        },
    )
    try:
        state = WorkState.model_validate(state_data)
    except ValidationError as exc:
        raise ApiError(422, "SCHEMA_INVALID", "입력 형식이 올바르지 않습니다.", {"errors": exc.errors()})
    validate_state(state, allow_unsupported=True, for_publish=False)
    return state


def validate_contract_schema(raw: Any, filename: str) -> None:
    try:
        schema = json.loads((Path(__file__).resolve().parents[2] / "docs" / "schemas" / filename).read_text(encoding="utf-8"))
        Draft202012Validator(schema).validate(raw)
    except (OSError, json.JSONDecodeError, SchemaError) as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "AI 계약을 불러올 수 없습니다.") from exc
    except Exception as exc:
        # jsonschema's ValidationError carries structured provider output details; do not persist it.
        raise ApiError(422, "SCHEMA_INVALID", "AI 결과가 계약을 충족하지 않습니다.") from exc


def deterministic_risk(transcript: str, output: StructureOutput) -> RiskAssessment:
    text = f"{transcript} {' '.join(output.safety)}".lower()
    safety_ambiguity = any(item.kind == "SAFETY" for item in output.ambiguities)
    high_rules = {
        "VEHICLE_OPERATION": ("운전", "주행", "트랙터", "지게차", "vehicle"),
        "ROTATING_BLADE": ("회전날", "톱날", "예초기", "blade"),
        "PESTICIDE_OR_CHEMICAL": ("농약", "제초제", "화학", "pesticide"),
        "WORK_AT_HEIGHT": ("고소", "사다리", "지붕", "height"),
        "POWERED_MACHINERY": ("동력", "기계", "machinery"),
    }
    reasons = [reason for reason, terms in high_rules.items() if any(term in text for term in terms)]
    if reasons:
        return RiskAssessment(level="HIGH", reasons=reasons)
    if safety_ambiguity or output.safety:
        return RiskAssessment(level="UNKNOWN", reasons=["INSUFFICIENT_CONTEXT"])
    return RiskAssessment(level="LOW", reasons=[])


async def parse_structure_output(raw: Any, transcript: str = "") -> tuple[WorkState, list[Ambiguity], str]:
    validate_contract_schema(raw, "structure-v1.schema.json")
    try:
        output = StructureOutput.model_validate(raw)
    except ValidationError as exc:
        raise ApiError(422, "SCHEMA_INVALID", "AI 구조화 결과 형식이 올바르지 않습니다.", {"errors": exc.errors()})

    location_display = "장소 미지정"
    if output.location.kind == "DEICTIC":
        location_display = "농장주 확인 필요"
    elif output.location.kind == "NAMED":
        location_display = output.location.canonical_name or output.location.raw_text or "장소 미지정"
    state = WorkState(
        task_family=output.task_family,
        location=output.location,
        location_display=location_display,
        quantity=output.quantity,
        deadline=output.deadline,
        safety=output.safety,
        notes=output.notes,
        steps=[
            Step(
                sequence=item.sequence,
                task_code=item.task_code,
                title_ko=item.title_ko,
                description_ko=item.description_ko,
                unsupported_reason=item.unsupported_reason,
                video=None,
                audio_url=None,
                delivery_mode="TEXT",
                translations=[],
            )
            for item in output.steps
        ],
        risk_assessment=deterministic_risk(transcript, output),
    )
    validate_state(state, allow_unsupported=True, for_publish=False)
    if not state.steps or state.risk_assessment.level != "LOW" or any(item.kind == "SAFETY" for item in output.ambiguities):
        raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "안전 또는 실행 단계 조건을 충족하지 않습니다.")
    ambiguities = [
        item.model_copy(update={"blocking": False}) if output.location.kind == "DEICTIC" and item.kind == "LOCATION" else item
        for item in output.ambiguities
    ]
    return state, ambiguities, output.interpretation


def parse_quantity_output(raw: Any, expected_version: int) -> QuantityChangeParseResult:
    validate_contract_schema(raw, "quantity-change-v1.schema.json")
    try:
        output = QuantityChangeParseResult.model_validate(raw)
    except ValidationError as exc:
        raise ApiError(422, "SCHEMA_INVALID", "AI 수량 변경 결과 형식이 올바르지 않습니다.", {"errors": exc.errors()})
    if output.expected_version != expected_version:
        raise ApiError(422, "SCHEMA_INVALID", "AI 결과의 expected_version이 일치하지 않습니다.")
    if output.interpretation == "READY":
        if output.quantity is None or output.ambiguities:
            raise ApiError(422, "SCHEMA_INVALID", "READY 수량 변경 결과가 올바르지 않습니다.")
    elif output.quantity is not None or not output.ambiguities or any(
        not item.blocking or item.kind != "QUANTITY" for item in output.ambiguities
    ):
        raise ApiError(422, "SCHEMA_INVALID", "AMBIGUOUS 수량 변경 결과가 올바르지 않습니다.")
    return output


def parse_ai_translation(raw: Any, segment: str, language_code: str) -> SegmentTranslation:
    validate_contract_schema(raw, "translation-v1.schema.json")
    data = dict(raw)
    data.pop("schema_version", None)
    data.pop("contract_version", None)
    try:
        translation = SegmentTranslation.model_validate(data)
    except ValidationError as exc:
        raise ApiError(422, "SCHEMA_INVALID", "AI 번역 결과 형식이 올바르지 않습니다.", {"errors": exc.errors()})
    if (
        translation.segment != segment
        or translation.language_code != language_code
        or translation.source != "AI_TRANSLATION"
        or translation.guide_lookup != "MISS"
        or translation.verified
        or any((translation.phrase_key, translation.source_page, translation.source_url, translation.license))
    ):
        raise ApiError(422, "SCHEMA_INVALID", "AI 번역 결과의 출처 정보가 올바르지 않습니다.")
    return translation


DEMO_AUDIO_TRANSCRIPTS = {
    "363579f7380a60c6b4fca1cc8b1327b2fee8015a9bc40181c793c36a06bc742f":
        "창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨.",
    "a78607973f7c123e69013570d06263be15943f2f6081d68dd76a163fd471552d":
        "스무 망 말고 열다섯 망으로 해.",
    "dc457f4326a28f2bfc904d35ed1009089eb7f101cc2fbd87f07c5ead9a941301":
        "저짝 밭에서 양파 스무 망을 수확해.",
}


DEMO_ACTION_TRANSLATIONS = {
    "ONION_HARVEST": {
        "vi": "Thu hoạch hành.",
        "ne": "प्याज काट्नुहोस्।",
    },
    "ONION_TRANSPORT": {
        "vi": "Vận chuyển hành đến kho.",
        "ne": "प्याज गोदाममा लैजानुहोस्।",
    },
    "STRAWBERRY_HARVEST": {
        "vi": "Thu hoạch dâu tây.",
        "ne": "स्ट्रबेरी टिप्नुहोस्।",
    },
}


def normalized_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().rstrip(".!?")


def transcribe_audio(audio: bytes) -> str:
    if not settings.demo_fallback:
        provider_unavailable()
    transcript = DEMO_AUDIO_TRANSCRIPTS.get(hashlib.sha256(audio).hexdigest())
    if not transcript:
        provider_unavailable()
    return transcript


def action_translation(task_code: str, language_code: str) -> SegmentTranslation | None:
    text = DEMO_ACTION_TRANSLATIONS.get(task_code, {}).get(language_code)
    if text is None:
        return None
    return SegmentTranslation(
        segment="ACTION",
        language_code=language_code,
        text=text,
        source="AI_TRANSLATION",
        verified=False,
        guide_lookup="MISS",
        phrase_key=None,
        source_page=None,
        source_url=None,
        license=None,
    )


def deterministic_translation(segment: str, language_code: str, text: str) -> SegmentTranslation:
    return SegmentTranslation(
        segment=segment,
        language_code=language_code,
        text=text,
        source="DETERMINISTIC",
        verified=False,
        guide_lookup="NOT_APPLICABLE",
    )


def quantity_text(quantity: Quantity | str | None, language_code: str) -> str | None:
    if not isinstance(quantity, Quantity):
        return None
    unit = {
        "망": {"vi": "bao", "ne": "बोरा"},
        "kg": {"vi": "kg", "ne": "किलो"},
        "킬로": {"vi": "kg", "ne": "किलो"},
        "개": {"vi": "cái", "ne": "वटा"},
    }.get(quantity.unit, {}).get(language_code, quantity.unit)
    prefix = {"vi": "Số lượng", "ne": "परिमाण"}[language_code]
    return f"{prefix}: {quantity.value} {unit}."


def order_text(sequence: int, language_code: str) -> str:
    return {"vi": f"Bước {sequence}.", "ne": f"चरण {sequence}।"}[language_code]



def deictic_location_text(language_code: str) -> str:
    return {
        "vi": "Vị trí do chủ nông trại xác nhận.",
        "ne": "स्थान फार्म मालिकले पुष्टि गर्नुपर्छ।",
    }[language_code]


def guide_action_translation(client: Client, step: Step, language_code: str) -> SegmentTranslation | None:
    try:
        phrases = row_data(
            client.table("guide_phrases")
            .select("phrase_key,source_page,source_url,license")
            .in_("canonical_ko", [step.title_ko, step.description_ko])
            .eq("verified", True)
            .limit(1)
            .execute()
        )
        if not phrases:
            return None
        phrase = phrases[0]
        translations = row_data(
            client.table("guide_translations")
            .select("translated_text")
            .eq("phrase_key", phrase["phrase_key"])
            .eq("language_code", language_code)
            .eq("verified", True)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "가이드 데이터를 확인할 수 없습니다.") from exc
    if not translations:
        return None
    return SegmentTranslation(
        segment="ACTION",
        language_code=language_code,
        text=translations[0]["translated_text"],
        source="OFFICIAL_GUIDE",
        verified=True,
        guide_lookup="HIT",
        phrase_key=phrase["phrase_key"],
        source_page=phrase["source_page"],
        source_url=phrase["source_url"],
        license=phrase["license"],
    )


def approved_video(client: Client, task_code: str | None) -> VideoAsset | None:
    if task_code is None:
        return None
    try:
        rows = row_data(
            client.table("visual_assets")
            .select("id,task_code,public_path,provenance,review_status,safety_level,captions_text")
            .eq("task_code", task_code)
            .eq("provenance", "AI_GENERATED_PREGENERATED")
            .eq("review_status", "APPROVED")
            .eq("safety_level", "LOW")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "영상 검수 데이터를 확인할 수 없습니다.") from exc
    if not rows:
        return None
    row = rows[0]
    return VideoAsset(
        asset_id=row["id"],
        task_code=row["task_code"],
        video_url=row["public_path"],
        provenance=row["provenance"],
        review_status=row["review_status"],
        safety_level=row["safety_level"],
        captions_text=row["captions_text"],
    )


async def enrich_draft_state(client: Client, state: WorkState) -> WorkState:
    state_data = state.model_dump()
    for step_data in state_data["steps"]:
        step = Step.model_validate(step_data)
        translations: list[SegmentTranslation] = []
        for language_code in sorted(LANGUAGES):
            action = guide_action_translation(client, step, language_code)
            if action is None:
                action = parse_ai_translation(
                    await ai_translate_segment("ACTION", step.description_ko, language_code), "ACTION", language_code
                )
            translations.append(action)
            if (quantity := quantity_text(state.quantity, language_code)) is not None:
                translations.append(deterministic_translation("QUANTITY", language_code, quantity))
            translations.append(deterministic_translation("ORDER", language_code, order_text(step.sequence, language_code)))
            if state.location.kind == "DEICTIC":
                translations.append(deterministic_translation("LOCATION", language_code, deictic_location_text(language_code)))
            elif state.location.kind == "NAMED":
                translations.append(
                    parse_ai_translation(
                        await ai_translate_segment("LOCATION", state.location_display, language_code), "LOCATION", language_code
                    )
                )
        video = approved_video(client, step.task_code)
        step_data["video"] = video.model_dump() if video else None
        step_data["delivery_mode"] = "VIDEO" if video else "TEXT"
        step_data["translations"] = [item.model_dump() for item in translations]
    enriched = WorkState.model_validate(state_data)
    validate_state(enriched, allow_unsupported=True, for_publish=False)
    return enriched


def demo_step(sequence: int, task_code: str, title_ko: str, description_ko: str) -> Step:
    translations = [
        translation
        for language_code in sorted(LANGUAGES)
        if (translation := action_translation(task_code, language_code)) is not None
    ]
    return Step(
        sequence=sequence,
        task_code=task_code,
        title_ko=title_ko,
        description_ko=description_ko,
        video=None,
        audio_url=None,
        delivery_mode="TEXT",
        unsupported_reason=None,
        translations=translations,
    )


def demo_structure(transcript: str) -> tuple[WorkState, list[Ambiguity]]:
    text = normalized_text(transcript)
    location = Location(raw_text=None, kind="UNSPECIFIED", canonical_name=None)
    location_display = "장소 미지정"
    ambiguities: list[Ambiguity] = []
    task_family: Literal["ONION", "STRAWBERRY"] = "ONION"

    if text == normalized_text("저짝 밭에서 양파 스무 망을 수확해"):
        location = Location(raw_text="저짝", kind="DEICTIC", canonical_name=None)
        location_display = "농장주 확인 필요"
        ambiguities.append(
            Ambiguity(
                field="location",
                message="'저짝'은 현장에서 농장주가 가리킨 위치 확인이 필요합니다.",
                blocking=False,
                kind="LOCATION",
            )
        )
        steps = [demo_step(1, "ONION_HARVEST", "양파 수확", "양파를 수확한다")]
        summary = "농장주가 가리킨 곳의 양파 20망을 수확합니다."
    elif text == normalized_text("창고 앞 밭에서 양파 스무 망을 수확해서 창고로 옮겨"):
        location = Location(raw_text="창고 앞 밭", kind="NAMED", canonical_name="창고 앞 밭")
        location_display = "창고 앞 밭"
        steps = [
            demo_step(1, "ONION_HARVEST", "양파 수확", "양파를 수확한다"),
            demo_step(2, "ONION_TRANSPORT", "양파 운반", "양파를 창고로 옮긴다"),
        ]
        summary = "창고 앞 밭의 양파 20망을 수확해 창고로 옮깁니다."
    elif text == normalized_text("딸기 스무 상자를 수확해"):
        task_family = "STRAWBERRY"
        steps = [demo_step(1, "STRAWBERRY_HARVEST", "딸기 수확", "딸기를 수확한다")]
        summary = "딸기 20상자를 수확합니다."
    else:
        provider_unavailable()

    state = WorkState(
        task_family=task_family,
        location=location,
        location_display=location_display,
        quantity=Quantity(value=20, unit="상자" if task_family == "STRAWBERRY" else "망"),
        deadline=None,
        safety=[],
        notes=None,
        steps=steps,
        risk_assessment=RiskAssessment(
            level="LOW",
            reasons=[],
            schema_version="1",
            contract_version="safety-policy-v1",
        ),
    )
    return state, ambiguities


KOREAN_NUMBERS = {
    "한": 1,
    "두": 2,
    "세": 3,
    "네": 4,
    "다섯": 5,
    "여섯": 6,
    "일곱": 7,
    "여덟": 8,
    "아홉": 9,
    "열": 10,
    "열한": 11,
    "열두": 12,
    "열세": 13,
    "열네": 14,
    "열다섯": 15,
    "열여섯": 16,
    "열일곱": 17,
    "열여덟": 18,
    "열아홉": 19,
    "스무": 20,
}


def parse_quantity_text(transcript: str) -> Quantity | None:
    text = normalized_text(transcript)
    candidate = text
    for cue in ("말고", "으로 바꿔", "으로 해", "변경"):
        if cue in text:
            candidate = text.split(cue, 1)[1]
            break
    match = re.search(r"(?P<number>\d+|[가-힣]+)\s*(?P<unit>[가-힣A-Za-z]+)", candidate)
    if not match:
        return None
    number_text = match.group("number")
    value = int(number_text) if number_text.isdigit() else KOREAN_NUMBERS.get(number_text)
    if value is None or value < 1:
        return None
    if candidate == text:
        return None
    unit = re.sub(r"(으로|로|을|를|은|는|이|가|만|쯤)$", "", match.group("unit"))
    if not unit:
        return None
    return Quantity(value=value, unit=unit)


def quantity_parse_result(transcript: str, expected_version: int) -> QuantityChangeParseResult:
    quantity = parse_quantity_text(transcript)
    if quantity is not None:
        return QuantityChangeParseResult(
            interpretation="READY",
            quantity=quantity,
            expected_version=expected_version,
            ambiguities=[],
        )
    return QuantityChangeParseResult(
        interpretation="AMBIGUOUS",
        quantity=None,
        expected_version=expected_version,
        ambiguities=[
            Ambiguity(
                field="quantity",
                message="변경할 수량과 단위를 확인할 수 없습니다.",
                blocking=True,
                kind="QUANTITY",
            )
        ],
    )


def draft_summary(state: WorkState) -> str:
    quantity = state.quantity
    quantity_text = "수량 미지정"
    if isinstance(quantity, Quantity):
        quantity_text = f"{quantity.value}{quantity.unit}"
    location_text = state.location_display
    if state.location.kind == "DEICTIC":
        location_text = "농장주가 가리킨 곳"
    if any(step.task_code == "ONION_TRANSPORT" for step in state.steps):
        return f"{location_text}의 양파 {quantity_text}을 수확해 창고로 옮깁니다."
    crop = "양파" if state.task_family == "ONION" else "딸기"
    return f"{location_text}의 {crop} {quantity_text}을 작업합니다."


def interpretation_for(ambiguities: list[Ambiguity]) -> str:
    return "AMBIGUOUS" if ambiguities else "READY"


def transcribe_and_release(audio: bytes) -> str:
    try:
        return transcribe_audio(audio)
    finally:
        del audio


def tts_text(step: Step, language_code: str) -> str:
    return " ".join(
        translation.text.strip()
        for translation in step.translations
        if translation.language_code == language_code and translation.text.strip()
    )


def tts_text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def tts_audio_url(audio_bytes: bytes) -> str:
    return f"data:audio/mpeg;base64,{base64.b64encode(audio_bytes).decode('ascii')}"


def synthesize_tts(text: str) -> bytes:
    if not settings.openai_api_key:
        raise RuntimeError("TTS provider is not configured")
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=json.dumps(
            {
                "model": settings.openai_tts_model,
                "voice": settings.openai_tts_voice,
                "input": text,
                "response_format": "mp3",
            }
        ).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=settings.openai_timeout_seconds) as response:
        audio_bytes = response.read()
    if not audio_bytes:
        raise RuntimeError("empty TTS response")
    return audio_bytes


def cached_tts_audio(client: Client, text: str, language_code: str) -> bytes | None:
    text_hash = tts_text_hash(text)
    try:
        result = (
            client.table("tts_assets")
            .select("audio_bytes")
            .eq("text_hash", text_hash)
            .eq("language_code", language_code)
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    rows = row_data(result)
    if not rows:
        return None
    audio_bytes = rows[0].get("audio_bytes")
    if isinstance(audio_bytes, str):
        try:
            return base64.b64decode(audio_bytes)
        except ValueError:
            return None
    return bytes(audio_bytes) if isinstance(audio_bytes, (bytes, bytearray)) else None


def cache_published_tts(client: Client, state: WorkState) -> None:
    for step in state.steps:
        for language_code in LANGUAGES:
            text = tts_text(step, language_code)
            if not text or cached_tts_audio(client, text, language_code) is not None:
                continue
            try:
                client.table("tts_assets").upsert(
                    {
                        "text_hash": tts_text_hash(text),
                        "language_code": language_code,
                        "audio_bytes": synthesize_tts(text),
                        "content_type": "audio/mpeg",
                    },
                    on_conflict="text_hash,language_code",
                ).execute()
            except (OSError, RuntimeError, urllib.error.URLError, urllib.error.HTTPError):
                continue
            except Exception:
                continue


def add_cached_tts_urls(client: Client, state: WorkState, language_code: str) -> WorkState:
    state_data = state.model_dump()
    for step_data in state_data["steps"]:
        step = Step.model_validate(step_data)
        text = tts_text(step, language_code)
        audio_bytes = cached_tts_audio(client, text, language_code) if text else None
        step_data["audio_url"] = tts_audio_url(audio_bytes) if audio_bytes else None
        if step_data["video"] is None:
            step_data["delivery_mode"] = "TEXT_TTS" if audio_bytes else "TEXT"
    return WorkState.model_validate(state_data)


def merge_demo_supplement(draft: WorkDraft, supplement_transcript: str) -> tuple[WorkState, list[Ambiguity]]:
    text = normalized_text(supplement_transcript)
    state_data = draft.state.model_dump()
    ambiguities = list(draft.ambiguities)
    merged = False

    if "창고 앞 밭" in text:
        state_data["location"] = Location(
            raw_text="창고 앞 밭",
            kind="NAMED",
            canonical_name="창고 앞 밭",
        ).model_dump()
        state_data["location_display"] = "창고 앞 밭"
        ambiguities = [item for item in ambiguities if item.field != "location"]
        merged = True

    quantity = parse_quantity_text(text)
    if quantity is not None:
        state_data["quantity"] = quantity.model_dump()
        ambiguities = [item for item in ambiguities if item.field != "quantity"]
        merged = True

    if not merged:
        provider_unavailable()
    state = WorkState.model_validate(state_data)
    validate_state(state, allow_unsupported=True, for_publish=False)
    return state, ambiguities


def validate_state(state: WorkState, allow_unsupported: bool, for_publish: bool) -> None:
    sequences = [step.sequence for step in state.steps]
    if sequences and sequences != list(range(1, len(sequences) + 1)):
        raise ApiError(422, "SCHEMA_INVALID", "작업 단계 순서가 올바르지 않습니다.")
    if for_publish and not state.steps:
        raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "실행 가능한 작업 단계가 없습니다.")
    if state.risk_assessment.level == "LOW" and state.risk_assessment.reasons:
        raise ApiError(422, "SCHEMA_INVALID", "LOW 위험 판정에는 사유가 없어야 합니다.")
    if state.risk_assessment.level != "LOW" and not state.risk_assessment.reasons:
        raise ApiError(422, "SCHEMA_INVALID", "HIGH/UNKNOWN 위험 판정에는 사유가 필요합니다.")
    if for_publish and state.risk_assessment.level != "LOW":
        raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "안전 판정이 게시 조건을 충족하지 않습니다.")
    for step in state.steps:
        if step.task_code is None:
            if not allow_unsupported or not step.unsupported_reason:
                raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "전달할 수 없는 작업 단계입니다.")
        elif step.task_code not in TASK_CODES:
            raise ApiError(422, "SCHEMA_INVALID", "지원하지 않는 작업 코드입니다.")
        elif step.task_code not in TASK_CODES_BY_FAMILY[state.task_family]:
            raise ApiError(422, "SCHEMA_INVALID", "작업 코드와 작물 범주가 일치하지 않습니다.")
        elif step.unsupported_reason is not None:
            raise ApiError(422, "SCHEMA_INVALID", "지원 작업에 unsupported_reason을 넣을 수 없습니다.")
        if step.video is not None:
            if step.video.task_code != step.task_code:
                raise ApiError(422, "SCHEMA_INVALID", "영상과 작업 코드가 일치하지 않습니다.")
            if (
                step.video.provenance != "AI_GENERATED_PREGENERATED"
                or step.video.review_status != "APPROVED"
                or step.video.safety_level != "LOW"
            ):
                raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "검수되지 않은 영상은 게시할 수 없습니다.")
        if step.task_code is None and step.delivery_mode not in {"TEXT_TTS", "TEXT"}:
            raise ApiError(422, "SCHEMA_INVALID", "지원하지 않는 작업은 텍스트로만 전달합니다.")
        if step.delivery_mode not in {"VIDEO", "TEXT_TTS", "TEXT"}:
            raise ApiError(422, "SCHEMA_INVALID", "전달 방식이 올바르지 않습니다.")
    for translation in [item for step in state.steps for item in step.translations]:
        if translation.language_code not in LANGUAGES:
            raise ApiError(422, "SCHEMA_INVALID", "지원하지 않는 언어입니다.")
        if translation.source not in {"OFFICIAL_GUIDE", "AI_TRANSLATION", "DETERMINISTIC"}:
            raise ApiError(422, "SCHEMA_INVALID", "번역 출처가 올바르지 않습니다.")
        if translation.guide_lookup not in {"HIT", "MISS", "NOT_APPLICABLE"}:
            raise ApiError(422, "SCHEMA_INVALID", "가이드 조회 결과가 올바르지 않습니다.")
        if translation.source == "OFFICIAL_GUIDE" and not (
            translation.guide_lookup == "HIT"
            and translation.verified
            and translation.source_page is not None
            and translation.source_page > 0
            and translation.source_url
            and translation.license
        ):
            raise ApiError(422, "SCHEMA_INVALID", "공식 가이드 출처가 검증되지 않았습니다.")
        if for_publish and translation.segment == "SAFETY" and translation.source != "OFFICIAL_GUIDE":
            raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "안전 표현은 검증된 공식 가이드만 게시할 수 있습니다.")


def parse_draft(row: dict[str, Any]) -> WorkDraft:
    try:
        ambiguities = [Ambiguity.model_validate(item) for item in row.get("ambiguities", [])]
    except ValidationError as exc:
        raise ApiError(422, "SCHEMA_INVALID", "초안의 모호함 형식이 올바르지 않습니다.", {"errors": exc.errors()})
    return WorkDraft(
        draft_id=str(row["id"]),
        draft_revision=row["draft_revision"],
        summary_ko=row["summary_ko"],
        interpretation=row["interpretation"],
        state=parse_state(row["state_json"]),
        ambiguities=ambiguities,
        transcript=row.get("transcript") or "",
    )


def parse_version(row: dict[str, Any]) -> WorkVersion:
    return WorkVersion(
        version=row["version"],
        lifecycle=row["status"],
        state=parse_state(row["state_json"]),
        ambiguity_override=bool(row.get("ambiguity_override", False)),
        override_reason=row.get("override_reason"),
        overridden_at=row.get("overridden_at"),
        transcript=row.get("transcript"),
    )


def localized_state(state: WorkState, language_code: str, client: Client | None = None) -> WorkState:
    state_data = state.model_dump()
    state_data["steps"] = [
        {
            **step.model_dump(),
            "translations": [
                translation.model_dump()
                for translation in step.translations
                if translation.language_code == language_code
            ],
        }
        for step in state.steps
    ]
    localized = WorkState.model_validate(state_data)
    return add_cached_tts_urls(client, localized, language_code) if client is not None else localized


def localized_worker_state(state: WorkState, language_code: str, client: Client | None = None) -> WorkerState:
    state_data = state.model_dump(exclude={"risk_assessment"})
    state_data["steps"] = [
        {
            **step.model_dump(),
            "translations": [
                translation.model_dump()
                for translation in step.translations
                if translation.language_code == language_code
            ],
        }
        for step in state.steps
    ]
    localized = WorkerState.model_validate(state_data)
    if client is None:
        return localized
    state_with_tts = add_cached_tts_urls(client, WorkState.model_validate({**state_data, "risk_assessment": state.risk_assessment.model_dump()}), language_code)
    return WorkerState.model_validate(state_with_tts.model_dump(exclude={"risk_assessment"}))


def worker_link_meta(client: Client, session_id: str) -> list[WorkerLinkMeta]:
    result = (
        client.table("worker_links")
        .select("language_code,expires_at,revoked_at,issued_at")
        .eq("work_session_id", session_id)
        .order("issued_at", desc=True)
        .execute()
    )
    items: list[WorkerLinkMeta] = []
    seen: set[str] = set()
    for row in row_data(result):
        language_code = row["language_code"]
        if language_code in seen:
            continue
        seen.add(language_code)
        items.append(
            WorkerLinkMeta(
                language_code=language_code,
                expires_at=row["expires_at"],
                revoked_at=row.get("revoked_at"),
            )
        )
    return items


def team_members(client: Client, team_id: str) -> list[TeamMember]:
    rows = row_data(
        client.table("today_work_team_members")
        .select("id,display_name,language_code,joined_at")
        .eq("team_id", team_id)
        .order("joined_at")
        .execute()
    )
    ids = [str(row["id"]) for row in rows]
    assignments_by_member: dict[str, list[str]] = {member_id: [] for member_id in ids}
    if ids:
        assignment_rows = row_data(
            client.table("today_work_assignments")
            .select("team_member_id,work_session_id")
            .in_("team_member_id", ids)
            .is_("revoked_at", "null")
            .execute()
        )
        for assignment in assignment_rows:
            assignments_by_member.setdefault(str(assignment["team_member_id"]), []).append(str(assignment["work_session_id"]))
    return [
        TeamMember(
            member_id=str(row["id"]),
            display_name=row["display_name"],
            language_code=row["language_code"],
            joined_at=row["joined_at"],
            assignment_session_ids=assignments_by_member[str(row["id"])],
        )
        for row in rows
    ]


def today_team_response(client: Client, team_row: dict[str, Any], join_url: str | None = None) -> TodayWorkTeam:
    return TodayWorkTeam(
        team_id=str(team_row["id"]),
        work_date=str(team_row["work_date"]),
        join_url=join_url,
        expires_at=team_row["expires_at"],
        members=team_members(client, str(team_row["id"])),
    )


def worker_assignment_for_session(client: Client, session_id: str, language_code: str) -> WorkerAssignment:
    session = one_row(
        client.table("work_sessions")
        .select("id,current_version,status")
        .eq("id", session_id)
        .eq("status", "PUBLISHED")
        .execute(),
        "ACCESS_DENIED",
    )
    version = one_row(
        client.table("work_versions")
        .select("*")
        .eq("work_session_id", session["id"])
        .eq("version", session["current_version"])
        .eq("status", "PUBLISHED")
        .execute(),
        "ACCESS_DENIED",
    )
    parsed = parse_version(version)
    state = localized_worker_state(parsed.state, language_code, client)
    badges: list[str] = []
    if parsed.ambiguity_override or state.location.kind == "DEICTIC":
        badges.append("확인이 필요한 지시")
    return WorkerAssignment(
        language_code=language_code,
        session_id=str(session["id"]),
        version=parsed.version,
        state=state,
        badges=badges,
        source_detail=[translation for step in state.steps for translation in step.translations],
    )


def owner_session_response(client: Client, session_row: dict[str, Any], version_row: dict[str, Any]) -> OwnerWorkSession:
    return OwnerWorkSession(
        session_id=str(session_row["id"]),
        current_version=session_row["current_version"],
        version=parse_version(version_row),
        worker_link_meta=worker_link_meta(client, str(session_row["id"])),
    )


def sign_session(expires_at: int) -> str:
    payload = str(expires_at).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(settings.owner_session_secret.encode(), payload, hashlib.sha256).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def verify_session(value: str | None) -> bool:
    if not value or not settings.auth_configured or "." not in value:
        return False
    encoded, encoded_signature = value.split(".", 1)
    try:
        payload = base64.urlsafe_b64decode(encoded + "===")
        expires_at = int(payload.decode())
        signature = base64.urlsafe_b64decode(encoded_signature + "===")
    except (ValueError, UnicodeDecodeError, base64.binascii.Error):
        return False
    expected = hmac.new(settings.owner_session_secret.encode(), payload, hashlib.sha256).digest()
    return expires_at > int(time.time()) and hmac.compare_digest(signature, expected)


def require_owner(cookie: str | None) -> None:
    if not verify_session(cookie):
        raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")


def require_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin or origin not in settings.origins:
        raise ApiError(403, "UNAUTHORIZED", "허용되지 않은 요청입니다.")
    csrf = request.headers.get("x-csrf-token", "")
    if not hmac.compare_digest(csrf, CSRF_TOKEN):
        raise ApiError(403, "UNAUTHORIZED", "허용되지 않은 요청입니다.")


def client_address(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_pin_rate_limit(request: Request) -> None:
    now = time.time()
    address = client_address(request)
    recent = [timestamp for timestamp in pin_failures.get(address, []) if now - timestamp < PIN_FAILURE_WINDOW_SECONDS]
    pin_failures[address] = recent
    if len(recent) >= PIN_FAILURE_LIMIT:
        raise ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도하세요.")


def record_pin_failure(request: Request) -> None:
    address = client_address(request)
    pin_failures.setdefault(address, []).append(time.time())


def clear_pin_failures(request: Request) -> None:
    pin_failures.pop(client_address(request), None)


def check_ai_rate_limit(request: Request) -> None:
    now = time.time()
    address = client_address(request)
    recent = [timestamp for timestamp in ai_requests.get(address, []) if now - timestamp < AI_REQUEST_WINDOW_SECONDS]
    ai_requests[address] = recent
    if len(recent) >= AI_REQUEST_LIMIT:
        raise ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도하세요.")
    recent.append(now)


def check_team_join_rate_limit(request: Request) -> None:
    now = time.time()
    address = client_address(request)
    recent = [timestamp for timestamp in team_join_requests.get(address, []) if now - timestamp < AI_REQUEST_WINDOW_SECONDS]
    team_join_requests[address] = recent
    if len(recent) >= TEAM_JOIN_REQUEST_LIMIT:
        raise ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도하세요.")
    recent.append(now)


def require_idempotency(value: str | None) -> str:
    if not value or len(value) < 8:
        raise ApiError(422, "SCHEMA_INVALID", "Idempotency-Key가 필요합니다.")
    return value


def hash_link_token(token: str) -> str:
    return hmac.new(settings.owner_session_secret.encode(), token.encode(), hashlib.sha256).hexdigest()


def today_seoul() -> tuple[str, datetime]:
    current = now_utc()
    seoul = timezone(timedelta(hours=9), name="Asia/Seoul")
    local = current.astimezone(seoul)
    next_midnight = datetime.combine(local.date() + timedelta(days=1), datetime.min.time(), tzinfo=seoul)
    return local.date().isoformat(), min(current + timedelta(hours=24), next_midnight.astimezone(timezone.utc))


def sign_team_member(team_id: str, member_id: str, expires_at: datetime) -> str:
    payload = json.dumps(
        {"team_id": team_id, "member_id": member_id, "expires_at": int(expires_at.timestamp())},
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(settings.owner_session_secret.encode(), payload, hashlib.sha256).digest()
    return f"{encoded}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}"


def verify_team_member(value: str | None) -> tuple[str, str] | None:
    if not value or not settings.auth_configured or "." not in value:
        return None
    encoded, encoded_signature = value.split(".", 1)
    try:
        payload = base64.urlsafe_b64decode(encoded + "===")
        signature = base64.urlsafe_b64decode(encoded_signature + "===")
        parsed = json.loads(payload)
        team_id = parsed["team_id"]
        member_id = parsed["member_id"]
        expires_at = int(parsed["expires_at"])
    except (KeyError, TypeError, ValueError, base64.binascii.Error, json.JSONDecodeError):
        return None
    expected = hmac.new(settings.owner_session_secret.encode(), payload, hashlib.sha256).digest()
    if not isinstance(team_id, str) or not isinstance(member_id, str) or expires_at <= int(time.time()) or not hmac.compare_digest(signature, expected):
        return None
    return team_id, member_id


def require_team_member(cookie: str | None) -> tuple[str, str]:
    identity = verify_team_member(cookie)
    if identity is None:
        raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")
    return identity


def _ebml_vint(content: bytes, offset: int) -> tuple[int, int]:
    if offset >= len(content) or not content[offset]:
        raise ValueError("invalid EBML value")
    width = 9 - content[offset].bit_length()
    if width < 1 or width > 8 or offset + width > len(content):
        raise ValueError("invalid EBML value")
    value = content[offset] & ((1 << (8 - width)) - 1)
    for byte in content[offset + 1 : offset + width]:
        value = (value << 8) | byte
    return value, width


def _webm_duration_seconds(content: bytes) -> float:
    if not content.startswith(b"\x1aE\xdf\xa3"):
        raise ValueError("invalid WebM header")
    duration_at = content.find(b"\x44\x89")
    if duration_at < 0:
        raise ValueError("WebM duration unavailable")
    size, size_width = _ebml_vint(content, duration_at + 2)
    value_at = duration_at + 2 + size_width
    encoded = content[value_at : value_at + size]
    if len(encoded) != size or size not in {4, 8}:
        raise ValueError("invalid WebM duration")
    duration = struct.unpack(">f" if size == 4 else ">d", encoded)[0]
    scale = 1_000_000
    scale_at = content.find(b"\x2a\xd7\xb1")
    if scale_at >= 0:
        scale_size, scale_width = _ebml_vint(content, scale_at + 3)
        scale_data_at = scale_at + 3 + scale_width
        scale_bytes = content[scale_data_at : scale_data_at + scale_size]
        if not scale_bytes:
            raise ValueError("invalid WebM time scale")
        scale = int.from_bytes(scale_bytes, "big")
    if duration < 0 or scale <= 0:
        raise ValueError("invalid WebM duration")
    return duration * scale / 1_000_000_000


def _mp4_duration_seconds(content: bytes) -> float:
    if len(content) < 12 or content[4:8] != b"ftyp":
        raise ValueError("invalid MP4 header")
    marker = content.find(b"mvhd")
    if marker < 0 or marker + 24 > len(content):
        raise ValueError("MP4 duration unavailable")
    version = content[marker + 4]
    if version == 0:
        time_scale_at, duration_at, width = marker + 16, marker + 20, 4
    elif version == 1:
        time_scale_at, duration_at, width = marker + 24, marker + 28, 8
    else:
        raise ValueError("invalid MP4 version")
    if duration_at + width > len(content):
        raise ValueError("invalid MP4 duration")
    time_scale = int.from_bytes(content[time_scale_at : time_scale_at + 4], "big")
    duration = int.from_bytes(content[duration_at : duration_at + width], "big")
    if time_scale <= 0:
        raise ValueError("invalid MP4 time scale")
    return duration / time_scale


def audio_duration_seconds(content: bytes, content_type: str) -> float:
    try:
        if content_type in {"audio/wav", "audio/x-wav", "audio/wave"}:
            if not content.startswith(b"RIFF") or content[8:12] != b"WAVE":
                raise ValueError("invalid WAV header")
            with wave.open(io.BytesIO(content)) as wav_file:
                return wav_file.getnframes() / wav_file.getframerate()
        if content_type == "audio/webm":
            return _webm_duration_seconds(content)
        return _mp4_duration_seconds(content)
    except (EOFError, ValueError, wave.Error, struct.error, ZeroDivisionError):
        raise ApiError(422, "SCHEMA_INVALID", "audio 길이를 검증할 수 없습니다.")


async def read_audio_upload(upload: UploadFile, language_hint: str = "ko") -> bytes:
    upload_type = upload.content_type or ""
    allowed_types = {"audio/webm", "audio/mp4", "audio/wav", "audio/x-wav", "audio/wave"}
    if upload_type not in allowed_types:
        raise ApiError(422, "SCHEMA_INVALID", "audio 파일만 허용됩니다.")
    if language_hint != "ko":
        raise ApiError(422, "SCHEMA_INVALID", "language_hint는 ko만 지원합니다.")
    content = await upload.read(MAX_AUDIO_BYTES + 1)
    if len(content) > MAX_AUDIO_BYTES:
        raise ApiError(422, "SCHEMA_INVALID", "audio는 10 MiB 이하만 허용됩니다.")
    duration_seconds = audio_duration_seconds(content, upload_type)
    if duration_seconds > 60:
        raise ApiError(422, "SCHEMA_INVALID", "audio는 60초 이하만 허용됩니다.")
    return content


def provider_unavailable() -> None:
    raise ApiError(503, "PROVIDER_UNAVAILABLE", "AI 제공자가 준비되지 않았습니다.")


def issue_link(language_code: str) -> tuple[dict[str, Any], IssuedWorkerLink]:
    issued_at = now_utc()
    expires_at = issued_at + timedelta(hours=24)
    token = secrets.token_urlsafe(32)
    return (
        {
            "language_code": language_code,
            "token_hash": hash_link_token(token),
            "issued_at": issued_at.isoformat(),
            "expires_at": expires_at.isoformat(),
        },
        IssuedWorkerLink(
            language_code=language_code,
            url=f"{settings.public_api_base_url.rstrip('/')}/api/v1/worker-links/{token}/assignment",
            expires_at=expires_at,
        ),
    )


def validate_confirm(draft: WorkDraft, payload: DraftConfirmRequest) -> None:
    has_ambiguity = bool(draft.ambiguities) or draft.interpretation in {"AMBIGUOUS", "UNSUPPORTED"}
    if payload.decision == "CONFIRM":
        if has_ambiguity or payload.ambiguity_override or payload.override_reason is not None:
            raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "모호한 지시는 PUBLISH_AS_IS와 사유가 필요합니다.")
    else:
        if not payload.ambiguity_override or payload.override_reason is None:
            raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "PUBLISH_AS_IS에는 owner 사유가 필요합니다.")
        if any(item.blocking or item.kind == "SAFETY" for item in draft.ambiguities):
            raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "안전상 이 모호함은 그대로 전달할 수 없습니다.")
    validate_state(
        draft.state,
        allow_unsupported=payload.decision == "PUBLISH_AS_IS",
        for_publish=True,
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
async def ready() -> dict[str, str]:
    if not settings.supabase_configured or not settings.auth_configured or not provider_ready():
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "Supabase 또는 AI 제공자가 준비되지 않았습니다.")
    try:
        db_client().table("work_sessions").select("id").limit(1).execute()
    except Exception:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "Supabase 또는 AI 제공자가 준비되지 않았습니다.")
    return {"status": "ready"}


@app.post("/api/v1/owner/session", status_code=201, response_model=OwnerSession)
async def issue_owner_session(payload: PinLoginRequest, request: Request, response: Response) -> OwnerSession:
    require_origin(request)
    check_pin_rate_limit(request)
    if not settings.auth_configured or not hmac.compare_digest(payload.pin, settings.owner_pin):
        record_pin_failure(request)
        raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")
    clear_pin_failures(request)
    expires_at = now_utc() + timedelta(seconds=settings.owner_session_ttl_seconds)
    response.set_cookie(
        COOKIE_NAME,
        sign_session(int(expires_at.timestamp())),
        max_age=settings.owner_session_ttl_seconds,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return OwnerSession(expires_at=expires_at)


@app.post("/api/v1/work-sessions/drafts/from-audio", response_model=WorkDraft)
async def draft_from_audio(
    request: Request,
    audio: UploadFile = File(...),
    language_hint: str = Form("ko"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> WorkDraft:
    require_owner(batmeori_owner_session)
    require_origin(request)
    require_idempotency(idempotency_key)
    check_ai_rate_limit(request)
    audio_bytes: bytes | None = None
    try:
        audio_bytes = await read_audio_upload(audio, language_hint)
        if settings.demo_fallback:
            transcript = transcribe_and_release(audio_bytes)
            state, ambiguities = demo_structure(transcript)
            interpretation = interpretation_for(ambiguities)
            validate_state(state, allow_unsupported=True, for_publish=False)
        else:
            transcript = await ai_transcribe_audio(
                audio_bytes,
                filename=audio.filename or "audio",
                content_type=audio.content_type or "audio/webm",
                language_hint=language_hint,
            )
            state, ambiguities, interpretation = await parse_structure_output(
                await ai_structure_transcript(transcript), transcript
            )
            state = await enrich_draft_state(db_client(), state)
        draft_data = {
            "draft_revision": 0,
            "summary_ko": draft_summary(state),
            "transcript": transcript,
            "interpretation": interpretation,
            "state_json": state.model_dump(mode="json"),
            "ambiguities": [item.model_dump(mode="json") for item in ambiguities],
            "contract_version": "structure-v1",
        }
        try:
            result = db_client().table("work_drafts").insert(draft_data).select("*").execute()
        except Exception as exc:
            raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.") from exc
        return parse_draft(one_row(result))
    finally:
        if audio_bytes is not None:
            del audio_bytes
        try:
            await audio.close()
        except Exception:
            pass


@app.post("/api/v1/work-sessions/drafts/{draftId}/supplement", response_model=WorkDraft)
async def supplement_draft(
    draftId: str,
    request: Request,
    audio: UploadFile = File(...),
    expected_draft_revision: int = Form(...),
    language_hint: str = Form("ko"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> WorkDraft:
    draft_id = draftId
    require_owner(batmeori_owner_session)
    require_origin(request)
    audio_bytes: bytes | None = None
    try:
        require_idempotency(idempotency_key)
        check_ai_rate_limit(request)
        audio_bytes = await read_audio_upload(audio, language_hint)
        if expected_draft_revision < 0:
            raise ApiError(422, "SCHEMA_INVALID", "expected_draft_revision이 필요합니다.")
        client = db_client()
        row = one_row(client.table("work_drafts").select("*").eq("id", draft_id).execute())
        if row["draft_revision"] != expected_draft_revision:
            raise ApiError(409, "VERSION_CONFLICT", "최신 작업 초안을 다시 확인하세요.")
        draft = parse_draft(row)
        transcript = await ai_transcribe_audio(
            audio_bytes,
            filename=audio.filename or "audio",
            content_type=audio.content_type or "audio/webm",
            language_hint=language_hint,
        )
        state, ambiguities, interpretation = await parse_structure_output(
            await ai_merge_structure_transcript(draft.model_dump(mode="json"), transcript), transcript
        )
        state = await enrich_draft_state(client, state)
        result = (
            client.table("work_drafts")
            .update(
                {
                    "draft_revision": expected_draft_revision + 1,
                    "summary_ko": draft_summary(state),
                    "transcript": f"{draft.transcript} {transcript}".strip(),
                    "interpretation": interpretation,
                    "state_json": state.model_dump(mode="json"),
                    "ambiguities": [item.model_dump(mode="json") for item in ambiguities],
                }
            )
            .eq("id", draft_id)
            .eq("draft_revision", expected_draft_revision)
            .select("*")
            .execute()
        )
        if not row_data(result):
            raise ApiError(409, "VERSION_CONFLICT", "최신 작업 초안을 다시 확인하세요.")
        return parse_draft(one_row(result))
    finally:
        if audio_bytes is not None:
            del audio_bytes
        try:
            await audio.close()
        except Exception:
            pass


@app.post("/api/v1/work-sessions/drafts/{draftId}/confirm", status_code=201, response_model=InitialPublishResponse)
async def confirm_draft(
    draftId: str,
    payload: DraftConfirmRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> InitialPublishResponse:
    draft_id = draftId
    require_owner(batmeori_owner_session)
    require_origin(request)
    issue_key = require_idempotency(idempotency_key)
    client = db_client()
    draft = parse_draft(one_row(client.table("work_drafts").select("*").eq("id", draft_id).execute()))
    validate_confirm(draft, payload)
    link_row: dict[str, Any] | None = None
    issued: list[IssuedWorkerLink] = []
    if payload.delivery_mode == "REMOTE":
        link_row, link = issue_link(payload.language_code)
        link_row["issue_idempotency_key"] = issue_key
        issued = [link]
    try:
        rpc_result = client.rpc(
            "publish_initial_draft",
            {
                "p_draft_id": draft_id,
                "p_state_json": jsonable(draft.state),
                "p_transcript": draft.transcript,
                "p_decision": payload.decision,
                "p_override_reason": payload.override_reason,
                "p_ambiguity_override": payload.ambiguity_override,
                "p_delivery_mode": payload.delivery_mode,
                "p_language_code": payload.language_code,
                "p_link": link_row,
            },
        ).execute()
        session_id = str(one_row(rpc_result)["session_id"])
    except ApiError:
        raise
    except Exception:
        raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
    session_row = one_row(client.table("work_sessions").select("*").eq("id", session_id).execute())
    version_row = one_row(
        client.table("work_versions").select("*").eq("work_session_id", session_id).eq("version", 1).execute()
    )
    cache_published_tts(client, parse_version(version_row).state)
    return InitialPublishResponse(
        work_session=owner_session_response(client, session_row, version_row),
        issued_worker_links=issued,
    )


@app.get("/api/v1/work-sessions", response_model=dict[str, list[OwnerWorkSession]])
async def list_sessions(
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> dict[str, list[OwnerWorkSession]]:
    require_owner(batmeori_owner_session)
    client = db_client()
    sessions = row_data(client.table("work_sessions").select("*").order("updated_at", desc=True).execute())
    items: list[OwnerWorkSession] = []
    for session in sessions:
        version = one_row(
            client.table("work_versions")
            .select("*")
            .eq("work_session_id", session["id"])
            .eq("version", session["current_version"])
            .execute()
        )
        items.append(owner_session_response(client, session, version))
    return {"items": items}


@app.get("/api/v1/work-sessions/{sessionId}", response_model=OwnerWorkSession)
async def get_session(
    sessionId: str,
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> OwnerWorkSession:
    session_id = sessionId
    require_owner(batmeori_owner_session)
    client = db_client()
    session = one_row(client.table("work_sessions").select("*").eq("id", session_id).execute())
    version = one_row(
        client.table("work_versions")
        .select("*")
        .eq("work_session_id", session_id)
        .eq("version", session["current_version"])
        .execute()
    )
    return owner_session_response(client, session, version)


@app.post(
    "/api/v1/work-sessions/{sessionId}/quantity-changes/from-audio",
    response_model=QuantityChangeParseResult,
)
async def parse_quantity_change(
    sessionId: str,
    request: Request,
    audio: UploadFile = File(...),
    expected_version: int = Form(...),
    language_hint: str = Form("ko"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> dict[str, Any]:
    session_id = sessionId
    require_owner(batmeori_owner_session)
    require_origin(request)
    audio_bytes: bytes | None = None
    try:
        check_ai_rate_limit(request)
        audio_bytes = await read_audio_upload(audio, language_hint)
        if expected_version < 1:
            raise ApiError(422, "SCHEMA_INVALID", "expected_version이 필요합니다.")
        client = db_client()
        session = one_row(client.table("work_sessions").select("current_version,status").eq("id", session_id).execute())
        if session["status"] != "PUBLISHED" or session["current_version"] != expected_version:
            raise ApiError(409, "VERSION_CONFLICT", "최신 작업 버전을 다시 확인하세요.")
        transcript = await ai_transcribe_audio(
            audio_bytes,
            filename=audio.filename or "audio",
            content_type=audio.content_type or "audio/webm",
            language_hint=language_hint,
        )
        return parse_quantity_output(await ai_quantity_change_transcript(transcript, expected_version), expected_version)
    finally:
        if audio_bytes is not None:
            del audio_bytes
        await audio.close()


@app.post("/api/v1/work-sessions/{sessionId}/quantity-changes/confirm", status_code=201, response_model=OwnerWorkSession)
async def confirm_quantity_change(
    sessionId: str,
    payload: QuantityChangeConfirmRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> OwnerWorkSession:
    session_id = sessionId
    require_owner(batmeori_owner_session)
    require_origin(request)
    require_idempotency(idempotency_key)
    client = db_client()
    try:
        result = client.rpc(
            "publish_quantity_change",
            {
                "p_session_id": session_id,
                "p_expected_version": payload.expected_version,
                "p_quantity": jsonable(payload.quantity),
            },
        ).execute()
    except Exception:
        raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
    if not row_data(result):
        raise ApiError(409, "VERSION_CONFLICT", "최신 작업 버전을 다시 확인하세요.")
    session = one_row(client.table("work_sessions").select("*").eq("id", session_id).execute())
    version = one_row(
        client.table("work_versions")
        .select("*")
        .eq("work_session_id", session_id)
        .eq("version", session["current_version"])
        .execute()
    )
    cache_published_tts(client, parse_version(version).state)
    return owner_session_response(client, session, version)


@app.post("/api/v1/work-teams/today", response_model=TodayWorkTeam)
async def create_today_team(
    request: Request,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> TodayWorkTeam:
    require_owner(batmeori_owner_session)
    require_origin(request)
    issue_key = require_idempotency(idempotency_key)
    client = db_client()
    work_date, expires_at = today_seoul()
    rows = row_data(client.table("today_work_teams").select("*").eq("work_date", work_date).limit(1).execute())
    created = not rows
    team_row = rows[0] if rows else {"id": str(uuid.uuid4())}
    team_id = str(team_row["id"])
    token = hmac.new(
        settings.owner_session_secret.encode(),
        f"today-team:{team_id}:{issue_key}".encode(),
        hashlib.sha256,
    ).hexdigest()
    invite = {
        "id": team_id,
        "work_date": work_date,
        "invite_token_hash": hash_link_token(token),
        "invite_issue_idempotency_key": issue_key,
        "issued_at": now_utc().isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    try:
        if created:
            result = client.table("today_work_teams").insert(invite).select("*").execute()
            team_row = one_row(result)
        elif team_row.get("invite_issue_idempotency_key") == issue_key:
            token = hmac.new(
                settings.owner_session_secret.encode(),
                f"today-team:{team_id}:{issue_key}".encode(),
                hashlib.sha256,
            ).hexdigest()
        else:
            result = client.table("today_work_teams").update(invite).eq("id", team_id).select("*").execute()
            team_row = one_row(result)
    except Exception:
        if not created:
            raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
        team_row = one_row(client.table("today_work_teams").select("*").eq("work_date", work_date).limit(1).execute())
        team_id = str(team_row["id"])
        token = hmac.new(
            settings.owner_session_secret.encode(),
            f"today-team:{team_id}:{issue_key}".encode(),
            hashlib.sha256,
        ).hexdigest()
        result = client.table("today_work_teams").update(
            {**invite, "id": team_id, "invite_token_hash": hash_link_token(token)}
        ).eq("id", team_id).select("*").execute()
        team_row = one_row(result)
    response.status_code = 201 if created else 200
    origin = request.headers["origin"].rstrip("/")
    return today_team_response(client, team_row, f"{origin}/team/{token}")


@app.get("/api/v1/work-teams/today", response_model=TodayWorkTeam)
async def get_today_team(
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> TodayWorkTeam:
    require_owner(batmeori_owner_session)
    work_date, _ = today_seoul()
    client = db_client()
    team_row = one_row(client.table("today_work_teams").select("*").eq("work_date", work_date).limit(1).execute())
    return today_team_response(client, team_row)


@app.post("/api/v1/work-team-invites/{token}/join", status_code=201, response_model=TeamMember)
async def join_today_team(
    token: str,
    payload: JoinTeamRequest,
    request: Request,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> TeamMember:
    check_team_join_rate_limit(request)
    join_key = require_idempotency(idempotency_key)
    client = db_client()
    team_row = one_row(
        client.table("today_work_teams")
        .select("*")
        .eq("invite_token_hash", hash_link_token(token))
        .limit(1)
        .execute(),
        "ACCESS_DENIED",
    )
    expires_at = utc_datetime(team_row["expires_at"])
    if expires_at <= now_utc():
        raise ApiError(410, "LINK_EXPIRED", "참여 시간이 끝났습니다. QR을 다시 열어주세요.")
    rows = row_data(
        client.table("today_work_team_members")
        .select("*")
        .eq("team_id", team_row["id"])
        .eq("join_idempotency_key", join_key)
        .limit(1)
        .execute()
    )
    if rows:
        member_row = rows[0]
    else:
        try:
            member_row = one_row(
                client.table("today_work_team_members")
                .insert(
                    {
                        "team_id": team_row["id"],
                        "display_name": payload.display_name,
                        "language_code": payload.language_code,
                        "join_idempotency_key": join_key,
                    }
                )
                .select("*")
                .execute()
            )
        except Exception:
            member_row = one_row(
                client.table("today_work_team_members")
                .select("*")
                .eq("team_id", team_row["id"])
                .eq("join_idempotency_key", join_key)
                .limit(1)
                .execute()
            )
    response.set_cookie(
        TEAM_MEMBER_COOKIE_NAME,
        sign_team_member(str(team_row["id"]), str(member_row["id"]), expires_at),
        httponly=True,
        secure=True,
        samesite="none",
        max_age=max(1, int((expires_at - now_utc()).total_seconds())),
        path="/",
    )
    return TeamMember(
        member_id=str(member_row["id"]),
        display_name=member_row["display_name"],
        language_code=member_row["language_code"],
        joined_at=member_row["joined_at"],
    )


@app.post("/api/v1/work-teams/today/members/{memberId}/assignments", status_code=201, response_model=TeamAssignmentMeta)
async def assign_today_team_member(
    memberId: str,
    payload: TeamAssignmentRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> TeamAssignmentMeta:
    require_owner(batmeori_owner_session)
    require_origin(request)
    require_idempotency(idempotency_key)
    client = db_client()
    work_date, _ = today_seoul()
    team_row = one_row(client.table("today_work_teams").select("id").eq("work_date", work_date).limit(1).execute())
    one_row(
        client.table("today_work_team_members")
        .select("id")
        .eq("id", memberId)
        .eq("team_id", team_row["id"])
        .limit(1)
        .execute()
    )
    one_row(
        client.table("work_sessions")
        .select("id")
        .eq("id", payload.work_session_id)
        .eq("status", "PUBLISHED")
        .limit(1)
        .execute()
    )
    rows = row_data(
        client.table("today_work_assignments")
        .select("*")
        .eq("team_member_id", memberId)
        .eq("work_session_id", payload.work_session_id)
        .is_("revoked_at", "null")
        .limit(1)
        .execute()
    )
    if rows:
        assignment = rows[0]
    else:
        try:
            assignment = one_row(
                client.table("today_work_assignments")
                .insert({"team_member_id": memberId, "work_session_id": payload.work_session_id})
                .select("*")
                .execute()
            )
        except Exception:
            assignment = one_row(
                client.table("today_work_assignments")
                .select("*")
                .eq("team_member_id", memberId)
                .eq("work_session_id", payload.work_session_id)
                .is_("revoked_at", "null")
                .limit(1)
                .execute()
            )
    return TeamAssignmentMeta(member_id=memberId, work_session_id=payload.work_session_id, assigned_at=assignment["assigned_at"])


@app.get("/api/v1/work-team-members/me/assignments", response_model=TeamAssignmentsResponse)
async def get_my_today_assignments(
    batmeori_team_member: str | None = Cookie(default=None, alias=TEAM_MEMBER_COOKIE_NAME),
) -> TeamAssignmentsResponse:
    team_id, member_id = require_team_member(batmeori_team_member)
    client = db_client()
    team_row = one_row(client.table("today_work_teams").select("expires_at").eq("id", team_id).limit(1).execute(), "UNAUTHORIZED")
    if utc_datetime(team_row["expires_at"]) <= now_utc():
        raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")
    member = one_row(
        client.table("today_work_team_members")
        .select("language_code")
        .eq("id", member_id)
        .eq("team_id", team_id)
        .limit(1)
        .execute(),
        "UNAUTHORIZED",
    )
    assignment_rows = row_data(
        client.table("today_work_assignments")
        .select("work_session_id")
        .eq("team_member_id", member_id)
        .is_("revoked_at", "null")
        .order("assigned_at")
        .execute()
    )
    return TeamAssignmentsResponse(
        assignments=[worker_assignment_for_session(client, str(row["work_session_id"]), member["language_code"]) for row in assignment_rows]
    )


@app.post("/api/v1/work-sessions/{sessionId}/worker-links", status_code=201, response_model=WorkerLinkIssueResponse)
async def issue_worker_link(
    sessionId: str,
    payload: WorkerLinkIssueRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> WorkerLinkIssueResponse:
    session_id = sessionId
    require_owner(batmeori_owner_session)
    require_origin(request)
    issue_key = require_idempotency(idempotency_key)
    client = db_client()
    one_row(
        client.table("work_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("status", "PUBLISHED")
        .execute()
    )
    link_row, issued = issue_link(payload.language_code)
    link_row["issue_idempotency_key"] = issue_key
    try:
        client.rpc(
            "issue_worker_link",
            {
                "p_session_id": session_id,
                "p_language_code": payload.language_code,
                "p_link": link_row,
            },
        ).execute()
    except Exception:
        raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
    return WorkerLinkIssueResponse(session_id=session_id, issued_worker_links=[issued])


@app.get("/api/v1/worker-links/{token}/assignment", response_model=WorkerAssignment)
async def get_worker_assignment(token: str) -> WorkerAssignment:
    if len(token) < 32 or not settings.owner_session_secret:
        raise ApiError(404, "ACCESS_DENIED", "접근할 수 없습니다.")
    client = db_client()
    row = one_row(
        client.table("worker_links")
        .select("work_session_id,language_code,expires_at,revoked_at")
        .eq("token_hash", hash_link_token(token))
        .limit(1)
        .execute(),
        "ACCESS_DENIED",
    )
    if row.get("revoked_at") is not None:
        raise ApiError(404, "ACCESS_DENIED", "접근할 수 없습니다.")
    expires_at = row["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    if expires_at <= now_utc():
        raise ApiError(410, "LINK_EXPIRED", "접근할 수 없습니다. 링크를 다시 발급받으세요.")
    session = one_row(
        client.table("work_sessions")
        .select("id,current_version,status")
        .eq("id", row["work_session_id"])
        .eq("status", "PUBLISHED")
        .execute(),
        "ACCESS_DENIED",
    )
    version = one_row(
        client.table("work_versions")
        .select("*")
        .eq("work_session_id", session["id"])
        .eq("version", session["current_version"])
        .eq("status", "PUBLISHED")
        .execute(),
        "ACCESS_DENIED",
    )
    parsed = parse_version(version)
    language_code = row["language_code"]
    state = localized_worker_state(parsed.state, language_code, client)
    badges: list[str] = []
    if parsed.ambiguity_override or state.location.kind == "DEICTIC":
        badges.append("확인이 필요한 지시")
    translations = [translation for step in state.steps for translation in step.translations]
    return WorkerAssignment(
        language_code=language_code,
        session_id=str(session["id"]),
        version=parsed.version,
        state=state,
        badges=badges,
        source_detail=translations,
    )


@app.get("/api/v1/brief", response_model=Briefing)
async def get_brief(
    session_id: str,
    language_code: str,
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> Briefing:
    require_owner(batmeori_owner_session)
    if language_code not in LANGUAGES:
        raise ApiError(422, "SCHEMA_INVALID", "지원하지 않는 언어입니다.")
    client = db_client()
    session = one_row(
        client.table("work_sessions")
        .select("id,current_version,status")
        .eq("id", session_id)
        .eq("status", "PUBLISHED")
        .execute()
    )
    version = one_row(
        client.table("work_versions")
        .select("*")
        .eq("work_session_id", session_id)
        .eq("version", session["current_version"])
        .eq("status", "PUBLISHED")
        .execute()
    )
    state = localized_state(parse_version(version).state, language_code, client)
    return Briefing(
        session_id=session_id,
        version=session["current_version"],
        language_code=language_code,
        steps=state.steps,
    )
