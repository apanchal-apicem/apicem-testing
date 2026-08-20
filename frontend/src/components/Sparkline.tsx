interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
}

/** Deliberately axis-less and tooltip-free -- a sparkline's whole job is a compact,
 * at-a-glance shape next to a KPI number, not a precisely-readable chart (that's what the
 * full trend chart below it is for). viewBox + preserveAspectRatio="none" lets it stretch
 * to whatever width its container gives it; vectorEffect keeps the stroke width from
 * distorting under that non-uniform scaling. */
export function Sparkline({ data, color, height = 28 }: SparklineProps) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const viewWidth = 100;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * viewWidth;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${viewWidth} ${height}`}
      preserveAspectRatio="none"
      className="sparkline"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
