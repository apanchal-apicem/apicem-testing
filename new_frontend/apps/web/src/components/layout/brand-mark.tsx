import { cn } from "@/lib/utils";

/**
 * The "apicem partners" wordmark. Two transparent PNGs (dark text for light
 * backgrounds, light text for dark backgrounds) toggle via the same
 * system/light/dark CSS rules as the rest of the theme (see theme.css) — the
 * one hidden by `display: none` takes up no layout space, so only one ever
 * renders at a time and both share the same `className` for sizing.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className="inline-flex">
      <img src="/brand/apicem-logo-light.png" alt="Apicem Partners" className={cn("logo-for-light w-auto", className)} />
      <img src="/brand/apicem-logo-dark.png" alt="Apicem Partners" className={cn("logo-for-dark w-auto", className)} />
    </span>
  );
}

/**
 * The "apicem engine" product label that sits under `BrandMark`. Matches the
 * logo's own two-weight styling — "apicem" at Afacad Flux's normal weight,
 * "engine" at its thin weight — rather than a single uppercase run, so the
 * two names read as one family of marks. `className` controls size, color,
 * and tracking on the wrapper; only the per-word weight is fixed here.
 */
export function ProductLabel({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-normal">apicem</span> <span className="font-thin">engine</span>
    </span>
  );
}
