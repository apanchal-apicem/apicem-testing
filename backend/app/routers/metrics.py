from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..metric_registry import SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS, compute_metric
from ..security import CurrentUser, get_current_user, get_tenant_db

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
def list_metrics():
    return {
        "scalar": {k: v["label"] for k, v in SCALAR_METRICS.items()},
        "series": {k: v["label"] for k, v in SERIES_METRICS.items()},
        "table": {k: v["label"] for k, v in TABLE_METRICS.items()},
    }


@router.get("/{metric_key}")
def get_metric(
    metric_key: str,
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    compare: bool = Query(default=False),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    end_date = end_date or date.today()
    start_date = start_date or (end_date - timedelta(days=30))
    try:
        return compute_metric(db, current_user.tenant_id, metric_key, start_date, end_date, compare=compare)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown metric: {metric_key}")
