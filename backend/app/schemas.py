from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    company_name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RequestPasswordResetRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AssistantMetricResult(BaseModel):
    metric: str
    label: str
    value: float | None = None
    previous_value: float | None = None
    delta_pct: float | None = None
    is_estimated: bool = False
    series: list[dict] | None = None
    rows: list[dict] | None = None
    start_date: str
    end_date: str


class AssistantAskRequest(BaseModel):
    message: str
    # The metric + window the LAST answer was about (not a full conversation history) -- lets
    # a bare follow-up like "and for the previous period from that?" resolve against
    # whatever was just asked, even though this question alone names no metric.
    previous_metric: str | None = None
    previous_start_date: str | None = None
    previous_end_date: str | None = None


class AssistantAskResponse(BaseModel):
    reply: str
    results: list[AssistantMetricResult] = []


class AssistantMessageOut(BaseModel):
    message_id: str
    role: str
    content: str
    results: list[AssistantMetricResult] = []
    created_at: datetime


class AssistantCapabilityMetric(BaseModel):
    key: str
    label: str
    kind: str


class AssistantCapabilityCategory(BaseModel):
    category: str
    metrics: list[AssistantCapabilityMetric]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    user_id: str
    tenant_id: str
    email: str
    role: str
    tenant_name: str
    tenant_logo_url: Optional[str] = None
    is_demo: bool = False


class UpdateTenantRequest(BaseModel):
    name: str


class ConnectionCreateRequest(BaseModel):
    source_type: str = "shopify"
    use_mock_data: bool = True
    # Generic rather than Shopify-shaped (shop_domain/access_token) -- each source type
    # defines its own required keys (see connections.py's REQUIRED_CREDENTIAL_FIELDS) since
    # Google Ads/Meta Ads/NetSuite each need a completely different credential shape.
    credentials: Optional[dict[str, str]] = None


class ConnectionOut(BaseModel):
    connection_id: UUID
    source_type: str
    status: str
    use_mock_data: bool
    last_synced_at: Optional[datetime]
    last_error: Optional[str]
    created_at: datetime


class JobRunOut(BaseModel):
    job_run_id: UUID
    job_type: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime]
    error_message: Optional[str]
    records_synced: Optional[dict] = None


class DashboardWidgetOut(BaseModel):
    type: str
    metric: str
    label: str
    value: Any = None
    previous_value: Any = None
    delta_pct: Optional[float] = None
    is_estimated: bool = False
    series: Optional[list[dict]] = None
    rows: Optional[list[dict]] = None


class DashboardOut(BaseModel):
    id: str
    title: str
    date_note: str
    widgets: list[DashboardWidgetOut]


class AddTeammateRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "viewer"


class TeamMemberOut(BaseModel):
    user_id: UUID
    email: str
    role: str
    created_at: datetime
