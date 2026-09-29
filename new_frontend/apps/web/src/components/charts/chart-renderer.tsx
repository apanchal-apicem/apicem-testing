import type { QueryResult, ChartType } from "@apicem/api-contract";
import { QueryLineChart } from "./query-line-chart";
import { QueryBarChart } from "./query-bar-chart";
import { QueryDataTable } from "./query-data-table";
import { KpiTile } from "./kpi-tile";
import type { ChartHeight } from "./chart-types";

export function ChartRenderer({
  result,
  chartType,
  height,
}: {
  result: QueryResult;
  chartType?: ChartType;
  height?: ChartHeight;
}) {
  const type = chartType ?? result.chartSuggestion;

  if (type === "kpi") {
    const yCol = result.columns[1];
    const last = result.rows[result.rows.length - 1];
    const value = typeof last?.[yCol?.key] === "number" ? (last[yCol.key] as number) : 0;
    const series = result.rows.map((r) => (typeof r[yCol?.key] === "number" ? (r[yCol.key] as number) : 0));
    return (
      <KpiTile
        label={yCol?.label ?? "Value"}
        value={value}
        format={yCol?.type === "currency" ? "currency" : "number"}
        series={series}
      />
    );
  }
  if (type === "bar") return <QueryBarChart rows={result.rows} columns={result.columns} height={height} />;
  if (type === "line") return <QueryLineChart rows={result.rows} columns={result.columns} height={height} />;
  return <QueryDataTable rows={result.rows} columns={result.columns} />;
}
