import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Activity, MapPin, Monitor, Plus, Radio, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { ScreenFleetRefresh } from "@/components/screen-fleet-refresh";
import { ScreenPreviewDialog } from "@/components/screen-preview-dialog";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, screens, venues } from "@/lib/db/schema";
import { deriveScreenHealth, type ScreenHealth } from "@/lib/player/health";
import { activateScreen } from "./actions";

export const dynamic = "force-dynamic";

const healthLabels: Record<ScreenHealth, string> = {
  never_connected: "Never connected",
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
  maintenance: "Maintenance",
  retired: "Retired",
};

function formatAge(timestamp: Date | null, now: Date) {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1_000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function shortVersion(version: string | null) {
  if (!version) return null;
  return version.length > 14 ? `${version.slice(0, 8)}…${version.slice(-4)}` : version;
}

export default async function ScreensPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await ensureScreenManagementSchema();
  const database = getDatabase();
  const [{ error }, rows, hosts] = await Promise.all([
    searchParams,
    database
      .select({
        id: screens.id,
        name: screens.name,
        orientation: screens.orientation,
        playerKey: screens.providerScreenId,
        status: screens.status,
        active: screens.active,
        lastSeenAt: screens.lastSeenAt,
        lastHeartbeatAt: screens.lastHeartbeatAt,
        lastManifestAt: screens.lastManifestAt,
        lastManifestVersion: screens.lastManifestVersion,
        lastPlaybackAt: screens.lastPlaybackAt,
        currentItemId: screens.currentItemId,
        currentManifestVersion: screens.currentManifestVersion,
        deviceId: screens.deviceId,
        deviceClaimedAt: screens.deviceClaimedAt,
        playerVersion: screens.playerVersion,
        viewportWidth: screens.viewportWidth,
        viewportHeight: screens.viewportHeight,
        lastError: screens.lastError,
        lastErrorAt: screens.lastErrorAt,
        venueName: venues.name,
        city: venues.city,
        market: venues.market,
        hostClerkUserId: venues.hostClerkUserId,
        hostName: appUsers.displayName,
        hostEmail: appUsers.email,
      })
      .from(screens)
      .innerJoin(venues, eq(screens.venueId, venues.id))
      .leftJoin(appUsers, eq(venues.hostClerkUserId, appUsers.clerkUserId))
      .orderBy(desc(screens.createdAt)),
    database
      .select({ id: appUsers.clerkUserId, name: appUsers.displayName, email: appUsers.email, status: appUsers.status })
      .from(appUsers)
      .where(and(eq(appUsers.role, "host"), inArray(appUsers.status, ["active", "invited"])))
      .orderBy(appUsers.displayName),
  ]);
  const now = new Date();
  const fleet = rows.map((screen) => ({
    ...screen,
    health: deriveScreenHealth({
      active: screen.active,
      status: screen.status,
      lastHeartbeatAt: screen.lastHeartbeatAt,
    }, now),
  }));
  const online = fleet.filter((row) => row.health === "online").length;
  const degraded = fleet.filter((row) => row.health === "degraded").length;
  const offline = fleet.filter((row) => row.health === "offline").length;
  const neverConnected = fleet.filter((row) => row.health === "never_connected").length;
  const markets = new Set(rows.map((row) => row.market)).size;

  return (
    <div className="control-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Network operations</p>
          <h1>Screens</h1>
          <p className="page-description">Activate players, monitor every venue in real time, and manage venue-specific programming rules.</p>
        </div>
        <div className="page-actions"><ScreenFleetRefresh /></div>
      </header>

      <section className="metric-grid metric-grid-4" aria-label="Screen fleet summary">
        <article className="metric-card"><Monitor size={19} /><div><p className="metric-label">Total screens</p><p className="metric-value">{rows.length}</p><p className="metric-detail">Across {markets} market{markets === 1 ? "" : "s"}</p></div></article>
        <article className="metric-card"><Wifi size={19} /><div><p className="metric-label">Online now</p><p className="metric-value">{online}</p><p className="metric-detail">Heartbeat within 90 seconds</p></div></article>
        <article className="metric-card"><Activity size={19} /><div><p className="metric-label">Degraded</p><p className="metric-value">{degraded}</p><p className="metric-detail">Silent for 90 seconds–5 minutes</p></div></article>
        <article className="metric-card"><WifiOff size={19} /><div><p className="metric-label">Offline / waiting</p><p className="metric-value">{offline + neverConnected}</p><p className="metric-detail">{offline} offline · {neverConnected} never connected</p></div></article>
      </section>

      <details className="panel screen-activation-panel" open={rows.length === 0 || Boolean(error)}>
        <summary><Plus size={18} /> Activate a new screen</summary>
        <form action={activateScreen} className="screen-activation-form">
          {error ? <p className="form-error field-wide">Complete every required field and choose a valid host before activating the screen.</p> : null}
          <div className="form-heading field-wide"><h2>Host and location</h2><p>Choose an existing host account, or enter a new host below. A new email reserves the venue until that host signs up.</p></div>
          <label className="field field-wide"><span className="field-label">Existing host account (optional)</span><select name="existingHostId" defaultValue=""><option value="">Create or reserve a new host account</option>{hosts.map((host) => <option value={host.id} key={host.id}>{host.name || host.email} · {host.email}{host.status === "invited" ? " · invited" : ""}</option>)}</select></label>
          <label className="field"><span className="field-label">New host name</span><input name="hostName" /></label>
          <label className="field"><span className="field-label">New host email</span><input name="hostEmail" type="email" /></label>
          <label className="field"><span className="field-label">Business / venue</span><input name="venueName" required /></label>
          <label className="field"><span className="field-label">Venue type</span><input name="venueType" placeholder="Restaurant, gym, waiting room…" required /></label>
          <label className="field field-wide"><span className="field-label">Street address</span><input name="addressLine1" required /></label>
          <label className="field"><span className="field-label">Suite / unit</span><input name="addressLine2" /></label>
          <label className="field"><span className="field-label">City</span><input name="city" required /></label>
          <label className="field"><span className="field-label">State</span><input name="state" defaultValue="NC" maxLength={2} required /></label>
          <label className="field"><span className="field-label">ZIP code</span><input name="postalCode" required /></label>
          <label className="field"><span className="field-label">Market</span><input name="market" placeholder="New Bern" required /></label>
          <label className="field"><span className="field-label">Venue timezone</span><select name="timeZone" defaultValue="America/New_York"><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option></select></label>
          <div className="form-heading field-wide"><h2>Player</h2><p>NeuseCast generates a permanent player URL and secure one-time pairing link automatically.</p></div>
          <label className="field"><span className="field-label">Screen name</span><input name="screenName" placeholder="Dining room TV" required /></label>
          <label className="field"><span className="field-label">Orientation</span><select name="orientation" defaultValue="landscape"><option value="landscape">Landscape 16:9</option><option value="portrait">Portrait 9:16</option></select></label>
          <button className="button button-primary field-wide" type="submit"><Plus size={17} /> Generate player URL and activate</button>
        </form>
      </details>

      <section className="panel">
        <div className="panel-heading"><div><p className="panel-kicker">Live inventory</p><h2>Screen fleet</h2></div><span className="fleet-legend"><Radio size={13} /> Heartbeats determine live status</span></div>
        <div className="table-wrap">
          <table className="data-table screen-table">
            <thead><tr><th>Screen</th><th>Health</th><th>Content delivery</th><th>Device</th><th>Player URL</th><th>Host</th><th /></tr></thead>
            <tbody>
              {fleet.map((screen) => (
                <tr key={screen.id}>
                  <td data-label="Screen"><div className="entity-cell"><span className="entity-icon"><Monitor size={17} /></span><div><strong>{screen.venueName}</strong><span>{screen.name}</span><span className="location-line"><MapPin size={12} /> {screen.city} · {screen.market}</span></div></div></td>
                  <td data-label="Health">
                    <span className={`status-badge status-${screen.health}`}><span className="status-dot" />{healthLabels[screen.health]}</span>
                    <span className="cell-note">Heartbeat {formatAge(screen.lastHeartbeatAt, now)}</span>
                    {screen.lastError ? <span className="cell-note telemetry-error" title={screen.lastError}><TriangleAlert size={11} /> {screen.lastError.slice(0, 64)}</span> : null}
                  </td>
                  <td data-label="Content"><div className="telemetry-cell"><strong>Playlist {formatAge(screen.lastManifestAt, now)}</strong><span>{screen.lastManifestVersion ? `Manifest ${shortVersion(screen.lastManifestVersion)}` : "No manifest received"}</span><span>Playback {formatAge(screen.lastPlaybackAt, now)}{screen.currentItemId ? ` · item ${shortVersion(screen.currentItemId)}` : ""}</span></div></td>
                  <td data-label="Device"><div className="telemetry-cell"><strong>{screen.deviceClaimedAt ? "Paired" : "Awaiting pairing"}</strong><span>{screen.playerVersion ? `Player ${screen.playerVersion}` : "Version unknown"}</span><span>{screen.viewportWidth && screen.viewportHeight ? `${screen.viewportWidth}×${screen.viewportHeight}` : "Display not reported"}</span></div></td>
                  <td data-label="Player URL">{screen.playerKey ? <div className="screen-preview-cell"><code>/player/{screen.playerKey}</code><ScreenPreviewDialog label={`${screen.venueName} · ${screen.name}`} orientation={screen.orientation} previewUrl={`/player/${screen.playerKey}?preview=1`} /></div> : "—"}</td>
                  <td data-label="Host"><span className="cell-note">{screen.hostName || screen.hostEmail || screen.hostClerkUserId?.replace(/^invited:/, "") || "Unassigned"}</span></td>
                  <td className="screen-manage-cell" data-label="Manage"><Link className="button button-secondary" href={`/control/screens/${screen.id}`}>Manage</Link></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={7}>No screens yet. Activate the first player above.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
