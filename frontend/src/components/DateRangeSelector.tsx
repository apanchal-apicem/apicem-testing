import { useEffect, useRef, useState } from "react";
import { IconCalendar, IconChevronDown } from "./icons";

export const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

export function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(iso: string, includeYear: boolean): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, includeYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
}

// "Last 7 days"/"Last 30 days" read as a relative label with no indication of which actual
// dates they cover -- someone looking at a dashboard a week from now has no way to tell
// whether "Last 30 days" still means what they think it does. Showing the resolved dates
// (skipping the year for the common case where both ends fall in the current year, since
// spelling it out every time is just noise) makes the range unambiguous everywhere it's
// used: the trigger button, the CSV filename, the PDF's saved-as name.
export function formatRangeLabel(startIso: string, endIso: string): string {
  const currentYear = String(new Date().getFullYear());
  const startYear = startIso.slice(0, 4);
  const endYear = endIso.slice(0, 4);
  const crossesYear = startYear !== endYear;
  const startText = formatDateShort(startIso, crossesYear || startYear !== currentYear);
  const endText = formatDateShort(endIso, crossesYear || endYear !== currentYear);
  return `${startText} – ${endText}`;
}

// Reverse-maps a resolved (start, end) pair back to the preset name that produces it, so a
// range restored from the URL on page load can still say "Last 7 days (...)" instead of just
// the bare dates -- the URL only ever stores the two dates, not which button was clicked.
export function matchPresetLabel(startIso: string, endIso: string): string | null {
  if (endIso !== isoDaysAgo(0)) return null;
  return PRESETS.find((preset) => isoDaysAgo(preset.days) === startIso)?.label ?? null;
}

interface DateRangeSelectorProps {
  value: string;
  onChange: (startDate: string, endDate: string) => void;
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(todayIso());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function applyCustomRange(e: React.FormEvent) {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    onChange(customStart, customEnd);
    setOpen(false);
  }

  return (
    <div className="date-range" ref={ref}>
      <button className="date-range-trigger" onClick={() => setOpen((v) => !v)}>
        <IconCalendar size={15} />
        {value}
        <IconChevronDown size={15} />
      </button>
      {open && (
        <div className="date-range-menu">
          {PRESETS.map((preset) => {
            const start = isoDaysAgo(preset.days);
            const end = isoDaysAgo(0);
            return (
              <button
                key={preset.label}
                className="date-range-option"
                onClick={() => {
                  onChange(start, end);
                  setOpen(false);
                }}
              >
                <span className="date-range-option-label">{preset.label}</span>
                <span className="date-range-option-dates">{formatRangeLabel(start, end)}</span>
              </button>
            );
          })}
          <div className="date-range-divider" />
          <form onSubmit={applyCustomRange} className="date-range-custom">
            <label className="date-range-custom-label">Custom range</label>
            <div className="date-range-custom-inputs">
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                aria-label="Start date"
              />
              <span className="muted">to</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={todayIso()}
                onChange={(e) => setCustomEnd(e.target.value)}
                aria-label="End date"
              />
            </div>
            <button className="secondary" type="submit" disabled={!customStart || !customEnd} style={{ width: "100%" }}>
              Apply
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
