import type { MetricFormat } from "@apicem/api-contract";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currencyPrecise = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatByType(value: number, format: MetricFormat): string {
  switch (format) {
    case "currency":
      return Math.abs(value) >= 1000 ? `$${compactNumber.format(value)}` : currency.format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return Math.abs(value) >= 10000 ? compactNumber.format(value) : number.format(value);
  }
}

export function formatCurrency(value: number, precise = false): string {
  return precise ? currencyPrecise.format(value) : currency.format(value);
}

export function formatCompact(value: number): string {
  return compactNumber.format(value);
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
