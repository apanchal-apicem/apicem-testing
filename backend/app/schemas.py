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


class ChatMessage(BaseModel):
    role: str
    content: str


class AssistantAskRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class AssistantAskResponse(BaseModel):
    reply: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    user_id: str
    tenant_id: str
    email: str
    role: str
    tenant_name: str


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
