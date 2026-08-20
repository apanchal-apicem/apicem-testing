import { useEffect, useState } from "react";
import { api, type TeamMemberOut } from "../api/client";
import { IconTrash, IconUserPlus, IconUsers } from "../components/icons";
import { useAuth } from "../context/AuthContext";

const ROLES = ["viewer", "admin", "owner"];
// Mirrors backend/app/security.py's ROLE_RANK: you can only grant or remove a role at or
// below your own rank, so an admin should never even see "Owner" as an option or a working
// Remove button on an owner's row -- the backend already rejects both, this just avoids
// showing an action that's guaranteed to fail.
const ROLE_RANK: Record<string, number> = { viewer: 1, admin: 2, owner: 3 };

export function TeamPage() {
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "admin";
  const myRank = ROLE_RANK[user?.role ?? "viewer"] ?? 0;
  const assignableRoles = ROLES.filter((r) => ROLE_RANK[r] <= myRank);

  const [members, setMembers] = useState<TeamMemberOut[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function loadMembers() {
    api.listTeam().then(setMembers).catch((err) => setError(err.message));
  }

  useEffect(loadMembers, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.addTeammate({ email, password, role });
      setEmail("");
      setPassword("");
      setRole("viewer");
      loadMembers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      await api.removeTeammate(userId);
      loadMembers();
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Who has access to this workspace</p>
        </div>
      </div>

      {canManage && (
        <div className="panel">
          <div className="panel-header">
            <span className="icon-badge">
              <IconUserPlus size={16} />
            </span>
            <h3>Add teammate</h3>
          </div>
          <p className="muted" style={{ marginTop: 4, marginBottom: 14 }}>
            This creates their login directly. Share the email and temporary password with them so they can
            sign in — they can change it anytime from Account settings.
          </p>
          <form onSubmit={handleAdd}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Temporary password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="primary" type="submit" disabled={submitting} style={{ width: 180 }}>
              {submitting ? "Adding…" : "Add teammate"}
            </button>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <span className="icon-badge">
            <IconUsers size={16} />
          </span>
          <h3>Members</h3>
        </div>
        <table className="data-table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {members?.map((member) => (
              <tr key={member.user_id}>
                <td>{member.email}</td>
                <td style={{ textTransform: "capitalize" }}>{member.role}</td>
                <td className="muted">{new Date(member.created_at).toLocaleDateString()}</td>
                {canManage && (
                  <td>
                    {member.user_id !== user?.user_id && ROLE_RANK[member.role] <= myRank && (
                      <button className="secondary" onClick={() => handleRemove(member.user_id)}>
                        <IconTrash size={13} />
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
