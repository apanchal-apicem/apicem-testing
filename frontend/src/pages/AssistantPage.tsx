import { useState } from "react";
import { api, type ChatMessage } from "../api/client";
import { IconArrowRight } from "../components/icons";

export function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const question = input.trim();
    if (!question) return;

    const history = messages;
    setMessages([...history, { role: "user", content: question }]);
    setInput("");
    setSubmitting(true);
    try {
      const { reply } = await api.askAssistant(question, history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
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
          <h1 className="page-title">Ask Apicem</h1>
          <p className="page-subtitle">
            Ask about your sales, ads, or inventory in plain language — runs entirely on this machine.
          </p>
        </div>
      </div>

      <div className="panel chat-panel">
        <div className="chat-messages">
          {messages.length === 0 && (
            <p className="muted">
              Try something like "what's my revenue this month" or "how does that compare to last
              year".
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-message ${m.role}`}>
              <div className="chat-bubble">{m.content}</div>
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
    </div>
  );
}
