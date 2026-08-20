from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..dashboard_registry import available_capabilities, dashboards_for_capabilities, get_dashboard
from ..metric_registry import compute_metric
from ..schemas import DashboardOut, DashboardWidgetOut
from ..security import CurrentUser, get_current_user, get_tenant_db

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


def _tenant_capabilities(db: Session) -> set:
    rows = db.execute(text("SELECT source_type FROM app.connections WHERE status = 'active'")).all()
    return available_capabilities(row.source_type for row in rows)


@router.get("", response_model=list[DashboardOut])
def list_dashboards(db: Session = Depends(get_tenant_db)):
    """Conditional rendering by connected source (doc Sec 8.2): a dashboard only appears
    once the tenant has an active connection providing every capability it needs. Returned
    without computed widget values -- callers fetch a specific dashboard for those."""
    eligible = dashboards_for_capabilities(_tenant_capabilities(db))
    return [
        DashboardOut(
            id=d["id"],
            title=d["title"],
            widgets=[DashboardWidgetOut(type=w["type"], metric=w["metric"], label=w["label"]) for w in d["widgets"]],
        )
        for d in eligible
    ]


@router.get("/{dashboard_id}", response_model=DashboardOut)
def get_dashboard_with_values(
    dashboard_id: str,
    start_date: date = Query(default=None),
    end_date: date = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_tenant_db),
):
    dashboard = get_dashboard(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
    if not (dashboard["required_capabilities"] <= _tenant_capabilities(db)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Connect a required data source to unlock this dashboard",
        )

    end_date = end_date or date.today()
    start_date = start_date or (end_date - timedelta(days=30))

    widgets = []
    for widget in dashboard["widgets"]:
        # Period-over-period comparison only makes sense for a single point-in-time number,
        # not a trend series or a ranked table (doc Sec 8.1's "vs prior period" is a KPI-tile
        # concept).
        compare = widget["type"] == "kpi"
        result = compute_metric(db, current_user.tenant_id, widget["metric"], start_date, end_date, compare=compare)
        widgets.append(
            DashboardWidgetOut(
                type=widget["type"],
                metric=widget["metric"],
                label=widget["label"],
                value=result.get("value"),
                previous_value=result.get("previous_value"),
                delta_pct=result.get("delta_pct"),
                is_estimated=result.get("is_estimated", False),
                series=result.get("series"),
                rows=result.get("rows"),
            )
        )
    return DashboardOut(id=dashboard["id"], title=dashboard["title"], widgets=widgets)
