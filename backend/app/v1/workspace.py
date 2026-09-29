"""Phase 1: workspace & membership. `GET /workspace`, `GET /workspace/members`,
`GET /workspaces`, `POST /workspaces/:id/switch`, `POST /workspaces`.

Workspace = the existing Tenant + a new `app.workspace_memberships` row per user (many-to-many,
per-membership role -- see warehouse/sql/014_workspace_memberships.sql). `switchWorkspace` and
`createWorkspace` are the two deliberate exceptions to "workspace id only ever comes from the
session" (SECURITY.md, "Switching workspaces"): both independently verify (or, for create,
establish) membership before re-scoping the session -- there is no silent fallback to a default
workspace anywhere in this file, which is the exact bug class SECURITY.md warns about.
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db, set_current_user, set_tenant
from ..security import CurrentUser, create_access_token, get_current_user, get_tenant_db, set_session_cookie
from .avatar import avatar_color_for
from .schemas import CreateWorkspaceInput, User, Workspace, WorkspaceSummary

router = APIRouter(tags=["v1-workspace"])

# app.tenants.plan is trial/starter/growth (drives the orchestrator's sync-interval logic,
# see PLAN_SYNC_INTERVAL_MINUTES -- not something this layer should change). The new frontend's
# Workspace.plan is starter/growth/enterprise. Mapped here, at the API boundary, rather than
# changing the DB column's own values out from under the orchestrator.
PLAN_DISPLAY_MAP = {"trial": "starter", "starter": "starter", "growth": "growth"}


def display_plan(db_plan: str) -> str:
    return PLAN_DISPLAY_MAP.get(db_plan, "starter")


@router.get("/workspace", response_model=Workspace, response_model_by_alias=True)
def get_active_workspace(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_tenant_db)):
    row = db.execute(
        text(
            """SELECT t.tenant_id, t.name, t.slug, t.plan,
                      (SELECT count(*) FROM app.workspace_memberships m WHERE m.workspace_id = t.tenant_id) AS member_count
               FROM app.tenants t WHERE t.tenant_id = :tenant_id"""
        ),
        {"tenant_id": current_user.tenant_id},
    ).one()
    return Workspace(
        id=str(row.tenant_id), name=row.name, slug=row.slug,
        plan=display_plan(row.plan), member_count=row.member_count,
    )


@router.get("/workspace/members", response_model=list[User], response_model_by_alias=True)
def list_team_members(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_tenant_db)):
    rows = db.execute(
        text(
            """SELECT u.user_id, u.email,
                      coalesce(u.name, initcap(replace(split_part(u.email, '@', 1), '.', ' '))) AS name,
                      m.role
               FROM app.workspace_memberships m
               JOIN app.users u ON u.user_id = m.user_id
               WHERE m.workspace_id = :workspace_id
               ORDER BY m.created_at"""
        ),
        {"workspace_id": current_user.tenant_id},
    ).all()
    return [
        User(id=str(r.user_id), name=r.name, email=r.email, role=r.role, avatar_color=avatar_color_for(str(r.user_id)))
        for r in rows
    ]


@router.get("/workspaces", response_model=list[WorkspaceSummary], response_model_by_alias=True)
def list_my_workspaces(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_tenant_db)):
    # RLS's membership_visibility policy admits rows where user_id = app.current_user regardless
    # of which tenant is currently active, which is exactly what lets this query see EVERY
    # workspace the user belongs to, not just the active one (see the migration's own comment).
    rows = db.execute(
        text(
            """SELECT t.tenant_id, t.name, t.slug, t.plan, m.role
               FROM app.workspace_memberships m
               JOIN app.tenants t ON t.tenant_id = m.workspace_id
               WHERE m.user_id = :user_id
               ORDER BY m.created_at"""
        ),
        {"user_id": current_user.user_id},
    ).all()
    return [
        WorkspaceSummary(id=str(r.tenant_id), name=r.name, slug=r.slug, plan=display_plan(r.plan), my_role=r.role)
        for r in rows
    ]


@router.post("/workspaces/{workspace_id}/switch", response_model=Workspace, response_model_by_alias=True)
def switch_workspace(
    workspace_id: str,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    # Independently re-verifies membership by user_id, not by trusting the active-tenant scope
    # the request arrived with -- this is the exact check SECURITY.md's own cautionary example
    # (a silent fallback-to-default in a membership lookup) describes getting wrong.
    membership = db.execute(
        text("SELECT role FROM app.workspace_memberships WHERE user_id = :user_id AND workspace_id = :workspace_id"),
        {"user_id": current_user.user_id, "workspace_id": workspace_id},
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of that workspace")

    row = db.execute(
        text(
            """SELECT t.tenant_id, t.name, t.slug, t.plan,
                      (SELECT count(*) FROM app.workspace_memberships m WHERE m.workspace_id = t.tenant_id) AS member_count
               FROM app.tenants t WHERE t.tenant_id = :tenant_id"""
        ),
        {"tenant_id": workspace_id},
    ).one()

    token = create_access_token(user_id=current_user.user_id, tenant_id=workspace_id, role=membership.role)
    set_session_cookie(response, token)
    return Workspace(
        id=str(row.tenant_id), name=row.name, slug=row.slug,
        plan=display_plan(row.plan), member_count=row.member_count,
    )


@router.post("/workspaces", response_model=Workspace, response_model_by_alias=True, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: CreateWorkspaceInput,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # slug is filled in automatically by app.tenants' tenants_set_slug trigger (see
    # warehouse/sql/016_tenant_slug_trigger.sql) -- same as the old frontend's /auth/signup,
    # this insert only ever needs to supply name.
    tenant_row = db.execute(
        text("INSERT INTO app.tenants (name) VALUES (:name) RETURNING tenant_id, slug"),
        {"name": payload.name},
    ).one()
    tenant_id = str(tenant_row.tenant_id)
    slug = tenant_row.slug

    # The membership row's WITH CHECK (workspace_id = app.current_tenant) requires the session
    # to already be scoped to the NEW tenant before this insert, same ordering constraint as the
    # old signup flow (routers/auth.py) has for its first app.users insert.
    set_tenant(db, tenant_id)
    set_current_user(db, current_user.user_id)
    db.execute(
        text("INSERT INTO app.workspace_memberships (user_id, workspace_id, role) VALUES (:user_id, :workspace_id, 'owner')"),
        {"user_id": current_user.user_id, "workspace_id": tenant_id},
    )
    db.commit()

    token = create_access_token(user_id=current_user.user_id, tenant_id=tenant_id, role="owner")
    set_session_cookie(response, token)
    return Workspace(id=tenant_id, name=payload.name, slug=slug, plan=display_plan("trial"), member_count=1)
