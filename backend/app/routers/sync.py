from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..security import get_tenant_db, require_role

router = APIRouter(prefix="/connections", tags=["sync"])


@router.post("/{connection_id}/sync-now", status_code=status.HTTP_202_ACCEPTED)
def sync_now(
    connection_id: str,
    _current_user=Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    """Marks a connection for immediate pickup by the orchestrator's poll loop (doc Sec 9:
    a lightweight queue for quick user-triggered async tasks, separate from the scheduled
    cadence). The actual extraction always runs out-of-band in the orchestrator process,
    which is the only process with raw-schema write access."""
    result = db.execute(
        text(
            """UPDATE app.connections SET requested_sync_at = now()
               WHERE connection_id = :connection_id
               RETURNING connection_id"""
        ),
        {"connection_id": connection_id},
    ).first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    db.commit()
    return {"status": "sync_requested"}
