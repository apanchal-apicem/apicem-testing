import { useEffect, useRef, useState } from "react";
import { IconCalendar, IconChevronDown } from "./icons";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface DateRangeSelectorProps {
  value: string;
  onChange: (startDate: string, endDate: string, label: string) => void;
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
    const label = `${customStart} → ${customEnd}`;
    onChange(customStart, customEnd, label);
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
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className="date-range-option"
              onClick={() => {
                onChange(isoDaysAgo(preset.days), isoDaysAgo(0), preset.label);
                setOpen(false);
              }}
            >
              {preset.label}
            </button>
          ))}
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
