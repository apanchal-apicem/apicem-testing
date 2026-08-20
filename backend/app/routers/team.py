from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..schemas import AddTeammateRequest, TeamMemberOut
from ..security import ROLE_RANK, CurrentUser, get_tenant_db, hash_password, require_role

router = APIRouter(prefix="/team", tags=["team"])

VALID_ROLES = {"owner", "admin", "viewer"}


@router.get("", response_model=list[TeamMemberOut])
def list_team(db: Session = Depends(get_tenant_db)):
    rows = db.execute(
        text("SELECT user_id, email, role, created_at FROM app.users ORDER BY created_at")
    ).all()
    return [TeamMemberOut(**row._mapping) for row in rows]


@router.post("", response_model=TeamMemberOut, status_code=status.HTTP_201_CREATED)
def add_teammate(
    payload: AddTeammateRequest,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"role must be one of {sorted(VALID_ROLES)}")

    # An admin could otherwise grant themselves an ally the owner role and escape the
    # hierarchy entirely -- you can only grant a role at or below your own rank.
    if ROLE_RANK[payload.role] > ROLE_RANK[current_user.role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role ({current_user.role}) cannot grant the {payload.role} role",
        )

    existing = db.execute(text("SELECT 1 FROM app.login_lookup(:email)"), {"email": payload.email}).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    row = db.execute(
        text(
            """INSERT INTO app.users (tenant_id, email, hashed_password, role)
               VALUES (:tenant_id, :email, :hashed_password, :role)
               RETURNING user_id, email, role, created_at"""
        ),
        {
            "tenant_id": current_user.tenant_id,
            "email": payload.email,
            "hashed_password": hash_password(payload.password),
            "role": payload.role,
        },
    ).one()
    db.commit()
    return TeamMemberOut(**row._mapping)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_teammate(
    user_id: str,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    if user_id == current_user.user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove your own account")

    target = db.execute(text("SELECT role FROM app.users WHERE user_id = :user_id"), {"user_id": user_id}).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teammate not found")

    # The actual bug fix: previously any admin could remove any owner (as long as they
    # weren't the last one) since this endpoint only checked "owner or admin", never who
    # outranks whom. Same rank comparison as add_teammate -- you can only remove someone at
    # or below your own rank, so admin can remove admin/viewer but never owner.
    if ROLE_RANK[target.role] > ROLE_RANK[current_user.role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove a teammate with a higher role than your own",
        )

    if target.role == "owner":
        owner_count = db.execute(text("SELECT count(*) FROM app.users WHERE role = 'owner'")).scalar()
        if owner_count <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last owner")

    db.execute(text("DELETE FROM app.users WHERE user_id = :user_id"), {"user_id": user_id})
    db.commit()
