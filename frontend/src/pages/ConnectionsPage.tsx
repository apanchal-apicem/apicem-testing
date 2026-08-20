import { useEffect, useState } from "react";
import { api, type ConnectionOut } from "../api/client";
import { DataHealthPanel } from "../components/DataHealthPanel";
import { EmptyState } from "../components/EmptyState";
import { IconDatabaseZap } from "../components/icons";
import { useAuth } from "../context/AuthContext";
import { SOURCE_TYPES, sourceTypeConfig } from "../sourceTypes";

export function ConnectionsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "owner" || user?.role === "admin";
  const [connections, setConnections] = useState<ConnectionOut[] | null>(null);
  const [sourceTypeId, setSourceTypeId] = useState(SOURCE_TYPES[0].id);
  const [useMock, setUseMock] = useState(true);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedSource = sourceTypeConfig(sourceTypeId)!;

  function loadConnections() {
    api.listConnections().then(setConnections).catch((err) => setError(err.message));
  }

  useEffect(loadConnections, []);

  function selectSourceType(id: string) {
    setSourceTypeId(id);
    setCredentials({});
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createConnection({
        source_type: sourceTypeId,
        use_mock_data: useMock,
        credentials: useMock ? undefined : credentials,
      });
      setCredentials({});
      loadConnections();
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
          <h1 className="page-title">Connections</h1>
          <p className="page-subtitle">Link a data source to start populating dashboards</p>
        </div>
      </div>

      {canManage && (
        <div className="panel">
          <div className="panel-header">
            <span className="icon-badge">{selectedSource.icon(16)}</span>
            <h3>Connect a data source</h3>
          </div>

          <div className="source-type-tabs">
            {SOURCE_TYPES.map((source) => (
              <button
                key={source.id}
                type="button"
                className={`source-type-tab ${source.id === sourceTypeId ? "active" : ""}`}
                onClick={() => selectSourceType(source.id)}
              >
                {source.icon(14)}
                {source.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleCreate} style={{ marginTop: 14 }}>
            <label className="checkbox-field">
              <input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} />
              Use sample data (no real {selectedSource.label} account required)
            </label>
            {!useMock &&
              selectedSource.credentialFields.map((field) => (
                <div className="field" key={field.key}>
                  <label>{field.label}</label>
                  <input
                    type={field.secret ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={credentials[field.key] || ""}
                    onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                    required
                  />
                </div>
              ))}
            {error && <p className="error-text">{error}</p>}
            <button className="primary" type="submit" disabled={submitting} style={{ width: 160 }}>
              {submitting ? "Connecting…" : "Connect"}
            </button>
          </form>
        </div>
      )}

      {connections?.length === 0 && (
        <EmptyState
          icon={<IconDatabaseZap size={22} />}
          title="No connections yet"
          description={
            canManage
              ? "Connect a data source above to start landing data — sample data works instantly with no account required."
              : "Ask an owner or admin on this workspace to connect a data source."
          }
        />
      )}

      {connections?.map((connection) => (
        <DataHealthPanel
          key={connection.connection_id}
          connection={connection}
          onRemoved={loadConnections}
          canManage={canManage}
        />
      ))}
    </div>
  );
}
