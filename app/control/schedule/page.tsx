import { eq } from "drizzle-orm";
import { CalendarClock, Check, MonitorPlay, ShieldCheck } from "lucide-react";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { getDatabase } from "@/lib/db";
import { campaigns, creatives, hostContent, screens, venues } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  await ensureScreenManagementSchema();
  const db = getDatabase();
  const [screenRows, campaignRows, creativeRows, hostRows] = await Promise.all([
    db.select({ id: screens.id, name: screens.name, venue: venues.name, status: screens.status, active: screens.active }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)),
    db.select({ status: campaigns.status }).from(campaigns), db.select({ status: creatives.status }).from(creatives), db.select({ status: hostContent.status }).from(hostContent),
  ]);
  const paidEligible = campaignRows.filter((row) => ["scheduled", "active", "approved"].includes(row.status)).length;
  const approvedCreative = creativeRows.filter((row) => row.status === "approved").length;
  const liveHost = hostRows.filter((row) => ["scheduled", "approved"].includes(row.status)).length;
  const activeScreens = screenRows.filter((row) => row.active && row.status !== "retired");
  return <div className="control-page schedule-page">
    <header className="page-header"><div><p className="eyebrow">Live playlist rules</p><h1>Schedule</h1><p className="page-description">The player builds each venue loop from approved paid campaigns, that venue’s immediate host posts, and approved automated content.</p></div></header>
    <section className="metric-grid metric-grid-3"><article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-teal"><MonitorPlay size={18} /></span><div><p className="metric-label">Active screens</p><p className="metric-value">{activeScreens.length}</p></div><span className="metric-callout">Venue-specific manifests</span></article><article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-green"><ShieldCheck size={18} /></span><div><p className="metric-label">Approved ad creative</p><p className="metric-value">{approvedCreative}</p></div><span className="metric-callout">{paidEligible} paid campaigns scheduled/live</span></article><article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-gold"><CalendarClock size={18} /></span><div><p className="metric-label">Immediate host posts</p><p className="metric-value">{liveHost}</p></div><span className="metric-callout">Only on the host’s screen</span></article></section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Deterministic delivery</p><h2>Rotation rules</h2></div></div><ul className="check-list"><li><span className="check-dot" /><strong>Paid advertiser campaign:</strong>&nbsp; starts the next day, network-wide, only after admin creative approval.</li><li><span className="check-dot" /><strong>Host content:</strong>&nbsp; publishes immediately or at the host’s chosen time, only to their assigned screen.</li><li><span className="check-dot" /><strong>Venue blocking:</strong>&nbsp; advertiser blocks are applied independently for each screen.</li><li><span className="check-dot" /><strong>Player URL:</strong>&nbsp; each screen has its own addressable manifest and display URL.</li></ul></section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Destinations</p><h2>Screen playlists</h2></div></div>{activeScreens.length ? <div className="content-list">{activeScreens.map((screen) => <article className="content-row" key={screen.id}><span className="metric-icon metric-icon-teal"><Check size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{screen.venue} · {screen.name}</h2><span className={`status-badge status-${screen.status === "online" ? "approved" : "pending"}`}>{screen.status}</span></div><p>Unique player manifest · venue rules applied</p></div></article>)}</div> : <div className="empty-state"><h3>No screens configured</h3><p>Add a screen to create its venue-specific playlist URL.</p></div>}</section>
  </div>;
}
