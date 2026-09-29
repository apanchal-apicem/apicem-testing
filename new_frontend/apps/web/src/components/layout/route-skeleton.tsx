/**
 * Shown for the ~50-150ms a lazy route chunk takes to fetch on a cold visit
 * (cached by the browser after that — see PERFORMANCE.md). Mirrors the
 * shape of a typical page (eyebrow + title + card grid) rather than a bare
 * spinner, so the swap doesn't read as a layout jolt.
 */
export function RouteSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-8">
        <div className="mb-2 h-3 w-20 rounded bg-surface-2" />
        <div className="h-7 w-64 rounded bg-surface-2" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 rounded-(--radius-lg) border border-border bg-surface-2/60" />
        ))}
      </div>
    </div>
  );
}
