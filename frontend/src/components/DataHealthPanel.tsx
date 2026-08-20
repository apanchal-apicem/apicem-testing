import { useEffect, useRef, useState } from "react";
import { api, type ConnectionOut, type JobRunOut } from "../api/client";
import { IconAlertTriangle, IconCheckCircle, IconClock, IconRefresh, IconTrash } from "./icons";
import { sourceTypeConfig } from "../sourceTypes";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 90_000;

function statusClass(status: string) {
  if (status === "active" || status === "success") return "active";
  if (status === "error" || status === "failed") return "error";
  return "pending";
}

function StatusIcon({ status }: { status: string }) {
  const cls = statusClass(status);
  if (cls === "active") return <IconCheckCircle size={13} />;
  if (cls === "error") return <IconAlertTriangle size={13} />;
  return <IconClock size={13} />;
}

function plainLanguageStatus(connection: ConnectionOut): string {
  if (connection.status === "error") {
    return `We're having trouble syncing this connection${
      connection.last_error ? `: ${connection.last_error}` : "."
    }`;
  }
  if (!connection.last_synced_at) {
    return "Waiting for the first sync to run — this can take a minute or two.";
  }
  const hoursAgo = (Date.now() - new Date(connection.last_synced_at).getTime()) / 36e5;
  if (hoursAgo > 6) {
    return `Last synced ${Math.round(hoursAgo)} hours ago — we're looking into it.`;
  }
  return `Last synced ${new Date(connection.last_synced_at).toLocaleString()}.`;
}

// A connector's sync_connection() returns its own internal snake_case keys (e.g.
// "inventory_balances") -- humanize the ones that don't already read as plain English
// instead of leaking raw identifiers into the UI; anything not listed just gets its
// underscores turned into spaces as a fallback for connectors added later.
const RECORD_LABELS: Record<string, string> = {
  inventory_balances: "inventory records",
};

function formatRecordsSynced(records: Record<string, number> | null): string {
  if (!records) return "—";
  return Object.entries(records)
    .map(([key, count]) => `${count.toLocaleString()} ${RECORD_LABELS[key] || key.replace(/_/g, " ")}`)
    .join(", ");
}

export function DataHealthPanel({
  connection,
  onRemoved,
  canManage,
}: {
  connection: ConnectionOut;
  onRemoved: () => void;
  canManage: boolean;
}) {
  const [jobRuns, setJobRuns] = useState<JobRunOut[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const pollRef = useRef<{ interval?: number; timeout?: number }>({});
  const source = sourceTypeConfig(connection.source_type);

  function loadJobRuns() {
    return api.connectionJobRuns(connection.connection_id).then(setJobRuns).catch(() => {});
  }

  function stopPolling() {
    if (pollRef.current.interval) window.clearInterval(pollRef.current.interval);
    if (pollRef.current.timeout) window.clearTimeout(pollRef.current.timeout);
    pollRef.current = {};
  }

  function startPolling() {
    stopPolling();
    pollRef.current.interval = window.setInterval(loadJobRuns, POLL_INTERVAL_MS);
    pollRef.current.timeout = window.setTimeout(stopPolling, MAX_POLL_MS);
  }

  useEffect(() => {
    loadJobRuns();
    // A sync that's already in flight (scheduler picked it up, or the page was refreshed
    // mid-sync) should show live progress too -- not just ones triggered from this session.
    if (connection.status === "pending") startPolling();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.connection_id]);

  useEffect(() => {
    if (jobRuns[0]?.status !== "running" && pollRef.current.interval) {
      // The in-flight run just finished -- one more beat then stop, so the final row shows.
      window.setTimeout(stopPolling, POLL_INTERVAL_MS);
    }
  }, [jobRuns]);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      await api.syncNow(connection.connection_id);
      startPolling();
    } finally {
      setSyncing(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await api.deleteConnection(connection.connection_id);
      onRemoved();
    } finally {
      setRemoving(false);
      setConfirmingRemove(false);
    }
  }

  const isSyncing = jobRuns[0]?.status === "running";

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <span className="icon-badge">{source?.icon(16)}</span>
          <div>
            <h3 style={{ marginBottom: 4 }}>
              {source?.label || connection.source_type}{" "}
              {connection.use_mock_data && <span className="muted">(sample data)</span>}
            </h3>
            <span className={`status-pill ${statusClass(connection.status)}`}>
              <StatusIcon status={connection.status} />
              {isSyncing ? "syncing…" : connection.status}
            </span>
          </div>
        </div>
        {canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={handleSyncNow} disabled={syncing || isSyncing}>
              <IconRefresh size={14} />
              {syncing || isSyncing ? "Syncing…" : "Sync now"}
            </button>
            <button className="secondary" onClick={() => setConfirmingRemove(true)} disabled={removing}>
              <IconTrash size={14} />
              Remove
            </button>
          </div>
        )}
      </div>

      {canManage && confirmingRemove && (
        <div className="panel" style={{ background: "var(--status-critical-tint)", marginTop: 12, marginBottom: 0, boxShadow: "none" }}>
          <p style={{ margin: "0 0 10px", fontSize: 13 }}>
            Remove this connection? Previously landed data is kept and will be replaced the next
            time you reconnect and sync.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" onClick={handleRemove} disabled={removing}>
              {removing ? "Removing…" : "Yes, remove it"}
            </button>
            <button className="secondary" onClick={() => setConfirmingRemove(false)} disabled={removing}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <p className="muted" style={{ marginTop: 12, marginBottom: jobRuns.length ? 12 : 0 }}>
        {isSyncing ? "Sync in progress — this updates automatically." : plainLanguageStatus(connection)}
      </p>

      {jobRuns.length > 0 && (
        <table className="job-runs">
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Records</th>
              <th>Started</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {jobRuns.map((run) => (
              <tr key={run.job_run_id}>
                <td>{run.job_type}</td>
                <td>{run.status === "running" ? "running…" : run.status}</td>
                <td>{formatRecordsSynced(run.records_synced)}</td>
                <td>{new Date(run.started_at).toLocaleString()}</td>
                <td>{run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
