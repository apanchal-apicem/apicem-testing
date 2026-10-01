// Ports backend/app/assistant_intents.py -- Deterministic, rule-based question answering for
// Ask Apicem Engine.
//
// This is the "your own model" the definitions live in -- no LLM, no network call, no
// sampling randomness. A question is matched against METRIC_PHRASES below (longest matching
// phrase wins) to pick a metric, then matchDateWindow() to pick an actual date range (either
// a specific named month like "July 2026", or one of DATE_RANGE_PHRASES' relative windows),
// and a couple of keywords to decide whether a comparison to the previous period was asked
// for. Everything downstream of that match -- computeMetric() -- is the exact same
// server-side code every dashboard already uses.
//
// This can never contradict itself the way an earlier Ollama-based version occasionally did:
// the same question always maps to the same metric, the same date range, and the direction
// word is always read straight off the sign of the real delta_pct, never phrased freely. The
// trade-off is coverage, not correctness -- a question phrased in a way nothing below
// anticipates gets an honest "I don't recognize that" instead of a guess. The fix for that is
// always the same: add the phrase below, not "make the model smarter."
import { settings } from "./config.js";
import * as dm from "./dateMath.js";
import type { PlainDate } from "./dateMath.js";
import { classifyViaGroq } from "./groqFallback.js";
import { computeMetric, SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS, type MetricFormat, type MetricResult } from "./metricRegistry.js";
import type { PgClient } from "./db.js";
import { allow as rateLimitAllow } from "./rateLimit.js";

// Bounds worst-case Groq API spend independent of the is_demo gate below -- keyed per tenant
// (not per IP, unlike rateLimit()'s route-level dependency) since this check only fires deep
// inside askAssistant(), after every deterministic match attempt has already failed.
const GROQ_FALLBACK_MAX_CALLS_PER_HOUR = 20;

export const ALL_METRIC_KEYS: string[] = [
  ...Object.keys(SCALAR_METRICS),
  ...Object.keys(SERIES_METRICS),
  ...Object.keys(TABLE_METRICS),
];

// Purely a display grouping for the "what can I ask about" list on the Assistant page --
// mirrors Shell.tsx's Sales/Marketing/Inventory nav sections.
const CATEGORY_METRIC_KEYS: [string, string[]][] = [
  ["Sales", [
    "gross_revenue", "net_revenue", "order_count", "total_discounts", "total_refunds",
    "new_customer_count", "aov", "gross_margin_pct", "repeat_customer_rate", "refund_rate_pct", "revenue_trend",
    "discounts_refunds_trend", "top_products",
  ]],
  ["Marketing", [
    "total_ad_spend", "total_conversions", "blended_roas", "blended_cpa", "blended_ctr",
    "ad_spend_trend", "campaign_performance",
  ]],
  ["Inventory", [
    "total_inventory_value", "total_units_on_hand", "low_stock_count", "inventory_by_product",
  ]],
];

{
  const categorized = CATEGORY_METRIC_KEYS.flatMap(([, keys]) => keys).sort();
  const registryKeys = [...ALL_METRIC_KEYS].sort();
  if (JSON.stringify(categorized) !== JSON.stringify(registryKeys)) {
    throw new Error(
      "CATEGORY_METRIC_KEYS in assistantIntents.ts is out of sync with metricRegistry.ts -- " +
        "every metric key must appear in exactly one category.",
    );
  }
}

// Every recognized way of referring to each metric. Ordering within a list doesn't matter;
// matching picks the single longest phrase that appears anywhere in the question, across
// every metric, so a more specific phrase (e.g. "gross revenue") correctly wins over a
// shorter, more generic one (e.g. "revenue") when both are present.
const METRIC_PHRASES: Record<string, string[]> = {
  // Sales
  gross_revenue: ["gross revenue", "gross sales", "revenue before discounts"],
  net_revenue: [
    "net revenue", "revenue", "sales", "earnings",
    "how much did i make", "how much money did i make", "how much have i made",
    "how am i doing", "how's business", "hows business", "give me an overview", "overview",
  ],
  order_count: [
    "orders", "order count", "number of orders", "how many orders",
    "how many sales", "number of sales",
  ],
  total_discounts: ["total discounts", "discounts", "how much discount", "discount amount"],
  total_refunds: [
    "total refunds", "refunds", "how much refunded", "how much did i refund",
    "returns", "how many refunds",
  ],
  new_customer_count: [
    "new customers", "new customer count", "how many new customers", "first time customers",
  ],
  aov: [
    "average order value", "aov", "average order size", "average sale amount",
    "average basket size", "average cart value", "how has average order value changed",
  ],
  gross_margin_pct: [
    "gross margin", "margin percent", "profit margin", "how profitable am i", "profitability",
  ],
  repeat_customer_rate: [
    "repeat customer rate", "repeat purchase rate", "repeat customers", "customer retention",
    "retention rate", "returning customers", "repeat purchase", "share of customers made a repeat purchase",
    "what share of customers made a repeat purchase", "share of repeat customers",
  ],
  refund_rate_pct: [
    "refund rate", "return rate", "returns rate", "refund percent", "return percent",
  ],
  revenue_trend: [
    "revenue trend", "sales trend", "revenue over time", "sales over time", "daily revenue",
    "trend", "graph my revenue", "graph revenue", "plot revenue", "plot sales",
    "how has net revenue trended", "how has revenue trended",
  ],
  discounts_refunds_trend: [
    "discounts and refunds trend", "discounts refunds trend", "discounts trend", "refunds trend",
  ],
  top_products: [
    "top products by revenue", "top products", "best selling products", "best sellers",
    "top selling", "which products sell best", "what's selling well", "whats selling well",
    "what are people buying", "drove the most revenue", "which products drove the most revenue",
    "highest revenue products", "most revenue products",
  ],

  // Marketing
  total_ad_spend: [
    "total ad spend", "ad spend", "advertising spend",
    "how much did i spend on ads", "marketing spend", "ad budget",
  ],
  total_conversions: ["total conversions", "conversions", "how many conversions"],
  blended_roas: ["blended roas", "roas", "return on ad spend", "ad performance", "roi on ads"],
  blended_cpa: [
    "blended cpa", "cost per acquisition", "cost per conversion", "cpa",
    "acquisition cost", "cost to acquire a customer",
  ],
  blended_ctr: ["blended ctr", "click through rate", "click-through rate", "ctr", "click rate"],
  ad_spend_trend: ["ad spend trend", "advertising spend trend", "ad spend over time"],
  campaign_performance: [
    "campaign performance", "which campaigns", "how are my campaigns", "campaign results",
    "best campaign", "worst campaign",
  ],

  // Inventory
  total_inventory_value: [
    "inventory value", "value of my inventory", "how much inventory", "stock value",
    "what's my inventory worth", "whats my inventory worth",
  ],
  total_units_on_hand: ["units on hand", "total units", "how many units", "total stock"],
  low_stock_count: [
    "low stock products count", "low stock count", "how many products are low on stock",
    "how many low stock", "number of low stock products",
  ],
  inventory_by_product: [
    "inventory by product", "which products are low on stock", "low stock products",
    "products low on stock", "what's low on stock", "whats low on stock", "low inventory",
    "what needs restocking", "what should i reorder",
  ],
};

{
  const categorized = new Set(Object.keys(METRIC_PHRASES));
  const registryKeys = new Set(ALL_METRIC_KEYS);
  const same = categorized.size === registryKeys.size && [...categorized].every((k) => registryKeys.has(k));
  if (!same) {
    throw new Error(
      "METRIC_PHRASES in assistantIntents.ts is out of sync with metricRegistry.ts -- every " +
        "metric key needs at least one recognized phrase, or it can never be reached.",
    );
  }
}

// Idiomatic phrasings only -- anything literally saying "last/past N days" or "N months" is
// handled generically by matchRelativeDays()/matchRelativeMonths() below for any N.
const DATE_RANGE_PHRASES: [string, string[]][] = [
  ["same_period_last_year", [
    "same time last year", "this time last year", "year over year", "yoy", "vs last year",
  ]],
  ["last_year", ["last year"]],
  ["this_year", ["this year", "year to date", "ytd"]],
  ["last_month", ["last month", "previous month"]],
  ["this_month", ["this month"]],
  ["last_90_days", ["last quarter", "past quarter", "this quarter"]],
  ["last_7_days", ["this week", "past week", "last week"]],
  ["last_30_days", ["past month"]],
];

const DATE_RANGE_LABELS: Record<string, string> = {
  last_7_days: "the last 7 days",
  last_30_days: "the last 30 days",
  last_90_days: "the last 90 days",
  this_month: "this month",
  last_month: "last month",
  this_year: "this year",
  last_year: "last year",
  same_period_last_year: "the same period last year",
};

const COMPARE_PHRASES = [
  "compar", "vs", "versus", "change", "increase", "decrease", "up or down", "higher or lower",
  "previous period", "prior period", "period before", "before that",
  "growth", "growing", "declining", "dropped", "went up", "went down",
  "better or worse", "how does it compare",
  // Deliberately NOT adding bare "trend" here -- see the Python source's own comment: it'd
  // read as compare-language on every trend question, colliding with revenue_trend's bare
  // "trend" phrase in METRIC_PHRASES.
];

const DEFAULT_DATE_RANGE = "last_30_days";

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

function metricLabel(key: string): string {
  for (const registry of [SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS]) {
    if (key in registry) return registry[key].label;
  }
  return key;
}

function metricKind(key: string): "number" | "trend" | "table" {
  if (key in SCALAR_METRICS) return "number";
  if (key in SERIES_METRICS) return "trend";
  return "table";
}

export interface CapabilityCategory {
  category: string;
  metrics: { key: string; label: string; kind: string }[];
}

/** The "what you can ask about" list on the Assistant page -- reshaped from
 * CATEGORY_METRIC_KEYS so it can never go out of sync with what the assistant can actually
 * answer (both are checked against the same registry at module load). */
export function buildCapabilities(): CapabilityCategory[] {
  return CATEGORY_METRIC_KEYS.map(([category, keys]) => ({
    category,
    metrics: keys.map((key) => ({ key, label: metricLabel(key), kind: metricKind(key) })),
  }));
}

export function matchMetric(question: string): string | null {
  const q = question.toLowerCase();
  let bestKey: string | null = null;
  let bestLen = 0;
  for (const [metricKey, phrases] of Object.entries(METRIC_PHRASES)) {
    for (const phrase of phrases) {
      if (q.includes(phrase) && phrase.length > bestLen) {
        bestKey = metricKey;
        bestLen = phrase.length;
      }
    }
  }
  return bestKey;
}

export function resolveDateRange(key: string, todayDate: PlainDate): [PlainDate, PlainDate] {
  if (key === "last_7_days") return [dm.addDays(todayDate, -7), todayDate];
  if (key === "last_30_days") return [dm.addDays(todayDate, -30), todayDate];
  if (key === "last_90_days") return [dm.addDays(todayDate, -90), todayDate];
  if (key === "this_month") return [dm.firstOfMonth(todayDate), todayDate];
  if (key === "last_month") {
    const firstOfThisMonth = dm.firstOfMonth(todayDate);
    const lastOfLastMonth = dm.addDays(firstOfThisMonth, -1);
    return [dm.firstOfMonth(lastOfLastMonth), lastOfLastMonth];
  }
  if (key === "this_year") return [{ y: todayDate.y, m: 1, d: 1 }, todayDate];
  if (key === "last_year") return [{ y: todayDate.y - 1, m: 1, d: 1 }, { y: todayDate.y - 1, m: 12, d: 31 }];
  if (key === "same_period_last_year") {
    // Mirrors the app's own default recency window (the dashboards' "Last 30 days" default),
    // shifted back exactly one year.
    return [dm.shiftYears(dm.addDays(todayDate, -30), -1), dm.shiftYears(todayDate, -1)];
  }
  throw new Error(`unknown date_range: ${key}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type DateWindowMatch = [PlainDate, PlainDate, string];

/** "july", "july 2026", "july '26", "jul 26" -- a real calendar month, which
 * DATE_RANGE_PHRASES has no way to express at all. "may" alone is excluded (too easily the
 * common word, not the month) unless it's followed by a year -- every other month name is
 * unambiguous enough to match bare. */
function matchNamedMonth(question: string, todayDate: PlainDate): DateWindowMatch | null {
  const q = question.toLowerCase();
  for (const [name, monthNum] of Object.entries(MONTH_NAMES)) {
    const pattern =
      name === "may"
        ? /* eslint-disable-next-line prefer-regex-literals */ new RegExp(String.raw`\bmay\s+'?(\d{2,4})\b`)
        : new RegExp(`\\b${escapeRegex(name)}\\b(?:\\s+'?(\\d{2,4}))?`);
    const match = pattern.exec(q);
    if (!match) continue;
    const yearText = match[1];
    let year: number;
    if (yearText) {
      year = Number(yearText);
      if (year < 100) year += 2000;
    } else {
      year = todayDate.y;
      if (dm.compare({ y: year, m: monthNum, d: 1 }, todayDate) > 0) year -= 1; // bare "December" in January means last December
    }
    const start: PlainDate = { y: year, m: monthNum, d: 1 };
    let end: PlainDate = dm.lastOfMonth(year, monthNum);
    if (dm.compare(end, todayDate) > 0) end = todayDate; // the current, still-in-progress month
    return [start, end, `${dm.monthName(monthNum)} ${year}`];
  }
  return null;
}

/** "last N days"/"past N days" for any N -- not just the fixed 7/30/90 a user might not say. */
function matchRelativeDays(question: string, todayDate: PlainDate): DateWindowMatch | null {
  const match = /(?:last|past)\s+(\d+)\s+days?/.exec(question.toLowerCase());
  if (!match) return null;
  const n = Number(match[1]);
  if (n <= 0) return null;
  const start = dm.addDays(todayDate, -n);
  return [start, todayDate, `the last ${n} days`];
}

/** "last N weeks"/"past N weeks" -- a rolling window ending today. */
function matchRelativeWeeks(question: string, todayDate: PlainDate): DateWindowMatch | null {
  const match = /(?:last|past)\s+(\d+)\s+weeks?/.exec(question.toLowerCase());
  if (!match) return null;
  const n = Number(match[1]);
  if (n <= 0) return null;
  const start = dm.addDays(todayDate, -(n * 7));
  return [start, todayDate, `the last ${n} weeks`];
}

/** "last N months"/"past N months" -- a rolling window ending today (not aligned to calendar
 * month boundaries; that's what a named month or "this/last month" is for). */
function matchRelativeMonths(question: string, todayDate: PlainDate): DateWindowMatch | null {
  const match = /(?:last|past)\s+(\d+)\s+months?/.exec(question.toLowerCase());
  if (!match) return null;
  const n = Number(match[1]);
  if (n <= 0) return null;
  const start = dm.addDays(dm.shiftMonths(todayDate, -n), 1);
  return [start, todayDate, `the last ${n} months`];
}

/** "today"/"yesterday"/"the day before yesterday". "day before yesterday" is checked FIRST
 * since it contains "yesterday" as a substring -- checking bare "yesterday" first would
 * silently resolve it one day wrong. A bare, context-relative "day before" is NOT handled
 * here -- see wantsDayBefore()/shiftToDayBefore(). */
function matchTodayYesterday(question: string, todayDate: PlainDate): DateWindowMatch | null {
  const q = question.toLowerCase();
  if (/\bday before yesterday\b/.test(q)) {
    const d = dm.addDays(todayDate, -2);
    return [d, d, "the day before yesterday"];
  }
  if (/\byesterday\b/.test(q)) {
    const d = dm.addDays(todayDate, -1);
    return [d, d, "yesterday"];
  }
  if (/\btoday\b/.test(q)) {
    return [todayDate, todayDate, "today"];
  }
  return null;
}

/** Bare "day before"/"the day before"/"day before that" in a follow-up with no metric of its
 * own. Deliberately checks for "day before" rather than just "before" -- "before" alone would
 * collide with COMPARE_PHRASES' "period before" (a different, length-preserving shift). */
function wantsDayBefore(question: string): boolean {
  return question.toLowerCase().includes("day before");
}

/** Always resolves to exactly ONE day immediately preceding the previous answer's window
 * start -- regardless of how long that previous window was. */
function shiftToDayBefore(previousStartDate: string): DateWindowMatch {
  const prevStart = dm.fromISO(previousStartDate);
  const d = dm.addDays(prevStart, -1);
  return [d, d, dm.formatShortWithYear(d)];
}

/** Like matchDateWindow() below, but returns null instead of silently defaulting when the
 * question names no recognizable window at all. Checked most-specific-first: a single named
 * day, a named month, or an explicit "last N days/months" wins over generic idiomatic
 * phrases. */
export function tryMatchDateWindow(question: string, todayDate: PlainDate): DateWindowMatch | null {
  const todayYesterday = matchTodayYesterday(question, todayDate);
  if (todayYesterday) return todayYesterday;

  const namedMonth = matchNamedMonth(question, todayDate);
  if (namedMonth) return namedMonth;

  const relativeDays = matchRelativeDays(question, todayDate);
  if (relativeDays) return relativeDays;

  const relativeWeeks = matchRelativeWeeks(question, todayDate);
  if (relativeWeeks) return relativeWeeks;

  const relativeMonths = matchRelativeMonths(question, todayDate);
  if (relativeMonths) return relativeMonths;

  const q = question.toLowerCase();
  for (const [key, phrases] of DATE_RANGE_PHRASES) {
    if (phrases.some((phrase) => q.includes(phrase))) {
      const [start, end] = resolveDateRange(key, todayDate);
      return [start, end, DATE_RANGE_LABELS[key]];
    }
  }
  return null;
}

/** Returns [start, end, label], defaulting to DEFAULT_DATE_RANGE when the question names no
 * recognizable window -- the right behavior once a metric is already known. */
export function matchDateWindow(question: string, todayDate: PlainDate): DateWindowMatch {
  const explicit = tryMatchDateWindow(question, todayDate);
  if (explicit) return explicit;
  const [start, end] = resolveDateRange(DEFAULT_DATE_RANGE, todayDate);
  return [start, end, DATE_RANGE_LABELS[DEFAULT_DATE_RANGE]];
}

export function wantsCompare(question: string): boolean {
  const q = question.toLowerCase();
  return COMPARE_PHRASES.some((phrase) => q.includes(phrase));
}

// Word-boundary regex, unlike every other phrase list in this file (which is deliberately
// plain substring containment). A bare "hi" as a substring would false-match
// "which"/"this"/"shipping"/"achieve", so greeting words specifically need \b. Checked ONLY as
// an alternative to the final "I don't recognize that" rejection in askAssistant() below --
// never before metric matching.
const GREETING_PATTERNS = [
  /\bhi\b/, /\bhello\b/, /\bhey\b/, /\bhowdy\b/,
  /\bthanks\b/, /\bthank you\b/,
  /\bwho are you\b/, /\bwhat are you\b/, /\bwhat is this\b/,
  /\bwhat can you (help with|do)\b/, /\bhelp\b/,
];

export function isGreeting(question: string): boolean {
  const q = question.toLowerCase();
  return GREETING_PATTERNS.some((pattern) => pattern.test(q));
}

function formatValue(value: number | null | undefined, fmt: MetricFormat | undefined): string {
  if (value === null || value === undefined) return "not available";
  if (fmt === "currency") return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (fmt === "percent") return `${(value * 100).toFixed(1)}%`;
  if (fmt === "ratio") return `${value.toFixed(2)}x`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function metricDefinition(key: string): { format?: MetricFormat } {
  if (key in SCALAR_METRICS) return SCALAR_METRICS[key];
  if (key in SERIES_METRICS) return {};
  if (key in TABLE_METRICS) return {};
  throw new Error(`unknown metric: ${key}`);
}

export interface AskAssistantResult {
  reply: string;
  results: (MetricResult & { start_date: string; end_date: string })[];
}

/**
 * The whole request/response cycle: match, look up, template a sentence. No LLM involved, so
 * there's nothing here that can sample a different answer to the same question twice, or
 * misread which direction a number moved.
 *
 * previousMetric/previousStartDate/previousEndDate are optional, frontend-supplied context:
 * the metric and window the LAST answer was about. They only ever matter when THIS question
 * has no metric of its own -- and there are two different shapes of follow-up that can mean:
 *
 *   - "and yesterday?" / "what about last week?" names an explicit NEW window but no metric --
 *     reuse the previous answer's metric with THIS window.
 *   - "and for the previous period from that?" names no window at all, just intent -- reuse
 *     the previous metric with its window shifted back by its own length.
 *
 * isDemo disables the optional Groq classifier for the public "View live demo" account
 * specifically, so public traffic can never silently burn API quota/cost even when a real key
 * is configured.
 */
export async function askAssistant(
  client: PgClient,
  tenantId: string,
  message: string,
  previousMetric: string | null = null,
  previousStartDate: string | null = null,
  previousEndDate: string | null = null,
  isDemo = false,
): Promise<AskAssistantResult> {
  let metricKey = matchMetric(message);
  const todayDate = dm.today();
  const allMetricKeys = new Set(ALL_METRIC_KEYS);
  const hasPreviousContext = Boolean(
    previousMetric && allMetricKeys.has(previousMetric) && previousStartDate && previousEndDate,
  );
  let aiAssisted = false;

  let startDate: PlainDate;
  let endDate: PlainDate;
  let window: string;
  let compare: boolean;

  const newWindowFromContext = hasPreviousContext ? tryMatchDateWindow(message, todayDate) : null;

  if (metricKey !== null) {
    [startDate, endDate, window] = matchDateWindow(message, todayDate);
    compare = wantsCompare(message) && metricKey in SCALAR_METRICS;
  } else if (hasPreviousContext && newWindowFromContext) {
    metricKey = previousMetric;
    [startDate, endDate, window] = newWindowFromContext;
    compare = wantsCompare(message) && metricKey! in SCALAR_METRICS;
  } else if (hasPreviousContext && wantsDayBefore(message)) {
    try {
      [startDate, endDate, window] = shiftToDayBefore(previousStartDate!);
    } catch {
      return { reply: "I don't recognize that question yet -- try asking about a specific number and period.", results: [] };
    }
    metricKey = previousMetric;
    compare = false;
  } else if (hasPreviousContext && wantsCompare(message)) {
    let prevStart: PlainDate;
    let prevEnd: PlainDate;
    try {
      prevStart = dm.fromISO(previousStartDate!);
      prevEnd = dm.fromISO(previousEndDate!);
      if (Number.isNaN(prevStart.y) || Number.isNaN(prevEnd.y)) throw new Error("invalid date");
    } catch {
      return { reply: "I don't recognize that question yet -- try asking about a specific number and period.", results: [] };
    }
    metricKey = previousMetric;
    const periodLength = dm.daysBetweenInclusive(prevStart, prevEnd);
    endDate = dm.addDays(prevStart, -1);
    startDate = dm.addDays(endDate, -(periodLength - 1));
    window = `${dm.formatShort(startDate)} - ${dm.formatShortWithYear(endDate)}`;
    compare = false;
  } else if (wantsCompare(message)) {
    metricKey = "net_revenue";
    [startDate, endDate, window] = matchDateWindow(message, todayDate);
    compare = true;
  } else if (isGreeting(message)) {
    // A different kind of miss than a genuinely unrecognized business question -- "hi" or
    // "thanks" getting the same "I don't recognize that question yet" copy reads oddly.
    // Checked last, after every real match attempt above, so it can never preempt an actual
    // question that happens to also contain a greeting word.
    return {
      reply: "I am Apicem Engine's analytics assistant. I can help you analyze your business metrics across revenue, orders, marketing, and inventory. Try asking: 'What was our net revenue last month?' or 'Show me top products'.",
      results: [],
    };
  } else if (
    settings.groqApiKey &&
    !isDemo &&
    rateLimitAllow(`groq-fallback:${tenantId}`, GROQ_FALLBACK_MAX_CALLS_PER_HOUR, 3600)
  ) {
    const classified = await classifyViaGroq(
      message,
      buildCapabilities().flatMap((cat) => cat.metrics),
      [...Object.keys(DATE_RANGE_LABELS), "today", "yesterday"],
    );
    if (!classified) {
      return {
        reply: "I don't recognize that question yet -- try one of the suggestions below, or ask about a specific number like revenue, orders, ad spend, or inventory.",
        results: [],
      };
    }
    // Groq only ever SELECTS one of the keys just handed to it above (validated inside
    // classifyViaGroq() -- never trusted blindly); the actual date-range resolution below
    // reuses the exact same resolveDateRange()/today-yesterday logic every deterministic
    // branch already uses.
    metricKey = classified.metric_key;
    const dateRangeKey = classified.date_range_key;
    if (dateRangeKey === "today") {
      startDate = endDate = todayDate;
      window = "today";
    } else if (dateRangeKey === "yesterday") {
      startDate = endDate = dm.addDays(todayDate, -1);
      window = "yesterday";
    } else if (dateRangeKey && dateRangeKey in DATE_RANGE_LABELS) {
      [startDate, endDate] = resolveDateRange(dateRangeKey, todayDate);
      window = DATE_RANGE_LABELS[dateRangeKey];
    } else {
      [startDate, endDate] = resolveDateRange(DEFAULT_DATE_RANGE, todayDate);
      window = DATE_RANGE_LABELS[DEFAULT_DATE_RANGE];
    }
    compare = wantsCompare(message) && metricKey in SCALAR_METRICS;
    aiAssisted = true;
  } else {
    return {
      reply: "I don't recognize that question yet -- try one of the suggestions below, or ask about a specific number like revenue, orders, ad spend, or inventory.",
      results: [],
    };
  }

  const startIso = dm.toISO(startDate);
  const endIso = dm.toISO(endDate);
  const result = await computeMetric(client, tenantId, metricKey!, startIso, endIso, compare);
  const resultWithDates = { ...result, start_date: startIso, end_date: endIso };

  const label = result.label;
  let reply: string;
  if (metricKey! in TABLE_METRICS || metricKey! in SERIES_METRICS) {
    reply = `Here's your ${label.toLowerCase()} for ${window}.`;
  } else {
    const metricDef = metricDefinition(metricKey!);
    const valueText = formatValue(result.value, metricDef.format);
    reply = `${label} for ${window} was ${valueText}.`;
    const deltaPct = result.delta_pct;
    if (compare && deltaPct !== null && deltaPct !== undefined) {
      const direction = deltaPct >= 0 ? "up" : "down";
      reply += ` That's ${direction} ${(Math.abs(deltaPct) * 100).toFixed(1)}% vs the previous period.`;
    }
  }

  if (aiAssisted) {
    reply = `Not 100% sure, but here's my best guess: ${reply}`;
  }

  return { reply, results: [resultWithDates] };
}
