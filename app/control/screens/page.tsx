import {
  CircleAlert,
  MapPin,
  Monitor,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Router,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";
import { networkSummary, screens, type ScreenStatus } from "@/lib/demo-data";

const statusLabels: Record<ScreenStatus, string> = {
  online: "Online",
  attention: "Needs attention",
  offline: "Offline",
};

export default function ScreensPage() {
  return (
    <div className="control-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Network operations</p>
          <h1>Screens</h1>
          <p className="page-description">
            Monitor every NeuseCast player, connection, and live playlist from one place.
          </p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" type="button">
            <RefreshCw size={16} aria-hidden="true" /> Refresh status
          </button>
          <button className="button button-primary" type="button">
            <Plus size={16} aria-hidden="true" /> Add screen
          </button>
        </div>
      </header>

      <section className="metric-grid metric-grid-4" aria-label="Screen fleet summary">
        <article className="metric-card">
          <span className="metric-icon metric-icon-teal">
            <Monitor size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="metric-label">Total screens</p>
            <p className="metric-value">{screens.length}</p>
            <p className="metric-detail">Across 4 Eastern NC markets</p>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-green">
            <Wifi size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="metric-label">Online now</p>
            <p className="metric-value">{networkSummary.online}</p>
            <p className="metric-detail">All reporting normally</p>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-gold">
            <CircleAlert size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="metric-label">Needs attention</p>
            <p className="metric-value">{networkSummary.needsAttention}</p>
            <p className="metric-detail">1 weak signal requiring attention</p>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue">
            <Router size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="metric-label">Fleet uptime</p>
            <p className="metric-value">98.4%</p>
            <p className="metric-detail">Previous 30 days</p>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-toolbar">
          <div className="segmented-control" aria-label="Filter screens by status">
            <button className="segment is-active" type="button">All <span>{screens.length}</span></button>
            <button className="segment" type="button">Online <span>{networkSummary.online}</span></button>
            <button className="segment" type="button">Attention <span>{networkSummary.needsAttention}</span></button>
          </div>
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search screens</span>
            <input type="search" placeholder="Search venue or market" />
          </label>
        </div>

        <div className="table-wrap">
          <table className="data-table screen-table">
            <caption className="sr-only">NeuseCast screen fleet status</caption>
            <thead>
              <tr>
                <th scope="col">Screen</th>
                <th scope="col">Status</th>
                <th scope="col">Playing now</th>
                <th scope="col">Connection</th>
                <th scope="col">30-day uptime</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {screens.map((screen) => (
                <tr key={screen.id}>
                  <td>
                    <div className="entity-cell">
                      <span className="entity-icon"><Monitor size={17} aria-hidden="true" /></span>
                      <div>
                        <strong>{screen.venue}</strong>
                        <span>{screen.name} · {screen.id}</span>
                        <span className="location-line"><MapPin size={12} aria-hidden="true" /> {screen.city}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge status-${screen.status}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {statusLabels[screen.status]}
                    </span>
                    <span className="cell-note">Seen {screen.lastSeen}</span>
                  </td>
                  <td>
                    <strong className="cell-primary">{screen.currentSlot}</strong>
                    <span className="cell-note">{screen.orientation}</span>
                  </td>
                  <td>
                    <span className="connection-line">
                      {screen.status === "offline" ? (
                        <WifiOff size={15} aria-hidden="true" />
                      ) : (
                        <Wifi size={15} aria-hidden="true" />
                      )}
                      {screen.connection}
                    </span>
                    <span className="cell-note">{screen.player}</span>
                  </td>
                  <td>
                    <div className="uptime-cell">
                      <strong>{screen.uptime}%</strong>
                      <span className="progress-track" aria-hidden="true">
                        <span style={{ width: `${screen.uptime}%` }} />
                      </span>
                    </div>
                  </td>
                  <td>
                    <button className="icon-button" type="button" aria-label={`Open actions for ${screen.venue}`}>
                      <MoreHorizontal size={18} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
