import React from "react";

export function NetworkDashboardModal({ open, config, metrics, onClose }) {
  if (!open) return null;
  const title = config?.roomCode ? `Network dashboard · ${config.roomCode}` : "Network dashboard · overall";
  const latest = metrics || {};
  const history = latest.history || [];
  return (
    <div className="network-dashboard-backdrop">
      <section className="network-dashboard" role="dialog" aria-modal="true" aria-label={title}>
        <header className="network-dashboard-header">
          <div>
            <span className="eyebrow">Developer network monitor</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        <div className="network-stat-grid">
          <NetworkStat label="Server CPU" value={`${formatMetricNumber(latest.server?.cpuPercent)}%`} />
          <NetworkStat label="Heap" value={formatBytesClient(latest.server?.memoryHeapUsed)} />
          <NetworkStat label="RSS" value={formatBytesClient(latest.server?.memoryRss)} />
          <NetworkStat label="Clients" value={latest.overall?.clients ?? "—"} />
          <NetworkStat label="Rooms" value={latest.overall?.rooms ?? "—"} />
          <NetworkStat label="Bandwidth" value={`${formatMetricNumber((latest.overall?.bandwidthBps || 0) / 1024)} KB/s`} />
          <NetworkStat label="AI CPU proxy" value={`${formatMetricNumber(latest.overall?.aiSharePercent)}%`} />
          <NetworkStat label="AI moves" value={latest.ai?.totalMoves ?? "—"} />
        </div>

        {latest.room && (
          <div className="network-room-panel">
            <h3>Room detail</h3>
            <div className="network-stat-grid compact">
              <NetworkStat label="Variant" value={latest.room.variant} />
              <NetworkStat label="Status" value={latest.room.status} />
              <NetworkStat label="Room memory" value={formatBytesClient(latest.room.memoryBytes)} />
              <NetworkStat label="Room bandwidth" value={`${formatMetricNumber((latest.room.bandwidthBps || 0) / 1024)} KB/s`} />
              <NetworkStat label="Room AI ms" value={formatMetricNumber(latest.room.aiMs)} />
              <NetworkStat label="AI difficulty" value={latest.room.aiDifficulty || "none"} />
            </div>
          </div>
        )}

        <div className="network-chart-grid">
          <NetworkChart title="CPU %" history={history} field="cpuPercent" suffix="%" />
          <NetworkChart title="Heap MB" history={history} field="heapMb" suffix=" MB" />
          <NetworkChart title="Bandwidth KB/s" history={history} field="bandwidthKbps" suffix=" KB/s" />
          <NetworkChart title="Room bandwidth KB/s" history={history} field="roomBandwidthKbps" suffix=" KB/s" />
        </div>

        <div className="network-ai-breakdown">
          <h3>AI by difficulty</h3>
          {Object.entries(latest.ai?.byDifficulty || {}).map(([difficulty, stat]) => (
            <p key={difficulty}><strong>{difficulty}</strong>: {stat.moves} move(s), {formatMetricNumber(stat.ms)} ms</p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function NetworkStat({ label, value }) {
  return (
    <div className="network-stat">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

export function NetworkChart({ title, history, field, suffix }) {
  const values = (history || []).map((item) => Number(item[field]) || 0);
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = 42 - (value / max) * 38;
    return `${x},${y}`;
  }).join(" ");
  const latest = values.length ? values[values.length - 1] : 0;
  return (
    <div className="network-chart">
      <div className="network-chart-title">
        <strong>{title}</strong>
        <span>{formatMetricNumber(latest)}{suffix}</span>
      </div>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none">
        <polyline points={points} />
      </svg>
    </div>
  );
}

export function formatMetricNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(2);
}

export function formatBytesClient(value) {
  const bytes = Number(value) || 0;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}
