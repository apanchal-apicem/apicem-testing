import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-name">Apicem Engine</div>
        </div>
        <div className="auth-brand-copy">
          <h2>Forgot your password?</h2>
          <p>Enter your email and we'll send you a link to reset it.</p>
        </div>
        <div className="auth-brand-foot">Apicem Engine Analytics Platform</div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-card">
          {sent ? (
            <>
              <h1>Check your email</h1>
              <p className="auth-subtitle">
                If an account exists for that address, a reset link is on its way.
              </p>
            </>
          ) : (
            <>
              <h1>Reset your password</h1>
              <p className="auth-subtitle">We'll email you a link to get back in.</p>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                {error && <p className="error-text">{error}</p>}
                <button className="primary" type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
          <p className="muted" style={{ marginTop: 16 }}>
            <Link to="/login">Back to log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
