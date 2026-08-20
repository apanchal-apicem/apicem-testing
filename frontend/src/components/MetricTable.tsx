import { formatTableCell } from "../lib/format";

export interface MetricTableColumn {
  key: string;
  label: string;
  numeric?: boolean;
  /** For text columns sourced from an internal identifier (e.g. source_system's
   * "google_ads") rather than already-display-ready text. */
  formatter?: (value: string | number) => string;
}

interface MetricTableProps {
  rows: Record<string, string | number>[];
  columns: MetricTableColumn[];
}

/** One generic table renders every TABLE_METRICS shape (top products, campaign performance,
 * inventory) instead of a bespoke component per dashboard -- each dashboard just supplies
 * its own column list; formatTableCell infers $/%/x formatting from the column key. */
export function MetricTable({ rows, columns }: MetricTableProps) {
  if (!rows?.length) {
    return <div className="muted">No data for this period yet.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th className="rank"></th>
            {columns.map((col) => (
              <th key={col.key} style={col.numeric ? { textAlign: "right" } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="rank">{i + 1}</td>
              {columns.map((col) => (
                <td key={col.key} className={col.numeric ? "numeric" : undefined}>
                  {col.numeric
                    ? formatTableCell(col.key, row[col.key])
                    : col.formatter && row[col.key] != null
                      ? col.formatter(row[col.key])
                      : row[col.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
