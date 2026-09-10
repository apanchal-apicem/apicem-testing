import { useState } from "react";
import { api, assetUrl } from "../api/client";
import { IconBuilding, IconSettings, IconTrash } from "../components/icons";
import { useAuth } from "../context/AuthContext";

export function AccountPage() {
  const { user, refreshUser } = useAuth();
  const canManageWorkspace = user?.role === "owner" || user?.role === "admin";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [workspaceName, setWorkspaceName] = useState(user?.tenant_name || "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

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

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(false);
    const trimmed = workspaceName.trim();
    if (!trimmed) {
      setNameError("Workspace name can't be empty.");
      return;
    }
    setSavingName(true);
    try {
      await api.updateTenant(trimmed);
      await refreshUser();
      setNameSuccess(true);
    } catch (err: any) {
      setNameError(err.message);
    } finally {
      setSavingName(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setLogoBusy(true);
    try {
      await api.uploadLogo(file);
      await refreshUser();
    } catch (err: any) {
      setLogoError(err.message);
    } finally {
      setLogoBusy(false);
      e.target.value = "";
    }
  }

  async function handleRemoveLogo() {
    setLogoError(null);
    setLogoBusy(true);
    try {
      await api.removeLogo();
      await refreshUser();
    } catch (err: any) {
      setLogoError(err.message);
    } finally {
      setLogoBusy(false);
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

      {canManageWorkspace && (
        <div className="panel">
          <div className="panel-header">
            <span className="icon-badge">
              <IconBuilding size={16} />
            </span>
            <h3>Workspace</h3>
          </div>

          <div className="workspace-logo-row">
            {user?.tenant_logo_url ? (
              <img src={assetUrl(user.tenant_logo_url)} alt="Workspace logo" className="workspace-logo-preview" />
            ) : (
              <div className="workspace-logo-placeholder">
                <IconBuilding size={20} />
              </div>
            )}
            <div>
              <label className="secondary" style={{ display: "inline-block", cursor: "pointer" }}>
                {logoBusy ? "Uploading…" : user?.tenant_logo_url ? "Change logo" : "Upload logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoChange}
                  disabled={logoBusy}
                  style={{ display: "none" }}
                />
              </label>
              {user?.tenant_logo_url && (
                <button
                  className="secondary"
                  style={{ marginLeft: 8 }}
                  onClick={handleRemoveLogo}
                  disabled={logoBusy}
                >
                  <IconTrash size={13} />
                  Remove
                </button>
              )}
              <p className="muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
                PNG, JPEG, SVG, or WebP, up to 2 MB.
              </p>
            </div>
          </div>
          {logoError && <p className="error-text">{logoError}</p>}

          <form onSubmit={handleNameSubmit} style={{ marginTop: 18, maxWidth: 340 }}>
            <div className="field">
              <label>Workspace name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                required
              />
            </div>
            {nameError && <p className="error-text">{nameError}</p>}
            {nameSuccess && (
              <p style={{ color: "var(--status-good)", fontSize: 13, marginBottom: 12 }}>
                Workspace name updated.
              </p>
            )}
            <button className="primary" type="submit" disabled={savingName} style={{ width: 180 }}>
              {savingName ? "Saving…" : "Save name"}
            </button>
          </form>
        </div>
      )}

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
