from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db, set_tenant
from ..email import send_email
from ..rate_limit import rate_limit
from ..schemas import (
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    RequestPasswordResetRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenResponse,
)
from ..security import (
    CurrentUser,
    create_access_token,
    create_password_reset_token,
    get_current_user,
    get_tenant_db,
    hash_password,
    verify_password,
    verify_password_reset_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, dependencies=[Depends(rate_limit(5, 60))])
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing = db.execute(text("SELECT 1 FROM app.login_lookup(:email)"), {"email": payload.email}).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    tenant_row = db.execute(
        text("INSERT INTO app.tenants (name) VALUES (:name) RETURNING tenant_id"),
        {"name": payload.company_name},
    ).one()
    tenant_id = str(tenant_row.tenant_id)

    # The RLS session variable must be set to the tenant we just created, in the same
    # transaction, before the first insert into a tenant-scoped table (app.users) --
    # otherwise the RLS WITH CHECK clause rejects the insert (doc Sec 6.2).
    set_tenant(db, tenant_id)
    user_row = db.execute(
        text(
            """INSERT INTO app.users (tenant_id, email, hashed_password, role)
               VALUES (:tenant_id, :email, :hashed_password, 'owner')
               RETURNING user_id, role"""
        ),
        {"tenant_id": tenant_id, "email": payload.email, "hashed_password": hash_password(payload.password)},
    ).one()
    db.commit()

    token = create_access_token(user_id=str(user_row.user_id), tenant_id=tenant_id, role=user_row.role)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit(5, 60))])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    row = db.execute(text("SELECT * FROM app.login_lookup(:email)"), {"email": payload.email}).first()
    if not row or not verify_password(payload.password, row.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user_id=str(row.user_id), tenant_id=str(row.tenant_id), role=row.role)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
def me(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    set_tenant(db, current_user.tenant_id)
    row = db.execute(
        text(
            """SELECT u.email, u.role, t.name AS tenant_name
               FROM app.users u JOIN app.tenants t ON t.tenant_id = u.tenant_id
               WHERE u.user_id = :user_id"""
        ),
        {"user_id": current_user.user_id},
    ).one()
    return MeResponse(
        user_id=current_user.user_id,
        tenant_id=current_user.tenant_id,
        email=row.email,
        role=row.role,
        tenant_name=row.tenant_name,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    # Unlike /auth/reset-password, this runs with a real tenant context already (the caller
    # is authenticated), so it's a normal RLS-scoped update -- no SECURITY DEFINER needed,
    # since a user reading/updating their own row is exactly what the tenant_isolation
    # policy already allows.
    row = db.execute(
        text("SELECT hashed_password FROM app.users WHERE user_id = :user_id"),
        {"user_id": current_user.user_id},
    ).one()
    if not verify_password(payload.current_password, row.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    db.execute(
        text("UPDATE app.users SET hashed_password = :hashed_password WHERE user_id = :user_id"),
        {"hashed_password": hash_password(payload.new_password), "user_id": current_user.user_id},
    )
    db.commit()


@router.post("/request-password-reset", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(rate_limit(3, 300))])
def request_password_reset(payload: RequestPasswordResetRequest, db: Session = Depends(get_db)):
    # Always return 202 regardless of whether the email exists -- a differing response
    # would let an attacker enumerate registered emails through this endpoint.
    row = db.execute(text("SELECT * FROM app.login_lookup(:email)"), {"email": payload.email}).first()
    if row:
        reset_token = create_password_reset_token(str(row.user_id))
        reset_link = f"http://localhost:5173/reset-password?token={reset_token}"
        send_email(
            payload.email,
            "Reset your Apicem password",
            f"Click the link below to reset your password. This link expires in 30 minutes.\n\n{reset_link}",
        )
    return {"status": "if that email is registered, a reset link has been sent"}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user_id = verify_password_reset_token(payload.token)
    result = db.execute(
        text("SELECT * FROM app.reset_password(:user_id, :hashed_password)"),
        {"user_id": user_id, "hashed_password": hash_password(payload.new_password)},
    ).first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    db.commit()
