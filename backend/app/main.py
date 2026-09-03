from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import struct
import time
import uuid
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from fastapi import Cookie, FastAPI, File, Form, Header, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from supabase import Client, create_client

from .ai import AiProviderError, bridge_call, provider_ready
from .p0_runtime import OwnerIdentity, sign_owner_cookie, verify_owner_cookie


TASK_CODES_BY_FAMILY = {
    "ONION": {"ONION_HARVEST", "ONION_TRIMMING", "ONION_SORTING", "ONION_TRANSPORT"},
    "STRAWBERRY": {"STRAWBERRY_HARVEST", "STRAWBERRY_SORTING", "STRAWBERRY_INSPECTION", "STRAWBERRY_PACKING"},
}
TASK_CODES = set().union(*TASK_CODES_BY_FAMILY.values())
INITIAL_CROP_PATTERN = re.compile(r"양파|딸기")
LEGACY_TASK_CODES_BY_FAMILY = {
    "ONION": {"ONION_COLLECT", "BAGGING", "LOADING", "WAREHOUSE_TRANSPORT", "STACKING"},
    "STRAWBERRY": set(),
}
LANGUAGES = {"vi", "ne"}
OVERRIDE_REASONS = {
    "EXPERIENCED_WORKER",
    "IN_PERSON_BRIEFING",
    "OWNER_ACCEPTED_OTHER",
}
COOKIE_NAME = "batmeori_owner_session"
TEAM_MEMBER_COOKIE_NAME = "batmeori_team_member"
MAX_AUDIO_BYTES = 10 * 1024 * 1024
PIN_FAILURE_WINDOW_SECONDS = 300
PIN_FAILURE_LIMIT = 5
AI_REQUEST_WINDOW_SECONDS = 60
AI_REQUEST_LIMIT = 12
TEAM_JOIN_REQUEST_LIMIT = 12

# ponytail: process-local rate limit; use a shared limiter before multi-worker deployment.
pin_failures: dict[tuple[str, str], list[float]] = {}
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


def valid_public_url(value: str) -> bool:
    parsed = urlsplit(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc) and not parsed.username and not parsed.password


class Settings:
    def __init__(self) -> None:
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_secret_key = os.getenv("SUPABASE_SECRET_KEY", "")
        self.owner_session_secret = os.getenv("OWNER_SESSION_SECRET", "")
        self.owner_session_ttl_seconds = int(os.getenv("OWNER_SESSION_TTL_SECONDS", "7200"))
        self.frontend_origins = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
        self.public_web_base_url = os.getenv("PUBLIC_WEB_BASE_URL", "").rstrip("/")
        self.public_api_base_url = os.getenv("PUBLIC_API_BASE_URL", "").rstrip("/")
        self.demo_fallback = os.getenv("DEMO_FALLBACK", "0").lower() in {"1", "true", "yes"}
        self.app_revision = os.getenv("APP_REVISION") or os.getenv("RENDER_GIT_COMMIT") or "local"

    @property
    def origins(self) -> list[str]:
        return [item.strip() for item in self.frontend_origins.split(",") if item.strip()]

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_secret_key)

    @property
    def auth_configured(self) -> bool:
        return bool(self.owner_session_secret)

    @property
    def public_web_configured(self) -> bool:
        if self.public_web_base_url:
            return valid_public_url(self.public_web_base_url)
        return self.demo_fallback and any(valid_public_url(origin) for origin in self.origins)

    @property
    def public_api_configured(self) -> bool:
        return valid_public_url(self.public_api_base_url)


settings = Settings()
app = FastAPI(
    title="Batmeori API",
    version="2.0.0",
    description="Provider-neutral P0 REST service for onion and strawberry work instructions.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Idempotency-Key"],
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
    def without_input(value: Any) -> Any:
        if isinstance(value, dict):
            return {key: without_input(item) for key, item in value.items() if key != "input"}
        if isinstance(value, (list, tuple)):
            return [without_input(item) for item in value]
        return value

    errors = [without_input(error) for error in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={
            "code": "SCHEMA_INVALID",
            "message": "입력 형식이 올바르지 않습니다.",
            "details": {"errors": errors},
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
    schema_version: str = "2"
    contract_version: str = "structure-v2"
    ontology_version: str = "ontology-v2"


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
    farm_code: str = Field(min_length=3, max_length=32, pattern=r"^[a-z0-9][a-z0-9-]{2,31}$")
    pin: str = Field(min_length=4, max_length=32)

    @field_validator("farm_code", mode="before")
    @classmethod
    def normalized_farm_code(cls, value: Any) -> Any:
        normalized = value.strip().lower() if isinstance(value, str) else value
        if not normalized:
            raise ValueError("farm_code is required")
        return normalized


class OwnerFarm(StrictModel):
    code: str
    display_name: str


class OwnerSession(StrictModel):
    authenticated: bool = True
    expires_at: datetime
    farm: OwnerFarm


class WorkDraft(StrictModel):
    draft_id: str
    draft_revision: int
    summary_ko: str
    interpretation: str
    state: WorkState
    ambiguities: list[Ambiguity]
    transcript: str
    schema_version: str = "2"
    contract_version: str = "structure-v2"
    ontology_version: str = "ontology-v2"


class DraftConfirmRequest(StrictModel):
    expected_version: int = Field(ge=0, le=0)
    decision: str
    ambiguity_override: bool = False
    override_reason: str | None = None

    @field_validator("decision")
    @classmethod
    def valid_decision(cls, value: str) -> str:
        if value not in {"CONFIRM", "PUBLISH_AS_IS"}:
            raise ValueError("invalid decision")
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
    contract_version: str
    ontology_version: str
    lifecycle: str = "PUBLISHED"
    version: WorkVersion
    worker_link_meta: list[WorkerLinkMeta] = Field(default_factory=list)


class InitialPublishResponse(StrictModel):
    work_session: OwnerWorkSession
    issued_worker_links: list[IssuedWorkerLink]


class WorkerLinkIssueResponse(StrictModel):
    session_id: str
    issued_worker_links: list[IssuedWorkerLink]


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
    join_url: str
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
    assignments: list[dict[str, Any]] = Field(default_factory=list)


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


class StructureOutputV2(StrictModel):
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
    schema_version: Literal["2"]
    contract_version: Literal["structure-v2"]
    ontology_version: Literal["ontology-v2"]

    @model_validator(mode="after")
    def validate_contract(self) -> "StructureOutputV2":
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


def parse_state(raw: Any, allow_legacy: bool = False) -> WorkState:
    if not isinstance(raw, dict):
        raise ApiError(422, "SCHEMA_INVALID", "작업 상태 형식이 올바르지 않습니다.")
    if raw.get("contract_version") == "structure-v2" and "interpretation" in raw:
        validate_contract_schema(raw, "structure-v2.schema.json")
        try:
            output = StructureOutputV2.model_validate(raw)
        except ValidationError as exc:
            raise ApiError(422, "SCHEMA_INVALID", "입력 형식이 올바르지 않습니다.", {"errors": exc.errors()})
        state = work_state_from_structure_v2(output)
        validate_state(state, allow_unsupported=True, for_publish=False, allow_legacy=allow_legacy)
        return state
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
    validate_state(state, allow_unsupported=True, for_publish=False, allow_legacy=allow_legacy)
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


def deterministic_risk(transcript: str, output: StructureOutputV2) -> RiskAssessment:
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


def work_state_from_structure_v2(output: StructureOutputV2, transcript: str = "") -> WorkState:
    location_display = "장소 미지정"
    if output.location.kind == "DEICTIC":
        location_display = output.location.raw_text or "농장주가 가리킨 곳"
    elif output.location.kind == "NAMED":
        location_display = output.location.canonical_name or output.location.raw_text or "장소 미지정"
    return WorkState(
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
        schema_version="2",
        contract_version="structure-v2",
        ontology_version="ontology-v2",
    )


async def parse_structure_output(raw: Any, transcript: str = "") -> tuple[WorkState, list[Ambiguity], str]:
    validate_contract_schema(raw, "structure-v2.schema.json")
    try:
        output = StructureOutputV2.model_validate(raw)
    except ValidationError as exc:
        raise ApiError(422, "SCHEMA_INVALID", "AI 구조화 결과 형식이 올바르지 않습니다.", {"errors": exc.errors()})

    state = work_state_from_structure_v2(output, transcript)
    validate_state(state, allow_unsupported=True, for_publish=False)
    if state.risk_assessment.level != "LOW" or any(item.kind == "SAFETY" for item in output.ambiguities):
        raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "안전 또는 실행 단계 조건을 충족하지 않습니다.")
    ambiguities = [
        item.model_copy(update={"blocking": True})
        if item.kind in {"TASK", "QUANTITY", "SAFETY"}
        else item
        for item in output.ambiguities
    ]
    if state.location.kind == "DEICTIC" and not any(item.kind == "LOCATION" for item in ambiguities):
        ambiguities.append(Ambiguity(
            field="location", message="가리킨 장소를 현장에서 함께 확인하면 됩니다.", blocking=False, kind="LOCATION",
        ))
    interpretation = "AMBIGUOUS" if output.interpretation == "READY" and ambiguities else output.interpretation
    return state, ambiguities, interpretation


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


def replace_quantity_for_v2(state: WorkState, quantity: Quantity) -> WorkState:
    state_data = state.model_dump(mode="json")
    state_data["quantity"] = quantity.model_dump(mode="json")
    return WorkState.model_validate(state_data)


def draft_summary(state: WorkState) -> str:
    quantity = state.quantity
    quantity_text = "수량 미지정"
    if isinstance(quantity, Quantity):
        quantity_text = f"{quantity.value}{quantity.unit}"
    location_text = state.location_display
    crop = "양파" if state.task_family == "ONION" else "딸기"
    task_text = " · ".join(step.title_ko for step in state.steps) or "작업 미지정"
    return f"{location_text} · {crop} {quantity_text} · {task_text}"


def validate_state(
    state: WorkState, allow_unsupported: bool, for_publish: bool, allow_legacy: bool = False
) -> None:
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
        elif step.task_code in TASK_CODES:
            if step.task_code not in TASK_CODES_BY_FAMILY[state.task_family]:
                raise ApiError(422, "SCHEMA_INVALID", "작업 코드와 작물 범주가 일치하지 않습니다.")
        elif not allow_legacy or step.task_code not in LEGACY_TASK_CODES_BY_FAMILY[state.task_family]:
            raise ApiError(422, "SCHEMA_INVALID", "지원하지 않는 작업 코드입니다.")
        if step.task_code is not None and step.unsupported_reason is not None:
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
    if row.get("contract_version") != "structure-v2" or row.get("ontology_version") != "ontology-v2":
        raise ApiError(422, "LEGACY_READ_ONLY", "기존 v1 초안은 읽기 전용입니다.")
    return WorkDraft(
        draft_id=str(row["id"]),
        draft_revision=row["draft_revision"],
        summary_ko=row["summary_ko"],
        interpretation=row["interpretation"],
        state=parse_state(row["state_json"]),
        ambiguities=ambiguities,
        transcript=row.get("transcript") or "",
        schema_version="2",
        contract_version="structure-v2",
        ontology_version="ontology-v2",
    )


def parse_version(row: dict[str, Any]) -> WorkVersion:
    return WorkVersion(
        version=row["version"],
        lifecycle=row["status"],
        state=parse_state(row["state_json"], allow_legacy=True),
        ambiguity_override=bool(row.get("ambiguity_override", False)),
        override_reason=row.get("override_reason"),
        overridden_at=row.get("overridden_at"),
        transcript=row.get("transcript"),
    )


def localized_worker_state(state: WorkState, language_code: str, client: Client | None = None) -> WorkerState:
    worker_only = {"risk_assessment", "schema_version", "contract_version", "ontology_version"}
    state_data = state.model_dump(exclude=worker_only)
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
    return WorkerState.model_validate(state_data)


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


def today_team_response(client: Client, team_row: dict[str, Any], join_url: str) -> TodayWorkTeam:
    return TodayWorkTeam(
        team_id=str(team_row["id"]),
        work_date=str(team_row["work_date"]),
        join_url=join_url,
        expires_at=team_row["expires_at"],
        members=team_members(client, str(team_row["id"])),
    )


def owner_session_response(client: Client, session_row: dict[str, Any], version_row: dict[str, Any]) -> OwnerWorkSession:
    return OwnerWorkSession(
        session_id=str(session_row["id"]),
        current_version=session_row["current_version"],
        contract_version=session_row.get("contract_version") or "structure-v1",
        ontology_version=session_row.get("ontology_version") or "ontology-v1",
        version=parse_version(version_row),
        worker_link_meta=worker_link_meta(client, str(session_row["id"])),
    )


def sign_session(identity: OwnerIdentity) -> str:
    return sign_owner_cookie(identity, settings.owner_session_secret)


def verify_session(value: str | None) -> OwnerIdentity | None:
    return verify_owner_cookie(value, settings.owner_session_secret)


def require_owner(cookie: str | None) -> OwnerIdentity:
    identity = verify_session(cookie)
    if identity is None:
        raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")
    return identity


def require_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if not origin or origin not in settings.origins:
        raise ApiError(403, "UNAUTHORIZED", "허용되지 않은 요청입니다.")


def client_address(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def pin_failure_key(request: Request, farm_code: str) -> tuple[str, str]:
    return client_address(request), farm_code


def check_pin_rate_limit(request: Request, farm_code: str) -> None:
    now = time.time()
    key = pin_failure_key(request, farm_code)
    recent = [timestamp for timestamp in pin_failures.get(key, []) if now - timestamp < PIN_FAILURE_WINDOW_SECONDS]
    pin_failures[key] = recent
    if len(recent) >= PIN_FAILURE_LIMIT:
        raise ApiError(429, "RATE_LIMITED", "잠시 후 다시 시도하세요.")


def record_pin_failure(request: Request, farm_code: str) -> None:
    pin_failures.setdefault(pin_failure_key(request, farm_code), []).append(time.time())


def clear_pin_failures(request: Request, farm_code: str) -> None:
    pin_failures.pop(pin_failure_key(request, farm_code), None)


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


def today_team_token(team_id: str, issue_key: str) -> str:
    if not team_id or not issue_key:
        raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
    return hmac.new(
        settings.owner_session_secret.encode(),
        f"today-team:{team_id}:{issue_key}".encode(),
        hashlib.sha256,
    ).hexdigest()


def today_team_join_url(team_row: dict[str, Any], request: Request) -> str:
    token = today_team_token(str(team_row["id"]), str(team_row["invite_issue_idempotency_key"]))
    public_web_base_url = settings.public_web_base_url or request.headers.get("origin", "").rstrip("/")
    if not public_web_base_url:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "공개 웹 주소가 준비되지 않았습니다.")
    return f"{public_web_base_url}/team/{token}"


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


def normalized_audio_content_type(content_type: str | None) -> str:
    return (content_type or "").partition(";")[0].strip().lower()


async def read_audio_upload(upload: UploadFile, language_hint: str = "ko") -> bytes:
    upload_type = normalized_audio_content_type(upload.content_type)
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


async def node_transcript(audio: bytes, filename: str, content_type: str, language_hint: str) -> str:
    try:
        result = await bridge_call(
            "TRANSCRIBE_AUDIO",
            {
                "audio_base64": base64.b64encode(audio).decode(),
                "filename": filename,
                "content_type": normalized_audio_content_type(content_type),
                "language_hint": language_hint,
            },
        )
    except AiProviderError as exc:
        if exc.code == "AUDIO_UNCLEAR":
            raise ApiError(422, "AUDIO_UNCLEAR", "음성을 확인하지 못했습니다. 녹음을 재생해 확인하고 다시 녹음해주세요.") from exc
        raise
    transcript = result.get("transcript")
    if not isinstance(transcript, str) or not transcript.strip():
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "AI 제공자가 준비되지 않았습니다.")
    transcript = transcript.strip()
    if len(re.findall(r"[가-힣]", transcript)) < 2:
        raise ApiError(422, "AUDIO_UNCLEAR", "한국어 음성을 확인하지 못했습니다. 마이크 입력을 확인하고 다시 녹음해주세요.")
    return transcript


def require_initial_instruction(transcript: str) -> None:
    if not INITIAL_CROP_PATTERN.search(transcript):
        raise ApiError(422, "AUDIO_UNCLEAR", "지원하는 작물명을 확인하지 못했습니다. 녹음을 들어본 뒤 다시 말씀해주세요.")


def current_assets(client: Client) -> list[dict[str, Any]]:
    return row_data(
        client.table("visual_assets")
        .select(
            "id,task_code,asset_type,content_type,public_path,provenance,review_status,safety_level,is_current,captions_text"
        )
        .eq("review_status", "APPROVED")
        .eq("safety_level", "LOW")
        .eq("is_current", True)
        .execute()
    )


def current_verified_guides(client: Client) -> list[dict[str, Any]]:
    """Load verified guide data; Node performs the per-step lookup and translation decision."""
    try:
        phrases = row_data(
            client.table("guide_phrases")
            .select("phrase_key,canonical_ko,source_page,source_url,license")
            .eq("verified", True)
            .execute()
        )
        phrase_keys = [str(phrase["phrase_key"]) for phrase in phrases]
        if not phrase_keys:
            return []
        translations = row_data(
            client.table("guide_translations")
            .select("phrase_key,language_code,translated_text")
            .in_("phrase_key", phrase_keys)
            .in_("language_code", sorted(LANGUAGES))
            .eq("verified", True)
            .execute()
        )
    except Exception as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "가이드 데이터를 확인할 수 없습니다.") from exc
    phrase_by_key = {str(phrase["phrase_key"]): phrase for phrase in phrases}
    guides: list[dict[str, Any]] = []
    for translation in translations:
        phrase = phrase_by_key.get(str(translation.get("phrase_key")))
        if phrase is None:
            continue
        guides.append(
            {
                "phrase_key": phrase["phrase_key"],
                "canonical_ko": phrase["canonical_ko"],
                "language_code": translation["language_code"],
                "translated_text": translation["translated_text"],
                "source_page": phrase["source_page"],
                "source_url": phrase["source_url"],
                "license": phrase["license"],
                "verified": True,
            }
        )
    return guides


def structure_v2_state_json(
    state: WorkState,
    interpretation: str,
    summary_ko: str,
    ambiguities: list[Ambiguity],
) -> dict[str, Any]:
    return {
        "interpretation": interpretation,
        "summary_ko": summary_ko,
        "location": state.location.model_dump(mode="json"),
        "task_family": state.task_family,
        "quantity": jsonable(state.quantity),
        "deadline": state.deadline,
        "safety": state.safety,
        "notes": state.notes,
        "steps": [
            {
                "sequence": step.sequence,
                "task_code": step.task_code,
                "title_ko": step.title_ko,
                "description_ko": step.description_ko,
                "unsupported_reason": step.unsupported_reason,
            }
            for step in state.steps
        ],
        "ambiguities": [item.model_dump(mode="json") for item in ambiguities],
        "schema_version": "2",
        "contract_version": "structure-v2",
        "ontology_version": "ontology-v2",
    }


def structure_v2_work_input(
    state: WorkState,
    session_id: str,
    version: int,
    interpretation: str,
    summary_ko: str,
    ambiguities: list[Ambiguity],
) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "version": version,
        **structure_v2_state_json(state, interpretation, summary_ko, ambiguities),
    }


def tts_url(text_hash: str, language_code: str) -> str | None:
    if settings.public_api_base_url:
        return f"{settings.public_api_base_url}/api/v1/tts/{text_hash}/{language_code}"
    return None


def tts_fallback(briefing: dict[str, Any]) -> dict[str, Any]:
    result = dict(briefing)
    result["tts"] = {"status": "FALLBACK", "text_hash": briefing.get("tts", {}).get("text_hash"), "audio_url": None}
    result["badges"] = list(dict.fromkeys([*briefing.get("badges", []), "TEXT_TTS_FALLBACK"]))
    result["steps"] = [
        {**step, "delivery_mode": "TEXT"} if step.get("delivery_mode") == "TEXT_TTS" else step
        for step in briefing.get("steps", [])
    ]
    return result


def worker_tts_text(briefing: dict[str, Any]) -> str:
    context = briefing.get("context")
    steps = briefing.get("steps")
    if not isinstance(context, dict) or not isinstance(context.get("safety"), list) or not isinstance(steps, list):
        raise ApiError(422, "SCHEMA_INVALID", "AI TTS 입력이 올바르지 않습니다.")
    texts = [*context["safety"]]
    for step in steps:
        if not isinstance(step, dict):
            raise ApiError(422, "SCHEMA_INVALID", "AI TTS 입력이 올바르지 않습니다.")
        title, description = step.get("title"), step.get("description")
        if not isinstance(title, str) or not isinstance(description, str):
            raise ApiError(422, "SCHEMA_INVALID", "AI TTS 입력이 올바르지 않습니다.")
        texts.append(f"{title} {description}")
    if any(not isinstance(text, str) or not text.strip() for text in texts):
        raise ApiError(422, "SCHEMA_INVALID", "AI TTS 입력이 올바르지 않습니다.")
    return "\n".join(texts)


def finalize_tts_package(client: Client, language_code: str, package: dict[str, Any]) -> dict[str, Any]:
    briefing = package.get("briefing") if isinstance(package, dict) else None
    transport = package.get("tts_transport") if isinstance(package, dict) else None
    if not isinstance(briefing, dict) or not isinstance(transport, dict):
        raise ApiError(422, "SCHEMA_INVALID", "AI TTS 결과가 올바르지 않습니다.")
    text = transport.get("text")
    text_hash = transport.get("text_hash")
    if (
        transport.get("status") not in {"READY", "FALLBACK"}
        or not isinstance(text, str)
        or text != worker_tts_text(briefing)
        or not isinstance(text_hash, str)
        or not hmac.compare_digest(text_hash, hashlib.sha256(text.encode()).hexdigest())
        or text_hash != briefing.get("tts", {}).get("text_hash")
    ):
        raise ApiError(422, "SCHEMA_INVALID", "AI TTS 결과가 올바르지 않습니다.")
    if transport.get("status") != "READY":
        return tts_fallback(briefing)
    audio_base64 = transport.get("audio_bytes_base64")
    audio_location = tts_url(text_hash, language_code) if isinstance(text_hash, str) else None
    if not isinstance(text_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", text_hash) or not isinstance(audio_base64, str) or audio_location is None:
        return tts_fallback(briefing)
    try:
        audio_bytes = base64.b64decode(audio_base64, validate=True)
    except (ValueError, binascii.Error):
        return tts_fallback(briefing)
    if not audio_bytes or len(audio_bytes) > MAX_AUDIO_BYTES:
        return tts_fallback(briefing)
    try:
        client.table("tts_assets").upsert(
            {
                "text_hash": text_hash,
                "language_code": language_code,
                "audio_bytes": f"\\x{audio_bytes.hex()}",
                "content_type": "audio/mpeg",
            },
            on_conflict="text_hash,language_code",
        ).execute()
    except Exception:
        return tts_fallback(briefing)
    finally:
        del audio_bytes
    result = dict(briefing)
    result["tts"] = {"status": "READY", "text_hash": text_hash, "audio_url": audio_location}
    return result


def validate_worker_briefing(
    package: dict[str, Any], language_code: str, session_id: str, version: int, state: WorkState
) -> None:
    validate_contract_schema(package, "worker-briefing-v2.schema.json")
    if package["language_code"] != language_code or package["session_id"] != session_id or package["version"] != version:
        raise ApiError(422, "SCHEMA_INVALID", "근로자 안내 패키지 식별자가 일치하지 않습니다.")

    expected_steps = [(step.sequence, step.task_code) for step in state.steps]
    package_steps = [(step["sequence"], step["task_code"]) for step in package["steps"]]
    if package_steps != expected_steps:
        raise ApiError(422, "SCHEMA_INVALID", "근로자 안내 작업 단계가 원본과 일치하지 않습니다.")

    expected_sequences = {sequence for sequence, _ in expected_steps}
    action_details = [detail for detail in package["source_detail"] if detail["segment"] != "SAFETY"]
    source_sequences = [detail["step_sequence"] for detail in action_details]
    if (
        any(sequence not in expected_sequences for sequence in source_sequences)
        or source_sequences != sorted(source_sequences)
        or set(source_sequences) != expected_sequences
    ):
        raise ApiError(422, "SCHEMA_INVALID", "근로자 안내 출처 순서가 올바르지 않습니다.")

    safety_details = [detail for detail in package["source_detail"] if detail["segment"] == "SAFETY"]
    if len(safety_details) != len(package["context"]["safety"]) or any(
        detail["step_sequence"] is not None
        or detail["source"] != "OFFICIAL_GUIDE"
        or detail["guide_lookup"] != "HIT"
        or detail["verified"] is not True
        or not isinstance(detail["source_page"], int)
        or detail["source_page"] < 1
        or not isinstance(detail["source_url"], str)
        or not detail["source_url"].startswith(("http://", "https://"))
        or not isinstance(detail["license"], str)
        or not detail["license"].strip()
        for detail in safety_details
    ):
        raise ApiError(422, "OVERRIDE_NOT_ALLOWED", "안전 표현은 검증된 공식 가이드만 게시할 수 있습니다.")

    task_code_by_sequence = dict(expected_steps)
    video_sequences: set[int] = set()
    for video in package["video"]:
        sequence = video["step_sequence"]
        if sequence not in task_code_by_sequence or video["task_code"] != task_code_by_sequence[sequence] or sequence in video_sequences:
            raise ApiError(422, "SCHEMA_INVALID", "근로자 안내 영상이 작업 단계와 일치하지 않습니다.")
        video_sequences.add(sequence)

    text_fields: list[str] = [package["context"]["location_display"]]
    quantity = package["context"]["quantity"]
    if isinstance(quantity, dict):
        text_fields.append(str(quantity.get("unit", "")))
    text_fields.extend(value for value in (package["context"]["deadline"], package["context"]["notes"]) if value is not None)
    text_fields.extend(step["title"] for step in package["steps"])
    text_fields.extend(step["description"] for step in package["steps"])
    text_fields.extend(package["context"]["safety"])
    text_fields.extend(video["captions_text"] for video in package["video"])
    for text in text_fields:
        if not isinstance(text, str) or not text.strip() or re.search(r"[가-힣]", text) or (
            language_code == "vi" and re.search(r"[\u0900-\u097F]", text)
        ):
            raise ApiError(422, "SCHEMA_INVALID", "근로자 안내 언어가 선택한 언어와 일치하지 않습니다.")


def private_tts_bytes(value: Any) -> bytes | None:
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if not isinstance(value, str):
        return None
    try:
        if value.startswith("\\x"):
            return bytes.fromhex(value[2:])
        return base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        return None


async def build_worker_packages(
    client: Client,
    session_id: str,
    version: int,
    state: WorkState,
    interpretation: str,
    summary_ko: str,
    ambiguities: list[Ambiguity],
) -> list[dict[str, Any]]:
    work = structure_v2_work_input(state, session_id, version, interpretation, summary_ko, ambiguities)
    result = await bridge_call(
        "BUILD_WORKER_PACKAGES_V2",
        {
            "work": work,
            "languages": ["vi", "ne"],
            "assets": current_assets(client),
            "guides": current_verified_guides(client),
        },
    )
    packages: list[dict[str, Any]] = []
    for language_code in ("vi", "ne"):
        briefing = finalize_tts_package(client, language_code, result.get(language_code))
        validate_worker_briefing(briefing, language_code, session_id, version, state)
        packages.append(briefing)
    return packages


def legacy_worker_briefing(session_id: str, version: WorkVersion, language_code: str) -> dict[str, Any]:
    state = localized_worker_state(version.state, language_code)
    quantity = state.quantity
    quantity_display = f"{quantity.value} {quantity.unit}" if isinstance(quantity, Quantity) else "UNSPECIFIED"
    steps = []
    source_detail: list[dict[str, Any]] = []
    for step in state.steps:
        segments = [item.model_dump(mode="json") for item in step.translations]
        source_detail.extend(segments)
        text = " ".join(item["text"] for item in segments if item.get("text")) or step.description_ko
        steps.append(
            {
                "sequence": step.sequence,
                "task_code": step.task_code,
                "title": text,
                "description": text,
                "video": step.video.model_dump(mode="json") if step.video else None,
                "audio_url": None,
                "tts_status": "TEXT_FALLBACK",
                "tts_hash": None,
                "delivery_mode": step.delivery_mode,
                "unsupported_reason": step.unsupported_reason,
                "segments": segments,
            }
        )
    return {
        "session_id": session_id,
        "version": version.version,
        "contract_version": "structure-v1",
        "language_code": language_code,
        "lifecycle": "PUBLISHED",
        "context": {
            "location_display": state.location_display,
            "quantity_display": quantity_display,
            "deadline_display": state.deadline,
            "safety": state.safety,
            "notes": state.notes,
        },
        "steps": steps,
        "badge_codes": ["LEGACY_READ_ONLY"],
        "source_detail": source_detail,
    }


def stored_worker_briefing(client: Client, session_id: str, language_code: str, farm_id: str | None = None) -> dict[str, Any]:
    session_query = client.table("work_sessions").select("id,current_version,status,contract_version,ontology_version").eq("id", session_id).eq("status", "PUBLISHED")
    if farm_id is not None:
        session_query = session_query.eq("farm_id", farm_id)
    session = one_row(session_query.execute(), "ACCESS_DENIED")
    if session.get("contract_version") == "structure-v1" and session.get("ontology_version") == "ontology-v1":
        legacy_row = one_row(
            client.table("work_versions")
            .select("*")
            .eq("work_session_id", session["id"])
            .eq("version", session["current_version"])
            .eq("status", "PUBLISHED")
            .execute(),
            "ACCESS_DENIED",
        )
        return legacy_worker_briefing(str(session["id"]), parse_version(legacy_row), language_code)
    if session.get("contract_version") != "structure-v2" or session.get("ontology_version") != "ontology-v2":
        raise ApiError(422, "SCHEMA_INVALID", "알 수 없는 작업 계약입니다.")
    version = one_row(
        client.table("work_versions")
        .select("id,status,contract_version,ontology_version")
        .eq("work_session_id", session["id"])
        .eq("version", session["current_version"])
        .eq("status", "PUBLISHED")
        .execute(),
        "ACCESS_DENIED",
    )
    package = one_row(
        client.table("worker_briefing_packages")
        .select("package_json")
        .eq("work_version_id", version["id"])
        .eq("language_code", language_code)
        .execute(),
        "ACCESS_DENIED",
    ).get("package_json")
    validate_contract_schema(package, "worker-briefing-v2.schema.json")
    return package


def issue_link(language_code: str) -> tuple[dict[str, Any], IssuedWorkerLink]:
    issued_at = now_utc()
    expires_at = issued_at + timedelta(hours=24)
    token = secrets.token_urlsafe(32)
    if settings.public_web_base_url:
        public_web_base_url = settings.public_web_base_url
    elif settings.demo_fallback and settings.origins:
        public_web_base_url = settings.origins[0].rstrip("/")
    else:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "공개 웹 주소가 준비되지 않았습니다.")
    return (
        {
            "language_code": language_code,
            "token_hash": hash_link_token(token),
            "issued_at": issued_at.isoformat(),
            "expires_at": expires_at.isoformat(),
        },
        IssuedWorkerLink(
            language_code=language_code,
            url=f"{public_web_base_url}/w/{token}",
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
    return {"status": "ok", "revision": settings.app_revision}


@app.get("/ready")
async def ready() -> dict[str, str]:
    if not settings.supabase_configured or not settings.auth_configured or not settings.public_web_configured or not settings.public_api_configured or not provider_ready():
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "Supabase 또는 AI 제공자가 준비되지 않았습니다.")
    try:
        client = db_client()
        readiness = row_data(client.rpc("p0_readiness").execute())
        if not readiness or readiness[0].get("ready") is not True:
            raise RuntimeError("p0 migration not ready")
        client.table("worker_briefing_packages").select("work_version_id").limit(1).execute()
    except Exception:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "Supabase 또는 AI 제공자가 준비되지 않았습니다.")
    return {"status": "ready", "revision": settings.app_revision}


@app.post("/api/v1/owner/session", status_code=201, response_model=OwnerSession)
async def issue_owner_session(payload: PinLoginRequest, request: Request, response: Response) -> OwnerSession:
    require_origin(request)
    check_pin_rate_limit(request, payload.farm_code)
    if not settings.auth_configured:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "인증이 준비되지 않았습니다.")
    try:
        rows = row_data(
            db_client().rpc(
                "authenticate_farm_owner",
                {"p_farm_code": payload.farm_code, "p_pin": payload.pin},
            ).execute()
        )
    except Exception:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "인증이 준비되지 않았습니다.")
    if not rows:
        record_pin_failure(request, payload.farm_code)
        raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")
    owner = rows[0]
    expires_at = now_utc() + timedelta(seconds=settings.owner_session_ttl_seconds)
    identity = OwnerIdentity(str(owner["owner_id"]), str(owner["farm_id"]), int(expires_at.timestamp()))
    clear_pin_failures(request, payload.farm_code)
    expires_at = datetime.fromtimestamp(identity.expires_at, timezone.utc)
    response.set_cookie(
        COOKIE_NAME,
        sign_session(identity),
        max_age=settings.owner_session_ttl_seconds,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    return OwnerSession(
        expires_at=expires_at,
        farm=OwnerFarm(code=str(owner["farm_code"]), display_name=str(owner["farm_name"])),
    )


@app.get("/api/v1/owner/session", response_model=OwnerSession)
async def current_owner_session(
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> OwnerSession:
    owner = require_owner(batmeori_owner_session)
    try:
        farm = one_row(
            db_client().table("farms").select("slug,display_name").eq("id", owner.farm_id).limit(1).execute(),
            "UNAUTHORIZED",
        )
    except ApiError as exc:
        if exc.code == "UNAUTHORIZED":
            raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.") from exc
        raise
    return OwnerSession(
        expires_at=datetime.fromtimestamp(owner.expires_at, timezone.utc),
        farm=OwnerFarm(code=str(farm["slug"]), display_name=str(farm["display_name"])),
    )


@app.delete("/api/v1/owner/session", status_code=204)
async def delete_owner_session(request: Request, response: Response) -> Response:
    require_origin(request)
    response.delete_cookie(
        COOKIE_NAME,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    response.status_code = 204
    return response


@app.post("/api/v1/work-sessions/drafts/from-audio", response_model=WorkDraft)
async def draft_from_audio(
    request: Request,
    audio: UploadFile = File(...),
    language_hint: str = Form("ko"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> WorkDraft:
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    require_idempotency(idempotency_key)
    check_ai_rate_limit(request)
    audio_bytes: bytes | None = None
    try:
        audio_bytes = await read_audio_upload(audio, language_hint)
        transcript = await node_transcript(
            audio_bytes, audio.filename or "audio", audio.content_type or "audio/webm", language_hint
        )
        require_initial_instruction(transcript)
        state, ambiguities, interpretation = await parse_structure_output(
            await bridge_call("BUILD_OWNER_DRAFT_V2", {"transcript": transcript}), transcript
        )
        summary_ko = draft_summary(state)
        draft_data = {
            "draft_revision": 0,
            "summary_ko": summary_ko,
            "transcript": transcript,
            "interpretation": interpretation,
            "state_json": structure_v2_state_json(state, interpretation, summary_ko, ambiguities),
            "ambiguities": [item.model_dump(mode="json") for item in ambiguities],
            "contract_version": "structure-v2",
            "ontology_version": "ontology-v2",
            "farm_id": owner.farm_id,
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


@app.get("/api/v1/work-sessions/drafts/{draftId}", response_model=WorkDraft)
async def get_draft(
    draftId: str,
    response: Response,
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> WorkDraft:
    owner = require_owner(batmeori_owner_session)
    row = one_row(
        db_client().table("work_drafts").select("*").eq("id", draftId).eq("farm_id", owner.farm_id).limit(1).execute()
    )
    if utc_datetime(row["expires_at"]) <= now_utc():
        raise ApiError(404, "NOT_FOUND", "찾을 수 없습니다.")
    if row.get("confirmed_session_id") is not None:
        raise ApiError(409, "VERSION_CONFLICT", "작업이 이미 변경됐습니다. 최신 내용을 다시 확인해주세요.")
    response.headers["Cache-Control"] = "no-store"
    return parse_draft(row)


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
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    audio_bytes: bytes | None = None
    try:
        require_idempotency(idempotency_key)
        check_ai_rate_limit(request)
        audio_bytes = await read_audio_upload(audio, language_hint)
        if expected_draft_revision < 0:
            raise ApiError(422, "SCHEMA_INVALID", "expected_draft_revision이 필요합니다.")
        client = db_client()
        row = one_row(client.table("work_drafts").select("*").eq("id", draft_id).eq("farm_id", owner.farm_id).execute())
        if row["draft_revision"] != expected_draft_revision:
            raise ApiError(409, "VERSION_CONFLICT", "최신 작업 초안을 다시 확인하세요.")
        draft = parse_draft(row)
        transcript = await node_transcript(
            audio_bytes, audio.filename or "audio", audio.content_type or "audio/webm", language_hint
        )
        structure = structure_v2_state_json(draft.state, draft.interpretation, draft.summary_ko, draft.ambiguities)
        state, ambiguities, interpretation = await parse_structure_output(
            await bridge_call("MERGE_SUPPLEMENT_V2", {"structure": structure, "transcript": transcript}), transcript
        )
        summary_ko = draft_summary(state)
        result = (
            client.table("work_drafts")
            .update(
                {
                    "draft_revision": expected_draft_revision + 1,
                    "summary_ko": summary_ko,
                    "transcript": f"{draft.transcript} {transcript}".strip(),
                    "interpretation": interpretation,
                    "state_json": structure_v2_state_json(state, interpretation, summary_ko, ambiguities),
                    "ambiguities": [item.model_dump(mode="json") for item in ambiguities],
                }
            )
            .eq("id", draft_id)
            .eq("farm_id", owner.farm_id)
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
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    require_idempotency(idempotency_key)
    client = db_client()
    draft_row = one_row(
        client.table("work_drafts").select("*").eq("id", draft_id).eq("farm_id", owner.farm_id).execute()
    )
    issued: list[IssuedWorkerLink] = []
    session_id = str(draft_row.get("confirmed_session_id") or "")
    if not session_id:
        draft = parse_draft(draft_row)
        validate_confirm(draft, payload)
        session_id = str(uuid.uuid4())
        try:
            state_json = structure_v2_state_json(draft.state, draft.interpretation, draft.summary_ko, draft.ambiguities)
            packages = await build_worker_packages(
                client, session_id, 1, draft.state, draft.interpretation, draft.summary_ko, draft.ambiguities
            )
            rpc_result = client.rpc(
                "publish_work_version_with_packages",
                {
                    "p_farm_id": owner.farm_id,
                    "p_draft_id": draft_id,
                    "p_session_id": session_id,
                    "p_expected_version": 0,
                    "p_state_json": state_json,
                    "p_packages": packages,
                    "p_decision": payload.decision,
                    "p_ambiguity_override": payload.ambiguity_override,
                    "p_override_reason": payload.override_reason,
                },
            ).execute()
            published = row_data(rpc_result)
            if published:
                session_id = str(published[0]["session_id"])
            else:
                confirmed = one_row(
                    client.table("work_drafts").select("confirmed_session_id").eq("id", draft_id).eq("farm_id", owner.farm_id).execute()
                ).get("confirmed_session_id")
                if not confirmed:
                    raise ApiError(409, "VERSION_CONFLICT", "작업이 이미 변경됐습니다. 최신 내용을 다시 확인해주세요.")
                session_id = str(confirmed)
        except ApiError:
            raise
        except AiProviderError:
            raise
        except Exception:
            raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
    session_row = one_row(client.table("work_sessions").select("*").eq("id", session_id).eq("farm_id", owner.farm_id).execute())
    version_row = one_row(
        client.table("work_versions").select("*").eq("work_session_id", session_id).eq("version", session_row["current_version"]).execute()
    )
    return InitialPublishResponse(
        work_session=owner_session_response(client, session_row, version_row),
        issued_worker_links=issued,
    )


@app.get("/api/v1/work-sessions", response_model=dict[str, list[OwnerWorkSession]])
async def list_sessions(
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> dict[str, list[OwnerWorkSession]]:
    owner = require_owner(batmeori_owner_session)
    client = db_client()
    sessions = row_data(
        client.table("work_sessions").select("*").eq("farm_id", owner.farm_id).order("updated_at", desc=True).execute()
    )
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
    owner = require_owner(batmeori_owner_session)
    client = db_client()
    session = one_row(client.table("work_sessions").select("*").eq("id", session_id).eq("farm_id", owner.farm_id).execute())
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
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    audio_bytes: bytes | None = None
    try:
        check_ai_rate_limit(request)
        audio_bytes = await read_audio_upload(audio, language_hint)
        if expected_version < 1:
            raise ApiError(422, "SCHEMA_INVALID", "expected_version이 필요합니다.")
        client = db_client()
        session = one_row(
            client.table("work_sessions")
            .select("current_version,status,contract_version,ontology_version")
            .eq("id", session_id)
            .eq("farm_id", owner.farm_id)
            .execute()
        )
        if session.get("contract_version") != "structure-v2" or session.get("ontology_version") != "ontology-v2":
            raise ApiError(422, "LEGACY_READ_ONLY", "기존 v1 버전은 수량 변경할 수 없습니다.")
        if session["status"] != "PUBLISHED" or session["current_version"] != expected_version:
            raise ApiError(409, "VERSION_CONFLICT", "최신 작업 버전을 다시 확인하세요.")
        transcript = await node_transcript(
            audio_bytes, audio.filename or "audio", audio.content_type or "audio/webm", language_hint
        )
        return parse_quantity_output(
            await bridge_call("PARSE_QUANTITY_CHANGE", {"transcript": transcript, "expected_version": expected_version}),
            expected_version,
        )
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
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    require_idempotency(idempotency_key)
    client = db_client()
    session_before = one_row(
        client.table("work_sessions")
        .select("id,current_version,status,contract_version,ontology_version")
        .eq("id", session_id)
        .eq("farm_id", owner.farm_id)
        .execute()
    )
    if session_before.get("contract_version") != "structure-v2" or session_before.get("ontology_version") != "ontology-v2":
        raise ApiError(422, "LEGACY_READ_ONLY", "기존 v1 버전은 수량 변경할 수 없습니다.")
    if session_before["status"] != "PUBLISHED" or session_before["current_version"] != payload.expected_version:
        raise ApiError(409, "VERSION_CONFLICT", "최신 작업 버전을 다시 확인하세요.")
    previous = one_row(
        client.table("work_versions")
        .select("*")
        .eq("work_session_id", session_id)
        .eq("version", payload.expected_version)
        .eq("status", "PUBLISHED")
        .execute()
    )
    previous_state_json = previous["state_json"]
    validate_contract_schema(previous_state_json, "structure-v2.schema.json")
    try:
        previous_structure = StructureOutputV2.model_validate(previous_state_json)
    except ValidationError as exc:
        raise ApiError(422, "SCHEMA_INVALID", "현재 작업 버전의 구조가 올바르지 않습니다.", {"errors": exc.errors()})
    next_state = replace_quantity_for_v2(parse_version(previous).state, payload.quantity)
    validate_state(next_state, allow_unsupported=True, for_publish=True)
    summary_ko = draft_summary(next_state)
    next_state_json = structure_v2_state_json(
        next_state, previous_structure.interpretation, summary_ko, previous_structure.ambiguities
    )
    try:
        packages = await build_worker_packages(
            client,
            session_id,
            payload.expected_version + 1,
            next_state,
            previous_structure.interpretation,
            summary_ko,
            previous_structure.ambiguities,
        )
        result = client.rpc(
            "publish_work_version_with_packages",
            {
                "p_farm_id": owner.farm_id,
                "p_draft_id": None,
                "p_session_id": session_id,
                "p_expected_version": payload.expected_version,
                "p_state_json": next_state_json,
                "p_packages": packages,
                "p_decision": previous.get("confirmation_decision") or "CONFIRM",
                "p_ambiguity_override": bool(previous.get("ambiguity_override", False)),
                "p_override_reason": previous.get("override_reason"),
            },
        ).execute()
    except AiProviderError:
        raise
    except Exception:
        raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
    if not row_data(result):
        raise ApiError(409, "VERSION_CONFLICT", "최신 작업 버전을 다시 확인하세요.")
    session = one_row(
        client.table("work_sessions").select("*").eq("id", session_id).eq("farm_id", owner.farm_id).execute()
    )
    version = one_row(
        client.table("work_versions")
        .select("*")
        .eq("work_session_id", session_id)
        .eq("version", session["current_version"])
        .execute()
    )
    return owner_session_response(client, session, version)


@app.post("/api/v1/work-teams/today", response_model=TodayWorkTeam)
async def create_today_team(
    request: Request,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> TodayWorkTeam:
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    issue_key = require_idempotency(idempotency_key)
    client = db_client()
    work_date, expires_at = today_seoul()
    rows = row_data(
        client.table("today_work_teams").select("*").eq("farm_id", owner.farm_id).eq("work_date", work_date).limit(1).execute()
    )
    created = not rows
    if created:
        team_id = str(uuid.uuid4())
        token = today_team_token(team_id, issue_key)
        invite = {
            "id": team_id,
            "farm_id": owner.farm_id,
            "work_date": work_date,
            "invite_token_hash": hash_link_token(token),
            "invite_issue_idempotency_key": issue_key,
            "issued_at": now_utc().isoformat(),
            "expires_at": expires_at.isoformat(),
        }
        try:
            result = client.table("today_work_teams").insert(invite).select("*").execute()
            team_row = one_row(result)
        except Exception:
            created = False
            team_row = one_row(
                client.table("today_work_teams").select("*").eq("farm_id", owner.farm_id).eq("work_date", work_date).limit(1).execute()
            )
    else:
        team_row = rows[0]
    response.status_code = 201 if created else 200
    return today_team_response(client, team_row, today_team_join_url(team_row, request))


@app.get("/api/v1/work-teams/today", response_model=TodayWorkTeam)
async def get_today_team(
    request: Request,
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> TodayWorkTeam:
    owner = require_owner(batmeori_owner_session)
    work_date, _ = today_seoul()
    client = db_client()
    team_row = one_row(
        client.table("today_work_teams").select("*").eq("farm_id", owner.farm_id).eq("work_date", work_date).limit(1).execute()
    )
    return today_team_response(client, team_row, today_team_join_url(team_row, request))


@app.post("/api/v1/work-teams/today/invite/rotate", response_model=TodayWorkTeam)
async def rotate_today_team(
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> TodayWorkTeam:
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    issue_key = require_idempotency(idempotency_key)
    client = db_client()
    work_date, expires_at = today_seoul()
    team_row = one_row(
        client.table("today_work_teams").select("id").eq("farm_id", owner.farm_id).eq("work_date", work_date).limit(1).execute()
    )
    token = today_team_token(str(team_row["id"]), issue_key)
    team_row = one_row(
        client.rpc(
            "rotate_today_work_team_invite",
            {
                "p_farm_id": owner.farm_id,
                "p_work_date": work_date,
                "p_idempotency_key": issue_key,
                "p_invite_token_hash": hash_link_token(token),
                "p_issued_at": now_utc().isoformat(),
                "p_expires_at": expires_at.isoformat(),
            },
        ).execute()
    )
    return today_team_response(client, team_row, today_team_join_url(team_row, request))


@app.post("/api/v1/work-team-invites/{token}/join", status_code=201, response_model=TeamMember)
async def join_today_team(
    token: str,
    payload: JoinTeamRequest,
    request: Request,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_team_member: str | None = Cookie(default=None, alias=TEAM_MEMBER_COOKIE_NAME),
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
    member_identity = verify_team_member(batmeori_team_member)
    rows = []
    if member_identity and member_identity[0] == str(team_row["id"]):
        rows = row_data(
            client.table("today_work_team_members")
            .select("*")
            .eq("id", member_identity[1])
            .eq("team_id", team_row["id"])
            .eq("farm_id", team_row["farm_id"])
            .limit(1)
            .execute()
        )
    if not rows:
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
                        "farm_id": team_row["farm_id"],
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
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    require_idempotency(idempotency_key)
    client = db_client()
    work_date, _ = today_seoul()
    team_row = one_row(
        client.table("today_work_teams").select("id").eq("farm_id", owner.farm_id).eq("work_date", work_date).limit(1).execute()
    )
    one_row(
        client.table("today_work_team_members")
        .select("id")
        .eq("id", memberId)
        .eq("team_id", team_row["id"])
        .eq("farm_id", owner.farm_id)
        .limit(1)
        .execute()
    )
    one_row(
        client.table("work_sessions")
        .select("id")
        .eq("id", payload.work_session_id)
        .eq("status", "PUBLISHED")
        .eq("farm_id", owner.farm_id)
        .limit(1)
        .execute()
    )
    rows = row_data(
        client.table("today_work_assignments")
        .select("*")
        .eq("team_member_id", memberId)
        .eq("work_session_id", payload.work_session_id)
        .eq("farm_id", owner.farm_id)
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
                .insert({"team_member_id": memberId, "work_session_id": payload.work_session_id, "farm_id": owner.farm_id})
                .select("*")
                .execute()
            )
        except Exception:
            assignment = one_row(
                client.table("today_work_assignments")
                .select("*")
                .eq("team_member_id", memberId)
                .eq("work_session_id", payload.work_session_id)
                .eq("farm_id", owner.farm_id)
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
    team_row = one_row(
        client.table("today_work_teams").select("expires_at,farm_id").eq("id", team_id).limit(1).execute(), "UNAUTHORIZED"
    )
    if utc_datetime(team_row["expires_at"]) <= now_utc():
        raise ApiError(401, "UNAUTHORIZED", "인증이 필요합니다.")
    member = one_row(
        client.table("today_work_team_members")
        .select("language_code")
        .eq("id", member_id)
        .eq("team_id", team_id)
        .eq("farm_id", team_row["farm_id"])
        .limit(1)
        .execute(),
        "UNAUTHORIZED",
    )
    assignment_rows = row_data(
        client.table("today_work_assignments")
        .select("work_session_id")
        .eq("team_member_id", member_id)
        .eq("farm_id", team_row["farm_id"])
        .is_("revoked_at", "null")
        .order("assigned_at")
        .execute()
    )
    return {"assignments": [
        stored_worker_briefing(client, str(row["work_session_id"]), member["language_code"], str(team_row["farm_id"]))
        for row in assignment_rows
    ]}


@app.post("/api/v1/work-sessions/{sessionId}/worker-links", status_code=201, response_model=WorkerLinkIssueResponse)
async def issue_worker_link(
    sessionId: str,
    payload: WorkerLinkIssueRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> WorkerLinkIssueResponse:
    session_id = sessionId
    owner = require_owner(batmeori_owner_session)
    require_origin(request)
    issue_key = require_idempotency(idempotency_key)
    client = db_client()
    one_row(
        client.table("work_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("status", "PUBLISHED")
        .eq("farm_id", owner.farm_id)
        .execute()
    )
    link_row, issued = issue_link(payload.language_code)
    link_row["issue_idempotency_key"] = issue_key
    try:
        client.rpc(
            "issue_worker_link_v2",
            {
                "p_farm_id": owner.farm_id,
                "p_session_id": session_id,
                "p_language_code": payload.language_code,
                "p_link": link_row,
            },
        ).execute()
    except Exception:
        raise ApiError(500, "INTERNAL_ERROR", "일시적인 오류입니다.")
    return WorkerLinkIssueResponse(session_id=session_id, issued_worker_links=[issued])


@app.get("/api/v1/worker-links/{token}/assignment", response_model=dict[str, Any])
async def get_worker_assignment(token: str) -> dict[str, Any]:
    if len(token) < 32 or not settings.owner_session_secret:
        raise ApiError(404, "ACCESS_DENIED", "접근할 수 없습니다.")
    client = db_client()
    row = one_row(
        client.table("worker_links")
        .select("work_session_id,language_code,expires_at,revoked_at,farm_id")
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
    return stored_worker_briefing(client, str(row["work_session_id"]), row["language_code"], str(row["farm_id"]))


@app.get("/api/v1/tts/{text_hash}/{language_code}")
async def get_tts_asset(text_hash: str, language_code: str) -> Response:
    if language_code not in LANGUAGES or not re.fullmatch(r"[0-9a-f]{64}", text_hash):
        raise ApiError(404, "ACCESS_DENIED", "접근할 수 없습니다.")
    try:
        row = one_row(
            db_client()
            .table("tts_assets")
            .select("audio_bytes,content_type")
            .eq("text_hash", text_hash)
            .eq("language_code", language_code)
            .limit(1)
            .execute(),
            "ACCESS_DENIED",
        )
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(503, "PROVIDER_UNAVAILABLE", "음성을 불러올 수 없습니다.") from exc
    audio = private_tts_bytes(row.get("audio_bytes"))
    if not audio:
        raise ApiError(404, "ACCESS_DENIED", "접근할 수 없습니다.")
    return Response(content=audio, media_type=row.get("content_type") or "audio/mpeg")


@app.get("/api/v1/brief", response_model=dict[str, Any])
async def get_brief(
    session_id: str,
    language_code: str,
    batmeori_owner_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> dict[str, Any]:
    owner = require_owner(batmeori_owner_session)
    if language_code not in LANGUAGES:
        raise ApiError(422, "SCHEMA_INVALID", "지원하지 않는 언어입니다.")
    client = db_client()
    return stored_worker_briefing(client, session_id, language_code, owner.farm_id)
