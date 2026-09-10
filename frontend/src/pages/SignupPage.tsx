import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(companyName, email, password);
      navigate("/connections");
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
          <h2>Predefined dashboards that actually answer "how's the business doing?"</h2>
          <p>Sign up, connect a source (or try it with sample data), and your first dashboard is ready in under a minute.</p>
        </div>
        <div className="auth-brand-foot">Apicem Engine Analytics Platform</div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-card">
          <h1>Create your account</h1>
          <p className="auth-subtitle">Start with sample data — no store connection required yet.</p>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Company name</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Password</label>
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
              {submitting ? "Creating…" : "Create account"}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 16 }}>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
