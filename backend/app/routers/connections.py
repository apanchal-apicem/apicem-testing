import json

from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..schemas import ConnectionCreateRequest, ConnectionOut, JobRunOut
from ..security import CurrentUser, get_current_user, get_tenant_db, require_role

router = APIRouter(prefix="/connections", tags=["connections"])

# Each source type's own required credential field names -- validated generically below
# instead of one hardcoded shop_domain/access_token shape. Keep this in sync with what each
# connectors/<source>/sync.py's _extract_and_load_live actually reads out of `credentials`.
REQUIRED_CREDENTIAL_FIELDS = {
    "shopify": ["shop_domain", "access_token"],
    "google_ads": ["client_id", "client_secret", "refresh_token", "developer_token", "customer_id"],
    "meta_ads": ["access_token", "ad_account_id"],
    "netsuite": ["account_id", "consumer_key", "consumer_secret", "token_id", "token_secret"],
}


@router.post("", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
def create_connection(
    payload: ConnectionCreateRequest,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    if payload.source_type not in REQUIRED_CREDENTIAL_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown source_type. Supported: {sorted(REQUIRED_CREDENTIAL_FIELDS)}",
        )

    secret_id = None
    if not payload.use_mock_data:
        required = REQUIRED_CREDENTIAL_FIELDS[payload.source_type]
        missing = [f for f in required if not (payload.credentials or {}).get(f)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required credential fields for {payload.source_type}: {missing}",
            )
        if not settings.fernet_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Server is not configured with a FERNET_KEY; only mock connections are available",
            )
        fernet = Fernet(settings.fernet_key.encode())
        ciphertext = fernet.encrypt(json.dumps(payload.credentials).encode())
        secret_row = db.execute(
            text(
                "INSERT INTO app.secrets (tenant_id, ciphertext) VALUES (:tenant_id, :ciphertext) RETURNING secret_id"
            ),
            {"tenant_id": current_user.tenant_id, "ciphertext": ciphertext},
        ).one()
        secret_id = secret_row.secret_id

    row = db.execute(
        text(
            """INSERT INTO app.connections (tenant_id, source_type, secret_ref, use_mock_data, status)
               VALUES (:tenant_id, :source_type, :secret_ref, :use_mock_data, 'pending')
               RETURNING connection_id, source_type, status, use_mock_data, last_synced_at, last_error, created_at"""
        ),
        {
            "tenant_id": current_user.tenant_id,
            "source_type": payload.source_type,
            "secret_ref": secret_id,
            "use_mock_data": payload.use_mock_data,
        },
    ).one()
    db.commit()
    return ConnectionOut(**row._mapping)


@router.get("", response_model=list[ConnectionOut])
def list_connections(db: Session = Depends(get_tenant_db)):
    rows = db.execute(
        text(
            """SELECT connection_id, source_type, status, use_mock_data, last_synced_at, last_error, created_at
               FROM app.connections ORDER BY created_at DESC"""
        )
    ).all()
    return [ConnectionOut(**row._mapping) for row in rows]


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    connection_id: str,
    current_user: CurrentUser = Depends(require_role("owner", "admin")),
    db: Session = Depends(get_tenant_db),
):
    row = db.execute(
        text("SELECT secret_ref FROM app.connections WHERE connection_id = :connection_id"),
        {"connection_id": connection_id},
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    db.execute(text("DELETE FROM app.connections WHERE connection_id = :connection_id"), {"connection_id": connection_id})
    if row.secret_ref:
        db.execute(text("DELETE FROM app.secrets WHERE secret_id = :secret_id"), {"secret_id": row.secret_ref})
    db.commit()


@router.get("/{connection_id}/job_runs", response_model=list[JobRunOut])
def connection_job_runs(connection_id: str, db: Session = Depends(get_tenant_db)):
    """Backs the "data health" panel (doc Sec 7.3): recent sync attempts for one connection."""
    rows = db.execute(
        text(
            """SELECT job_run_id, job_type, status, started_at, finished_at, error_message, records_synced
               FROM app.job_runs
               WHERE connection_id = :connection_id
               ORDER BY started_at DESC LIMIT 20"""
        ),
        {"connection_id": connection_id},
    ).all()
    return [JobRunOut(**row._mapping) for row in rows]
