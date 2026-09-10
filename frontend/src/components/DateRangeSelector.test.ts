import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRangeLabel, isoDaysAgo, matchPresetLabel, PRESETS } from "./DateRangeSelector";

// Pinned "now" so isoDaysAgo's day math is deterministic. This is the exact function whose
// convention (today - N, an N+1-day inclusive window) diverged from assistant_intents.py's
// resolve_date_range on the backend, producing two different numbers for the same "Last 7
// days" label (dashboard $14,992.24 vs chat $12,468.73) -- see the backend regression tests
// in backend/tests/test_assistant_intents.py for the other half of that fix. Pinning this
// convention here means a future change to either side breaks a test instead of silently
// diverging again.
describe("isoDaysAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("days=0 is today", () => {
    expect(isoDaysAgo(0)).toBe("2026-08-31");
  });

  it("days=7 is an 8-day-inclusive window's start, matching the backend's last_7_days", () => {
    expect(isoDaysAgo(7)).toBe("2026-08-24");
  });

  it("days=30 matches the backend's last_30_days start", () => {
    expect(isoDaysAgo(30)).toBe("2026-08-01");
  });

  it("crosses a month boundary correctly", () => {
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    expect(isoDaysAgo(7)).toBe("2026-08-26");
  });
});

describe("formatRangeLabel", () => {
  it("omits the year when both dates fall in the current year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    expect(formatRangeLabel("2026-08-24", "2026-08-31")).toBe("Aug 24 – Aug 31");
    vi.useRealTimers();
  });

  it("includes the year on both ends once the range crosses a year boundary", () => {
    expect(formatRangeLabel("2025-12-28", "2026-01-03")).toBe("Dec 28, 2025 – Jan 3, 2026");
  });
});

describe("matchPresetLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recognizes a range that exactly matches a preset", () => {
    const preset = PRESETS.find((p) => p.label === "Last 7 days")!;
    const start = isoDaysAgo(preset.days);
    expect(matchPresetLabel(start, isoDaysAgo(0))).toBe("Last 7 days");
  });

  it("returns null for a custom range matching no preset", () => {
    expect(matchPresetLabel("2026-08-15", "2026-08-20")).toBeNull();
  });

  it("returns null when the end date isn't today, even if the span matches a preset", () => {
    expect(matchPresetLabel("2026-08-17", "2026-08-24")).toBeNull();
  });
});
