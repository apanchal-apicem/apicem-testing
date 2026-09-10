import { useEffect, useRef, useState } from "react";
import { api, type AssistantCapabilityCategory, type AssistantMetricResult, type ChatMessage } from "../api/client";
import {
  IconArrowRight,
  IconDatabaseZap,
  IconGrid,
  IconMegaphone,
  IconTrash,
  IconTrendingUp,
} from "../components/icons";
import { KpiTile, metricFormat } from "../components/KpiTile";
import { MetricTable } from "../components/MetricTable";
import { TrendChart } from "../components/TrendChart";
import { TABLE_COLUMNS_CONFIG, TREND_SERIES_CONFIG } from "../dashboardWidgetConfig";

// Renders the exact same components a dashboard would for this metric's shape, so an answer
// like "what's my revenue this month" shows the real KpiTile instead of just the model's
// prose repeating a number back.
function ChatResultCard({ result }: { result: AssistantMetricResult }) {
  if (result.rows) {
    return (
      <div className="chart-card chat-result-card">
        <div className="chart-title">{result.label}</div>
        <MetricTable rows={result.rows} columns={TABLE_COLUMNS_CONFIG[result.metric] || []} />
      </div>
    );
  }
  if (result.series) {
    return (
      <div className="chart-card chat-result-card">
        <div className="chart-title">{result.label}</div>
        <TrendChart data={result.series} series={TREND_SERIES_CONFIG[result.metric] || []} />
      </div>
    );
  }
  return (
    <div className="chat-result-kpi">
      <KpiTile
        label={result.label}
        value={result.value}
        deltaPct={result.delta_pct}
        format={metricFormat(result.metric)}
        metric={result.metric}
        isEstimated={result.is_estimated}
      />
    </div>
  );
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Sales: <IconTrendingUp size={13} />,
  Marketing: <IconMegaphone size={13} />,
  Inventory: <IconDatabaseZap size={13} />,
};

const KIND_LABELS: Record<string, string> = {
  number: "number",
  trend: "trend",
  table: "table",
};

export function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capabilities, setCapabilities] = useState<AssistantCapabilityCategory[]>([]);
  // Just the last successful answer's metric + window, not a full conversation history --
  // enough for a bare follow-up like "and for the previous period from that?" to resolve
  // against whatever was just asked, even though that question alone names no metric.
  const [lastContext, setLastContext] = useState<{ metric: string; start_date: string; end_date: string } | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .assistantCapabilities()
      .then(setCapabilities)
      .catch(() => {
        // Non-critical: the chat itself still works without the reference list.
      });
  }, []);

  useEffect(() => {
    api
      .assistantHistory()
      .then((history) => {
        setMessages(history.map((h) => ({ role: h.role, content: h.content, results: h.results })));
        // Re-derive the follow-up context from whatever the last saved answer actually was,
        // so "and for the previous period from that?" still works right after a fresh page
        // load -- not just within the same in-memory session.
        for (let i = history.length - 1; i >= 0; i--) {
          const h = history[i];
          if (h.role === "assistant" && h.results.length > 0) {
            const r = h.results[0];
            setLastContext({ metric: r.metric, start_date: r.start_date, end_date: r.end_date });
            break;
          }
        }
      })
      .catch(() => {
        // Non-critical: an empty chat is a perfectly fine starting state.
      })
      .finally(() => setHistoryLoaded(true));
  }, []);

  async function handleClearHistory() {
    setMessages([]);
    setLastContext(null);
    try {
      await api.clearAssistantHistory();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function askAbout(label: string) {
    setInput(`Show me ${label}`);
    inputRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const question = input.trim();
    if (!question) return;

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setSubmitting(true);
    try {
      // Answered fresh from the question's own words -- no conversation history sent, just
      // optionally the single last-answer context above (assistant_intents.py).
      const { reply, results } = await api.askAssistant(question, lastContext ?? undefined);
      setMessages((prev) => [...prev, { role: "assistant", content: reply, results }]);
      if (results.length > 0) {
        const r = results[0];
        setLastContext({ metric: r.metric, start_date: r.start_date, end_date: r.end_date });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ask Apicem Engine</h1>
          <p className="page-subtitle">
            Ask about your sales, ads, or inventory in plain language — answered instantly,
            entirely on this machine.
          </p>
        </div>
        {messages.length > 0 && (
          <button className="secondary" onClick={handleClearHistory}>
            <IconTrash size={13} />
            Clear chat
          </button>
        )}
      </div>

      <div className="panel chat-panel">
        <div className="chat-messages">
          {historyLoaded && messages.length === 0 && (
            <p className="muted">
              Try something like "what's my revenue this month" or "how has net revenue
              changed compared to last month".
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`chat-message ${m.role}`}>
                <div className="chat-bubble">{m.content}</div>
              </div>
              {m.results && m.results.length > 0 && (
                <div className="chat-results">
                  {m.results.map((r, ri) => (
                    <ChatResultCard key={ri} result={r} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {submitting && (
            <div className="chat-message assistant">
              <div className="chat-bubble muted">Thinking…</div>
            </div>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        <form onSubmit={handleSubmit} className="chat-input-row">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your business…"
            disabled={submitting}
          />
          <button className="primary" type="submit" disabled={submitting || !input.trim()}>
            Ask
            <IconArrowRight size={14} />
          </button>
        </form>
      </div>

      {capabilities.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <span className="icon-badge">
              <IconGrid size={16} />
            </span>
            <h3>What you can ask about</h3>
          </div>
          <p className="muted" style={{ marginTop: 4, marginBottom: 14, fontSize: 13 }}>
            Every answer comes from one of these — click one to start a question.
          </p>
          <div className="capability-groups">
            {capabilities.map((group) => (
              <div key={group.category}>
                <div className="capability-group-header">
                  {CATEGORY_ICONS[group.category]}
                  {group.category}
                </div>
                <div className="capability-pills">
                  {group.metrics.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className="capability-pill"
                      onClick={() => askAbout(m.label)}
                    >
                      {m.label}
                      <span className="capability-kind">{KIND_LABELS[m.kind]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
