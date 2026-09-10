import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, type DashboardOut, type DashboardWidget } from "../api/client";
import { DateRangeSelector, formatRangeLabel, isoDaysAgo, matchPresetLabel } from "../components/DateRangeSelector";
import { EmptyState } from "../components/EmptyState";
import { IconDownload, IconFileText, IconPlug } from "../components/icons";
import { InfoNote } from "../components/InfoNote";
import { KpiTile, metricFormat } from "../components/KpiTile";
import { MetricTable } from "../components/MetricTable";
import { ChartSkeleton, KpiSkeletonRow } from "../components/Skeleton";
import { TrendChart } from "../components/TrendChart";
import { TABLE_COLUMNS_CONFIG, TREND_SERIES_CONFIG } from "../dashboardWidgetConfig";
import { dashboardToCsv, downloadCsv, widgetToCsv } from "../lib/csv";

// Mirrors low_stock_count's own threshold (metric_registry.py) exactly, so the Inventory
// dashboard's KPI tile and this toggle's "Low stock (N)" count never disagree.
const LOW_STOCK_THRESHOLD = 15;

export function DashboardPage() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const [dashboard, setDashboard] = useState<DashboardOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<"low_stock" | "all">("low_stock");

  // The URL is the source of truth for the date range, not component state -- refreshing,
  // sharing the link, or hitting back all reproduce exactly what's on screen. Falls back to
  // the same default the backend itself uses when no params are sent (routers/dashboards.py:
  // end_date - 30 days) so the label is accurate even before the URL has been seeded below.
  const [searchParams, setSearchParams] = useSearchParams();
  const startDate = searchParams.get("start_date") || isoDaysAgo(30);
  const endDate = searchParams.get("end_date") || isoDaysAgo(0);
  const dateParams = { start_date: startDate, end_date: endDate };
  const rangeLabel = (() => {
    const presetName = matchPresetLabel(startDate, endDate);
    const dates = formatRangeLabel(startDate, endDate);
    return presetName ? `${presetName} (${dates})` : dates;
  })();

  useEffect(() => {
    if (!dashboardId) return;
    setDashboard(null);
    setError(null);
    api
      .getDashboard(dashboardId, dateParams)
      .then(setDashboard)
      .catch((err) => setError(err.message));
  }, [dashboardId, startDate, endDate]);

  // Seeds the URL with the default range on first load of a dashboard that has no explicit
  // range yet, so "copy this link" works even before the user ever opens the date picker.
  // Only fires again when dashboardId itself changes, not on every render.
  useEffect(() => {
    if (!searchParams.get("start_date") || !searchParams.get("end_date")) {
      setSearchParams({ start_date: startDate, end_date: endDate }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId]);

  function handleRangeChange(start: string, end: string) {
    setSearchParams({ start_date: start, end_date: end }, { replace: true });
  }

  const title = dashboard?.title || "Dashboard";

  function handleDownloadCsv() {
    if (!dashboard) return;
    const csv = dashboardToCsv(dashboard, rangeLabel);
    downloadCsv(`${dashboard.title} - ${rangeLabel}.csv`, csv);
  }

  function handleDownloadWidgetCsv(widget: DashboardWidget) {
    if (!dashboard) return;
    const csv = widgetToCsv(widget, dashboard.title, rangeLabel);
    downloadCsv(`${dashboard.title} - ${widget.label} (${rangeLabel}).csv`, csv);
  }

  function handleDownloadPdf() {
    if (!dashboard) return;
    // The print dialog suggests document.title as the save-as filename -- swap it in for
    // the duration of the print and restore it once the dialog closes (afterprint fires for
    // both "save" and "cancel", which is what we want either way).
    const previousTitle = document.title;
    document.title = `${dashboard.title} - ${rangeLabel}`;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

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
        </div>
        <div className="dashboard-header-actions">
          {dashboard && <InfoNote text={dashboard.date_note} />}
          <DateRangeSelector value={rangeLabel} onChange={handleRangeChange} />
          <button className="secondary" onClick={handleDownloadCsv} disabled={!dashboard}>
            <IconDownload size={14} />
            CSV
          </button>
          <button className="secondary" onClick={handleDownloadPdf} disabled={!dashboard}>
            <IconFileText size={14} />
            PDF
          </button>
        </div>
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
                <div className="chart-card-header">
                  <div className="chart-title">{widget.label}</div>
                  <div className="chart-card-header-actions">
                    <button
                      className="chart-card-csv"
                      onClick={() => handleDownloadWidgetCsv(widget)}
                      aria-label={`Download ${widget.label} as CSV`}
                    >
                      <IconDownload size={13} />
                    </button>
                  </div>
                </div>
                <TrendChart
                  data={widget.series || []}
                  series={TREND_SERIES_CONFIG[widget.metric] || []}
                />
              </div>
            ))}
          {dashboard.widgets
            .filter((w) => w.type === "table")
            .map((widget) => {
              const isInventoryTable = widget.metric === "inventory_by_product";
              const rows = widget.rows || [];
              const lowStockRows = rows.filter((r) => Number(r.quantity_available) < LOW_STOCK_THRESHOLD);
              const visibleRows = isInventoryTable && inventoryFilter === "low_stock" ? lowStockRows : rows;
              return (
                <div className="chart-card" key={widget.metric}>
                  <div className="chart-card-header">
                    <div className="chart-title">{widget.label}</div>
                    <div className="chart-card-header-actions">
                      {isInventoryTable && (
                        <div className="table-filter-toggle">
                          <button
                            type="button"
                            className={inventoryFilter === "low_stock" ? "active" : ""}
                            onClick={() => setInventoryFilter("low_stock")}
                          >
                            Low stock ({lowStockRows.length})
                          </button>
                          <button
                            type="button"
                            className={inventoryFilter === "all" ? "active" : ""}
                            onClick={() => setInventoryFilter("all")}
                          >
                            All inventory ({rows.length})
                          </button>
                        </div>
                      )}
                      <button
                        className="chart-card-csv"
                        onClick={() =>
                          handleDownloadWidgetCsv({
                            ...widget,
                            rows: visibleRows,
                            label: isInventoryTable
                              ? `${widget.label} (${inventoryFilter === "low_stock" ? "Low stock" : "All inventory"})`
                              : widget.label,
                          })
                        }
                        aria-label={`Download ${widget.label} as CSV`}
                      >
                        <IconDownload size={13} />
                      </button>
                    </div>
                  </div>
                  <MetricTable rows={visibleRows} columns={TABLE_COLUMNS_CONFIG[widget.metric] || []} />
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}
