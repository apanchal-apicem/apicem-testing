import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
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
          <h2>Set a new password</h2>
          <p>Choose a new password to get back into your workspace.</p>
        </div>
        <div className="auth-brand-foot">Apicem Engine Analytics Platform</div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-card">
          {!token ? (
            <>
              <h1>Invalid reset link</h1>
              <p className="auth-subtitle">
                This link is missing its token. Request a new one from the login page.
              </p>
            </>
          ) : done ? (
            <>
              <h1>Password updated</h1>
              <p className="auth-subtitle">Redirecting you to log in…</p>
            </>
          ) : (
            <>
              <h1>New password</h1>
              <p className="auth-subtitle">Reset links expire after 30 minutes.</p>
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label>New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                {error && <p className="error-text">{error}</p>}
                <button className="primary" type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Set new password"}
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
