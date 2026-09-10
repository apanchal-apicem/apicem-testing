import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconDownload,
  IconGrid,
  IconMessageCircle,
  IconPlay,
  IconShield,
  IconTrendingUp,
} from "../components/icons";
import { KpiTile } from "../components/KpiTile";
import { TrendChart } from "../components/TrendChart";
import { useAuth } from "../context/AuthContext";
import { SOURCE_TYPES } from "../sourceTypes";

// Illustrative sample numbers for the hero mockup, rendered through the app's own
// KpiTile/TrendChart components -- not a screenshot, so it can never go visually stale, and
// it's honestly a real rendering of the real UI rather than a mocked-up image pretending to
// be one.
const HERO_TREND_SERIES = [
  { key: "gross_revenue", label: "Gross revenue", color: "var(--series-1)" },
  { key: "net_revenue", label: "Net revenue", color: "var(--series-2)" },
];

const HERO_TREND_DATA = [
  { date_key: "2026-08-01", gross_revenue: 4200, net_revenue: 3850 },
  { date_key: "2026-08-03", gross_revenue: 5100, net_revenue: 4700 },
  { date_key: "2026-08-05", gross_revenue: 3800, net_revenue: 3500 },
  { date_key: "2026-08-07", gross_revenue: 6200, net_revenue: 5650 },
  { date_key: "2026-08-09", gross_revenue: 5600, net_revenue: 5100 },
  { date_key: "2026-08-11", gross_revenue: 7100, net_revenue: 6500 },
  { date_key: "2026-08-13", gross_revenue: 6400, net_revenue: 5850 },
  { date_key: "2026-08-15", gross_revenue: 8300, net_revenue: 7600 },
  { date_key: "2026-08-17", gross_revenue: 7200, net_revenue: 6600 },
  { date_key: "2026-08-19", gross_revenue: 9100, net_revenue: 8300 },
  { date_key: "2026-08-21", gross_revenue: 8600, net_revenue: 7900 },
  { date_key: "2026-08-23", gross_revenue: 10200, net_revenue: 9350 },
];

const FEATURES = [
  {
    icon: <IconGrid size={20} />,
    title: "Dashboards that build themselves",
    body: "Executive Overview, Revenue, Marketing, and Inventory dashboards update automatically as your connected sources sync — no spreadsheets, no manual exports.",
  },
  {
    icon: <IconMessageCircle size={20} />,
    title: "Ask Apicem Engine",
    body: "Type a question like “what's my revenue this month” and get back a real chart or KPI, computed the exact same way the dashboards are — never a guess.",
  },
  {
    icon: <IconDownload size={20} />,
    title: "Export anywhere",
    body: "Download any single chart or the whole dashboard as CSV, or save a clean PDF — for a board deck, your accountant, or your own records.",
  },
];

const STEPS = [
  {
    title: "Connect your data",
    body: "Link Shopify and the other tools you use, or start with sample data to explore risk-free.",
  },
  {
    title: "Dashboards build automatically",
    body: "Your data syncs on a schedule and flows straight into Executive Overview, Revenue, Marketing, and Inventory.",
  },
  {
    title: "Ask, export, decide",
    body: "Ask a plain-English question or download exactly the numbers you need, whenever you need them.",
  },
];

export function HomePage() {
  const { demoLogin } = useAuth();
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  async function handleDemo() {
    setDemoError(null);
    setDemoLoading(true);
    try {
      await demoLogin();
      navigate("/dashboards/executive_overview");
    } catch (err: any) {
      setDemoError(err.message);
      setDemoLoading(false);
    }
  }

  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <div className="marketing-nav-inner">
          <div className="brand">
            <div className="brand-mark">
              <IconTrendingUp size={15} />
            </div>
            <div className="brand-name">Apicem Engine</div>
          </div>
          <nav className="marketing-nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="marketing-nav-actions">
            <Link to="/login" className="secondary">
              Log in
            </Link>
            <button className="primary" onClick={handleDemo} disabled={demoLoading}>
              <IconPlay size={13} />
              {demoLoading ? "Loading…" : "View live demo"}
            </button>
          </div>
        </div>
      </header>

      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <span className="marketing-eyebrow">Analytics for growing stores</span>
          <h1>All your revenue, ad spend, and inventory — one place, in plain English.</h1>
          <p>
            Connect Shopify, Google Ads, Meta Ads, and NetSuite once. Apicem Engine builds your
            dashboards automatically, keeps every number in agreement, and answers questions
            about your business the way you'd actually ask them.
          </p>
          <div className="marketing-hero-ctas">
            <button className="primary" onClick={handleDemo} disabled={demoLoading}>
              <IconPlay size={14} />
              {demoLoading ? "Loading…" : "View live demo"}
            </button>
            <Link to="/login" className="secondary">
              Log in
            </Link>
          </div>
          {demoError && <p className="error-text">{demoError}</p>}
        </div>
        <div className="marketing-hero-visual">
          <div className="marketing-mock-window">
            <div className="marketing-mock-titlebar">
              <span />
              <span />
              <span />
            </div>
            <div className="marketing-mock-body">
              <div className="kpi-row">
                <KpiTile label="Gross Revenue" value={48210} deltaPct={0.124} format="currency" metric="gross_revenue" />
                <KpiTile label="Orders" value={812} deltaPct={0.081} format="count" metric="order_count" />
                <KpiTile label="Blended ROAS" value={3.2} deltaPct={0.05} format="ratio" metric="blended_roas" />
              </div>
              <div className="chart-card">
                <div className="chart-title">Revenue Trend</div>
                <TrendChart data={HERO_TREND_DATA} series={HERO_TREND_SERIES} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-connects">
        <p className="marketing-connects-label">Connects with the tools you already use</p>
        <div className="marketing-connects-row">
          {SOURCE_TYPES.map((s) => (
            <div className="marketing-connects-chip" key={s.id}>
              {s.icon(16)}
              {s.label}
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="marketing-features">
        <h2>Everything a growing store needs to know, in one place</h2>
        <div className="marketing-feature-grid">
          {FEATURES.map((f) => (
            <div className="marketing-feature-card" key={f.title}>
              <span className="marketing-feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="marketing-steps">
        <h2>Set up once, in minutes</h2>
        <ol className="marketing-steps-list">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="marketing-step-num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="marketing-privacy">
        <span className="marketing-privacy-icon">
          <IconShield size={22} />
        </span>
        <div>
          <h2>The AI assistant runs locally, not on someone else's API</h2>
          <p>
            "Ask Apicem Engine" is a self-hosted model, not a third-party AI service. It
            answers using only the same metrics your dashboards already show — nothing about
            your business is sent anywhere to get a question answered.
          </p>
        </div>
      </section>

      <section className="marketing-cta">
        <h2>Ready to see your numbers in one place?</h2>
        <p>Look around with real sample data — no account, no form.</p>
        <button className="primary" onClick={handleDemo} disabled={demoLoading}>
          <IconPlay size={14} />
          {demoLoading ? "Loading…" : "View live demo"}
        </button>
        {demoError && <p className="error-text">{demoError}</p>}
      </section>

      <footer className="marketing-footer">
        <div className="brand">
          <div className="brand-mark">
            <IconTrendingUp size={15} />
          </div>
          <div className="brand-name">Apicem Engine</div>
        </div>
        <div className="marketing-footer-links">
          <Link to="/login">Log in</Link>
        </div>
      </footer>
    </div>
  );
}
