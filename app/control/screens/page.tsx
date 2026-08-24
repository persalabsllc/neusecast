import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ExternalLink, MapPin, Monitor, Plus, Wifi, WifiOff } from "lucide-react";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, screens, venues } from "@/lib/db/schema";
import { activateScreen } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScreensPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await ensureScreenManagementSchema();
  const [{ error }, rows, hosts] = await Promise.all([
    searchParams,
    getDatabase().select({ id: screens.id, name: screens.name, playerKey: screens.providerScreenId, status: screens.status, active: screens.active, lastSeenAt: screens.lastSeenAt, venueName: venues.name, city: venues.city, market: venues.market, hostClerkUserId: venues.hostClerkUserId }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)).orderBy(desc(screens.createdAt)),
    getDatabase().select({ id: appUsers.clerkUserId, name: appUsers.displayName, email: appUsers.email, status: appUsers.status }).from(appUsers).where(eq(appUsers.role, "host")).orderBy(appUsers.displayName),
  ]);
  const online = rows.filter((row) => row.status === "online").length;
  const attention = rows.filter((row) => row.active && row.status !== "online").length;
  const markets = new Set(rows.map((row) => row.market)).size;

  return <div className="control-page">
    <header className="page-header"><div><p className="eyebrow">Network operations</p><h1>Screens</h1><p className="page-description">Activate a permanent player URL, assign its host, and manage venue-specific programming rules.</p></div></header>
    <section className="metric-grid metric-grid-4" aria-label="Screen fleet summary">
      <article className="metric-card"><Monitor size={19} /><div><p className="metric-label">Total screens</p><p className="metric-value">{rows.length}</p><p className="metric-detail">Across {markets} market{markets === 1 ? "" : "s"}</p></div></article>
      <article className="metric-card"><Wifi size={19} /><div><p className="metric-label">Online now</p><p className="metric-value">{online}</p><p className="metric-detail">Reporting normally</p></div></article>
      <article className="metric-card"><WifiOff size={19} /><div><p className="metric-label">Needs attention</p><p className="metric-value">{attention}</p><p className="metric-detail">Pending or offline players</p></div></article>
      <article className="metric-card"><ExternalLink size={19} /><div><p className="metric-label">Delivery model</p><p className="metric-value">Direct</p><p className="metric-detail">NeuseCast browser players</p></div></article>
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
        <div className="form-heading field-wide"><h2>Player</h2><p>NeuseCast generates the private key and permanent player URL automatically.</p></div>
        <label className="field"><span className="field-label">Screen name</span><input name="screenName" placeholder="Dining room TV" required /></label>
        <label className="field"><span className="field-label">Orientation</span><select name="orientation" defaultValue="landscape"><option value="landscape">Landscape 16:9</option><option value="portrait">Portrait 9:16</option></select></label>
        <button className="button button-primary field-wide" type="submit"><Plus size={17} /> Generate player URL and activate</button>
      </form>
    </details>

    <section className="panel"><div className="panel-heading"><div><p className="panel-kicker">Live inventory</p><h2>Screen fleet</h2></div></div><div className="table-wrap"><table className="data-table screen-table"><thead><tr><th>Screen</th><th>Status</th><th>Player URL</th><th>Host</th><th /></tr></thead><tbody>
      {rows.map((screen) => <tr key={screen.id}>
        <td><div className="entity-cell"><span className="entity-icon"><Monitor size={17} /></span><div><strong>{screen.venueName}</strong><span>{screen.name}</span><span className="location-line"><MapPin size={12} /> {screen.city} · {screen.market}</span></div></div></td>
        <td><span className={`status-badge status-${screen.status}`}><span className="status-dot" />{screen.status}</span><span className="cell-note">{screen.lastSeenAt ? `Seen ${screen.lastSeenAt.toLocaleString()}` : "Awaiting first connection"}</span></td>
        <td>{screen.playerKey ? <Link href={`/player/${screen.playerKey}`} target="_blank">/player/{screen.playerKey}</Link> : "—"}</td>
        <td><span className="cell-note">{screen.hostClerkUserId?.startsWith("invited:") ? screen.hostClerkUserId.slice(8) : "Connected host"}</span></td>
        <td><Link className="button button-secondary" href={`/control/screens/${screen.id}`}>Manage</Link></td>
      </tr>)}
      {rows.length === 0 ? <tr><td colSpan={5}>No screens yet. Activate the first player above.</td></tr> : null}
    </tbody></table></div></section>
  </div>;
}
