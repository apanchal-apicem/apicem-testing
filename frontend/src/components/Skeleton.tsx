export function KpiSkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="kpi-row">
      {Array.from({ length: count }).map((_, i) => (
        <div className="kpi-tile skeleton-tile" key={i}>
          <div className="skeleton-line" style={{ width: "50%", height: 11 }} />
          <div className="skeleton-line" style={{ width: "70%", height: 24, marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="chart-card">
      <div className="skeleton-line" style={{ width: 140, height: 13, marginBottom: 16 }} />
      <div className="skeleton-block" style={{ height: 200 }} />
    </div>
  );
}
