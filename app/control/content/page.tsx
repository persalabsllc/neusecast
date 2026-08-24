import { desc, eq } from "drizzle-orm";
import { Check, Clock3, Megaphone, MonitorPlay } from "lucide-react";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaigns, creatives, hostContent, screens, venues } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  await ensureScreenManagementSchema();
  const db = getDatabase();
  const [adRows, hostRows] = await Promise.all([
    db.select({ id: creatives.id, name: creatives.name, headline: creatives.headline, status: creatives.status, duration: creatives.durationSeconds, campaign: campaigns.name, business: advertiserAccounts.businessName, updatedAt: creatives.updatedAt }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id)).orderBy(desc(creatives.updatedAt)),
    db.select({ id: hostContent.id, headline: hostContent.headline, status: hostContent.status, venue: venues.name, screen: screens.name, startsAt: hostContent.startsAt, endsAt: hostContent.endsAt }).from(hostContent).innerJoin(venues, eq(hostContent.venueId, venues.id)).leftJoin(screens, eq(hostContent.screenId, screens.id)).orderBy(desc(hostContent.updatedAt)),
  ]);
  const reviewCount = adRows.filter((item) => item.status === "review").length;
  const approvedCount = adRows.filter((item) => item.status === "approved").length;
  const liveHostCount = hostRows.filter((item) => ["scheduled", "approved"].includes(item.status)).length;

  return <div className="control-page">
    <header className="page-header"><div><p className="eyebrow">Live creative library</p><h1>Content</h1><p className="page-description">Advertiser creative is reviewed before airing. Host content publishes immediately to its own screen.</p></div></header>
    <section className="metric-grid metric-grid-3"><article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-gold"><Clock3 size={18} /></span><div><p className="metric-label">Advertiser review</p><p className="metric-value">{reviewCount}</p></div><span className="metric-callout">Admin approval required</span></article><article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-green"><Check size={18} /></span><div><p className="metric-label">Approved ads</p><p className="metric-value">{approvedCount}</p></div><span className="metric-callout">Eligible to air</span></article><article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-teal"><MonitorPlay size={18} /></span><div><p className="metric-label">Host posts</p><p className="metric-value">{liveHostCount}</p></div><span className="metric-callout">Published directly</span></article></section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Paid campaigns</p><h2>Advertiser creative</h2></div></div>{adRows.length ? <div className="content-list">{adRows.map((item) => <article className="content-row" key={item.id}><span className="metric-icon metric-icon-gold"><Megaphone size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{item.headline || item.name}</h2><span className={`status-badge status-${item.status === "approved" ? "approved" : item.status === "review" ? "pending" : "revision"}`}>{item.status}</span></div><p>{item.business} · {item.campaign}</p><div className="metadata-row"><span>{item.duration} sec</span><span>Updated {item.updatedAt.toLocaleDateString()}</span></div></div></article>)}</div> : <div className="empty-state"><h3>No advertiser creative yet</h3><p>Completed advertiser onboarding will appear here for review.</p></div>}</section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Venue-owned</p><h2>Host content</h2></div></div>{hostRows.length ? <div className="content-list">{hostRows.map((item) => <article className="content-row" key={item.id}><span className="metric-icon metric-icon-teal"><MonitorPlay size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{item.headline}</h2><span className={`status-badge status-${["scheduled", "approved"].includes(item.status) ? "approved" : "revision"}`}>{item.status}</span></div><p>{item.venue}{item.screen ? ` · ${item.screen}` : ""}</p><div className="metadata-row"><span>{item.startsAt ? `Starts ${item.startsAt.toLocaleString()}` : "Published immediately"}</span>{item.endsAt ? <span>Ends {item.endsAt.toLocaleString()}</span> : null}</div></div></article>)}</div> : <div className="empty-state"><h3>No host content yet</h3><p>Host posts will appear here as soon as they publish to a screen.</p></div>}</section>
  </div>;
}
