from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db, set_tenant

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(user_id: str, tenant_id: str, role: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": user_id, "tenant_id": tenant_id, "role": role, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


PASSWORD_RESET_PURPOSE = "password_reset"


def create_password_reset_token(user_id: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_token_expires_minutes)
    payload = {"sub": user_id, "purpose": PASSWORD_RESET_PURPOSE, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_password_reset_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")
    if payload.get("purpose") != PASSWORD_RESET_PURPOSE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")
    return payload["sub"]


class CurrentUser:
    def __init__(self, user_id: str, tenant_id: str, role: str):
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.role = role


def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    # A password-reset token is signed with the same secret but carries no tenant_id/role --
    # reject it cleanly here rather than crashing below with a raw KeyError.
    if "tenant_id" not in payload or "role" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return CurrentUser(user_id=payload["sub"], tenant_id=payload["tenant_id"], role=payload["role"])


def get_tenant_db(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Session:
    """Every tenant-scoped route depends on this instead of get_db directly: it resolves the
    tenant from the authenticated session (never a client-supplied tenant id, doc Sec 6.2)
    and sets the RLS session variable before any query runs."""
    set_tenant(db, current_user.tenant_id)
    return db


# Ordering for team-management authorization (doc Sec 6.1's role list, ranked): you may only
# grant or remove a role at or below your own rank. This is the ONE rule that makes "owner"
# mean something more than "admin" -- without it, any admin could grant themselves/an ally
# the owner role, or remove an existing owner outright, collapsing the whole hierarchy.
ROLE_RANK = {"viewer": 1, "admin": 2, "owner": 3}


def require_role(*allowed_roles: str):
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return current_user

    return dependency
