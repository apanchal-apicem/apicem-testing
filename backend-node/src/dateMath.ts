// A tiny pure-calendar-date type, deliberately NOT built on JS `Date` arithmetic directly --
// JS `Date` carries a timezone/DST-sensitive instant, while Python's `date` (what
// assistant_intents.py is written against) is a pure calendar value with no time-of-day or
// zone at all. Every function here does arithmetic via a UTC-anchored epoch internally
// (immune to DST, since UTC has none) and only ever exposes/accepts plain {y, m, d} values --
// this is what makes it a faithful, timezone-safe port of Python's date math rather than a
// source of new off-by-one bugs around DST transitions.
export interface PlainDate {
  y: number;
  m: number; // 1-12
  d: number;
}

function toEpochDay(date: PlainDate): number {
  return Date.UTC(date.y, date.m - 1, date.d) / 86_400_000;
}

function fromEpochDay(epochDay: number): PlainDate {
  const dt = new Date(epochDay * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Today's date in the SERVER's local timezone -- matches Python's date.today(), which reads
 * the local system clock, not UTC. Once constructed, treated as a pure calendar value with no
 * further timezone sensitivity (see module comment). */
export function today(): PlainDate {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

export function addDays(date: PlainDate, days: number): PlainDate {
  return fromEpochDay(toEpochDay(date) + days);
}

export function daysBetweenInclusive(start: PlainDate, end: PlainDate): number {
  return toEpochDay(end) - toEpochDay(start) + 1;
}

export function compare(a: PlainDate, b: PlainDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of THIS month -- a standard trick, still exact
  // via the UTC epoch so leap years fall out for free (Date.UTC handles Feb 29 correctly).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function firstOfMonth(date: PlainDate): PlainDate {
  return { y: date.y, m: date.m, d: 1 };
}

export function lastOfMonth(year: number, month: number): PlainDate {
  return { y: year, m: month, d: daysInMonth(year, month) };
}

/** Same-month-and-day the following/preceding N years -- Feb 29 in a non-leap target year
 * falls back to day 28, matching Python's `_shift_years`' explicit leap-day fallback. */
export function shiftYears(date: PlainDate, years: number): PlainDate {
  const targetYear = date.y + years;
  const maxDay = daysInMonth(targetYear, date.m);
  return { y: targetYear, m: date.m, d: Math.min(date.d, maxDay) };
}

/** Shifts by whole calendar months, clamping the day-of-month into the target month's real
 * length (e.g. Jan 31 shifted +1 month lands on Feb 28/29, not a rolled-over March date) --
 * matches Python's `_shift_months` exactly. */
export function shiftMonths(date: PlainDate, months: number): PlainDate {
  const monthIndex = date.m - 1 + months;
  const year = date.y + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  const day = Math.min(date.d, daysInMonth(year, month));
  return { y: year, m: month, d: day };
}

export function toISO(date: PlainDate): string {
  const mm = String(date.m).padStart(2, "0");
  const dd = String(date.d).padStart(2, "0");
  return `${date.y}-${mm}-${dd}`;
}

export function fromISO(iso: string): PlainDate {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

const MONTH_NAMES_FULL = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month: number): string {
  return MONTH_NAMES_FULL[month];
}

export function formatShort(date: PlainDate): string {
  // "Aug 24" -- matches Python's strftime("%b %d") for the shift-back-by-length window label.
  const short = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${short[date.m]} ${String(date.d).padStart(2, "0")}`;
}

export function formatShortWithYear(date: PlainDate): string {
  return `${formatShort(date)}, ${date.y}`;
}
