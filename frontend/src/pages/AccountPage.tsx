import { useState } from "react";
import { api } from "../api/client";
import { IconSettings } from "../components/icons";
import { useAuth } from "../context/AuthContext";

export function AccountPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
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
          <h1 className="page-title">Account</h1>
          <p className="page-subtitle">Your profile and login settings</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="icon-badge">
            <IconSettings size={16} />
          </span>
          <h3>Profile</h3>
        </div>
        <p style={{ marginTop: 10 }}>
          <span className="muted">Email</span>
          <br />
          {user?.email}
        </p>
        <p>
          <span className="muted">Workspace</span>
          <br />
          {user?.tenant_name}
        </p>
        <p style={{ marginBottom: 0 }}>
          <span className="muted">Role</span>
          <br />
          <span style={{ textTransform: "capitalize" }}>{user?.role}</span>
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="icon-badge">
            <IconSettings size={16} />
          </span>
          <h3>Change password</h3>
        </div>
        <form onSubmit={handleSubmit} style={{ marginTop: 14, maxWidth: 340 }}>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          {success && (
            <p style={{ color: "var(--status-good)", fontSize: 13, marginBottom: 12 }}>
              Password updated.
            </p>
          )}
          <button className="primary" type="submit" disabled={submitting} style={{ width: 180 }}>
            {submitting ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
