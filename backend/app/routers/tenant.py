import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..schemas import UpdateTenantRequest
from ..security import CurrentUser, get_tenant_db, require_role

router = APIRouter(prefix="/tenant", tags=["tenant"])

# Local-disk storage, served by main.py's static mount -- consistent with this product's
# local-only scope (doc Sec 9 update, 2026-08-21). A real deployment would point this at
# S3/Cloud Storage instead; nothing else about the logo_url column's meaning would change.
LOGO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "uploads", "logos")
ALLOWED_LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "image/webp": ".webp"}
MAX_LOGO_BYTES = 2 * 1024 * 1024


@router.patch("", status_code=status.HTTP_204_NO_CONTENT)
def update_tenant(
    payload: UpdateTenantRequest,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace name can't be empty")
    db.execute(
        text("UPDATE app.tenants SET name = :name WHERE tenant_id = :tenant_id"),
        {"name": name, "tenant_id": current_user.tenant_id},
    )
    db.commit()


def _existing_logo_files(tenant_id: str) -> list[str]:
    if not os.path.isdir(LOGO_DIR):
        return []
    return [f for f in os.listdir(LOGO_DIR) if f.startswith(f"{tenant_id}.")]


@router.post("/logo", status_code=status.HTTP_204_NO_CONTENT)
def upload_logo(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Logo must be one of: {', '.join(sorted(ALLOWED_LOGO_TYPES))}",
        )
    contents = file.file.read(MAX_LOGO_BYTES + 1)
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Logo must be 2 MB or smaller")

    os.makedirs(LOGO_DIR, exist_ok=True)
    # Remove any previous logo for this tenant first -- re-uploading in a different format
    # (e.g. was .png, now .jpg) would otherwise leave the old file behind unreferenced.
    for existing in _existing_logo_files(current_user.tenant_id):
        os.remove(os.path.join(LOGO_DIR, existing))

    extension = ALLOWED_LOGO_TYPES[file.content_type]
    filename = f"{current_user.tenant_id}{extension}"
    with open(os.path.join(LOGO_DIR, filename), "wb") as out:
        out.write(contents)

    # Cache-busted with a random suffix so the sidebar's <img> picks up the new file
    # immediately instead of showing a browser-cached copy of the old logo at the same URL.
    logo_url = f"/uploads/logos/{filename}?v={uuid.uuid4().hex[:8]}"
    db.execute(
        text("UPDATE app.tenants SET logo_url = :logo_url WHERE tenant_id = :tenant_id"),
        {"logo_url": logo_url, "tenant_id": current_user.tenant_id},
    )
    db.commit()


@router.delete("/logo", status_code=status.HTTP_204_NO_CONTENT)
def remove_logo(
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    for existing in _existing_logo_files(current_user.tenant_id):
        os.remove(os.path.join(LOGO_DIR, existing))
    db.execute(
        text("UPDATE app.tenants SET logo_url = NULL WHERE tenant_id = :tenant_id"),
        {"tenant_id": current_user.tenant_id},
    )
    db.commit()
