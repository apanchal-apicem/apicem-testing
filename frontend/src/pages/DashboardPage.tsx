import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type DashboardOut } from "../api/client";
import { DateRangeSelector } from "../components/DateRangeSelector";
import { EmptyState } from "../components/EmptyState";
import { IconPlug } from "../components/icons";
import { KpiTile, metricFormat } from "../components/KpiTile";
import { MetricTable } from "../components/MetricTable";
import { ChartSkeleton, KpiSkeletonRow } from "../components/Skeleton";
import { TrendChart } from "../components/TrendChart";
import { TABLE_COLUMNS_CONFIG, TREND_SERIES_CONFIG } from "../dashboardWidgetConfig";

export function DashboardPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const [dashboard, setDashboard] = useState<DashboardOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeLabel, setRangeLabel] = useState("Last 30 days");
  const [dateParams, setDateParams] = useState<{ start_date?: string; end_date?: string }>({});

  useEffect(() => {
    if (!dashboardId) return;
    setDashboard(null);
    setError(null);
    api
      .getDashboard(dashboardId, dateParams)
      .then(setDashboard)
      .catch((err) => setError(err.message));
  }, [dashboardId, dateParams.start_date, dateParams.end_date]);

  const title = dashboard?.title || "Dashboard";

  // Sparkline source per KPI metric -> which trend widget's series backs it, and how to
  // read a daily value out of it. Only covers metrics that already have a matching trend
  // widget on the SAME dashboard -- reusing data already in this response, not a second
  // query per tile. A KPI with no entry here just renders without a sparkline.
  const trendWidgets = dashboard?.widgets.filter((w) => w.type === "trend") ?? [];
  const sparklineSources: Record<string, (row: Record<string, any>) => number> = {
    gross_revenue: (row) => Number(row.gross_revenue ?? 0),
    net_revenue: (row) => Number(row.net_revenue ?? 0),
    total_ad_spend: (row) => Number(row.google_ads_spend ?? 0) + Number(row.meta_ads_spend ?? 0),
  };
  function sparklineFor(metric: string): number[] | undefined {
    const reader = sparklineSources[metric];
    if (!reader) return undefined;
    const series = trendWidgets[0]?.series;
    if (!series?.length) return undefined;
    return series.map(reader);
  }

  if (error) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">{title}</h1>
        </div>
        <EmptyState
          icon={<IconPlug size={22} />}
          title="Connect a data source to unlock this dashboard"
          description="Once a required data source (or sample data) is connected and the first sync finishes, this dashboard populates automatically."
          actionLabel="Go to Connections"
          actionTo="/connections"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Tenant-scoped metrics from your connected sources</p>
        </div>
        <DateRangeSelector
          value={rangeLabel}
          onChange={(start, end, label) => {
            setDateParams({ start_date: start, end_date: end });
            setRangeLabel(label);
          }}
        />
      </div>

      {!dashboard ? (
        <>
          <KpiSkeletonRow count={4} />
          <ChartSkeleton />
        </>
      ) : (
        <>
          {dashboard.widgets.some((w) => w.type === "kpi") && (
            <div className="kpi-row">
              {dashboard.widgets
                .filter((w) => w.type === "kpi")
                .map((widget) => (
                  <KpiTile
                    key={widget.metric}
                    label={widget.label}
                    value={widget.value}
                    deltaPct={widget.delta_pct}
                    format={metricFormat(widget.metric)}
                    metric={widget.metric}
                    isEstimated={widget.is_estimated}
                    sparklineData={sparklineFor(widget.metric)}
                  />
                ))}
            </div>
          )}
          {dashboard.widgets
            .filter((w) => w.type === "trend")
            .map((widget) => (
              <div className="chart-card" key={widget.metric}>
                <div className="chart-title">{widget.label}</div>
                <TrendChart
                  data={widget.series || []}
                  series={TREND_SERIES_CONFIG[widget.metric] || []}
                />
              </div>
            ))}
          {dashboard.widgets
            .filter((w) => w.type === "table")
            .map((widget) => (
              <div className="chart-card" key={widget.metric}>
                <div className="chart-title">{widget.label}</div>
                <MetricTable rows={widget.rows || []} columns={TABLE_COLUMNS_CONFIG[widget.metric] || []} />
              </div>
            ))}
        </>
      )}
    </div>
  );
}
