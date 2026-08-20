import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboards/executive_overview");
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
          <div className="brand-name">Apicem</div>
        </div>
        <div className="auth-brand-copy">
          <h2>All your revenue, ad spend, and inventory data — one place, one number for each.</h2>
          <p>Connect Shopify and your other tools once. Apicem keeps the metrics in sync so every dashboard agrees.</p>
        </div>
        <div className="auth-brand-foot">Apicem Analytics Platform</div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-card">
          <h1>Log in</h1>
          <p className="auth-subtitle">Welcome back — enter your details to continue.</p>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>
                Password{" "}
                <Link to="/forgot-password" className="muted" style={{ float: "right", fontWeight: 400 }}>
                  Forgot password?
                </Link>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 16 }}>
            No account? <Link to="/signup">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
