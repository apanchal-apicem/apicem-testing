"""Phase 0 of the new-frontend backend: `POST /auth/login`, `POST /auth/logout`, `GET /me`.
Login/logout aren't part of the frontend's `ApiClient` contract yet (its own checklist calls
this out: "not part of ApiClient yet ... every other phase depends on it existing first") --
these two exist so the frontend's login page (today a pure UI stub, per its own file comment)
has something real to call once it's wired up, which is necessary to verify anything else here
against the real UI at all, not just curl.

Reuses the exact same credential-checking path as the old frontend's /auth/login
(routers/auth.py) -- app.login_lookup + verify_password -- the only difference is HOW the
resulting token reaches the client: a Set-Cookie header (SECURITY.md's explicit requirement)
instead of the response body.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db
from ..rate_limit import rate_limit
from ..security import CurrentUser, create_access_token, get_current_user, get_tenant_db, set_session_cookie, clear_session_cookie, verify_password
from .avatar import avatar_color_for
from .schemas import User

router = APIRouter(tags=["v1-auth"])


@router.post("/auth/login", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit(5, 60))])
def login(payload: dict, response: Response, db: Session = Depends(get_db)):
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="email and password are required")

    row = db.execute(text("SELECT * FROM app.login_lookup(:email)"), {"email": email}).first()
    if not row or not verify_password(password, row.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user_id=str(row.user_id), tenant_id=str(row.tenant_id), role=row.role)
    set_session_cookie(response, token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    clear_session_cookie(response)


@router.get("/me", response_model=User, response_model_by_alias=True)
def me(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_tenant_db)):
    # get_current_user only decodes the token -- the display name isn't in the JWT payload
    # (keeping the token small and not needing reissue whenever a name changes), so this is a
    # real lookup, same as the old frontend's GET /auth/me. Uses get_tenant_db (not get_db) --
    # app.users has RLS applied, so this query returns nothing at all without the tenant
    # session variable set first.
    row = db.execute(
        text(
            """SELECT u.email,
                      coalesce(u.name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name,
                      m.role
               FROM app.users u
               JOIN app.workspace_memberships m ON m.user_id = u.user_id AND m.workspace_id = :tenant_id
               WHERE u.user_id = :user_id"""
        ),
        {"user_id": current_user.user_id, "tenant_id": current_user.tenant_id},
    ).one()
    return User(
        id=current_user.user_id,
        name=row.name,
        email=row.email,
        role=row.role,
        avatar_color=avatar_color_for(current_user.user_id),
    )
