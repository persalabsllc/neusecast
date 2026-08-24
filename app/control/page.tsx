import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, CircleAlert, DollarSign, Megaphone, MonitorCheck, Play, Radio } from "lucide-react";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { getDatabase } from "@/lib/db";
import { campaignOrders, campaigns, creatives, playbackEvents, screens, venues } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function heartbeatLabel(lastSeenAt: Date | null) {
  if (!lastSeenAt) return "Not checked in yet";
  const minutes = Math.max(0, Math.floor((Date.now() - lastSeenAt.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

export default async function ControlDashboard() {
  await ensureScreenManagementSchema();
  const db = getDatabase();
  const [screenRows, campaignRows, creativeRows, orderRows, playRows] = await Promise.all([
    db.select({ id: screens.id, name: screens.name, status: screens.status, active: screens.active, lastSeenAt: screens.lastSeenAt, playerKey: screens.providerScreenId, venue: venues.name, city: venues.city }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)).orderBy(desc(screens.createdAt)),
    db.select({ status: campaigns.status }).from(campaigns),
    db.select({ status: creatives.status }).from(creatives),
    db.select({ status: campaignOrders.status, amountCents: campaignOrders.amountCents }).from(campaignOrders),
    db.select({ id: playbackEvents.id }).from(playbackEvents),
  ]);
  const activeScreens = screenRows.filter((screen) => screen.active && screen.status !== "retired");
  const onlineScreens = activeScreens.filter((screen) => screen.status === "online");
  const attentionScreens = activeScreens.filter((screen) => screen.status !== "online");
  const activeCampaigns = campaignRows.filter((campaign) => ["approved", "scheduled", "active"].includes(campaign.status)).length;
  const reviewCount = creativeRows.filter((creative) => creative.status === "review").length;
  const monthlyBooked = orderRows.filter((order) => order.status === "paid").reduce((sum, order) => sum + order.amountCents, 0);
  const firstPlayer = activeScreens.find((screen) => screen.playerKey)?.playerKey;
  const metrics = [
    { label: "Screens online", value: `${onlineScreens.length} / ${activeScreens.length}`, detail: attentionScreens.length ? `${attentionScreens.length} need attention` : "All active screens reporting", icon: MonitorCheck, tone: "teal" },
    { label: "Live + scheduled campaigns", value: String(activeCampaigns), detail: `${reviewCount} creative${reviewCount === 1 ? "" : "s"} awaiting approval`, icon: Megaphone, tone: "coral" },
    { label: "Verified plays", value: playRows.length.toLocaleString(), detail: "Recorded player events", icon: Radio, tone: "blue" },
    { label: "Paid subscriptions", value: `$${(monthlyBooked / 100).toLocaleString()}`, detail: "$75 per active advertiser", icon: DollarSign, tone: "gold" },
  ] as const;

  return <div className="dashboard-page">
    <section className="dashboard-intro" aria-labelledby="dashboard-summary-title"><div><p className="eyebrow">Live operations</p><h2 id="dashboard-summary-title">Your network at a glance.</h2><p>Every number below comes from the live NeuseCast database.</p></div><div className="dashboard-actions">{firstPlayer ? <Link className="button button-secondary" href={`/player/${firstPlayer}`} target="_blank"><Play size={17} /> Open a player</Link> : null}<Link className="button button-secondary" href="/control/screens">Manage screens</Link><Link className="button button-primary" href="/control/campaigns">Review campaigns <ArrowRight size={17} /></Link></div></section>
    <section className="metric-grid" aria-label="Network performance">{metrics.map((metric) => { const Icon = metric.icon; return <article className={`metric-card metric-card-${metric.tone}`} key={metric.label}><div className="metric-heading"><span>{metric.label}</span><span className="metric-icon"><Icon size={19} /></span></div><strong className="metric-value">{metric.value}</strong><p>{metric.detail}</p></article>; })}</section>
    <section className="dashboard-primary-grid">
      <article className="panel"><div className="panel-heading"><div><span className="panel-kicker"><Radio size={14} /> Network status</span><h2>Operations queue</h2></div></div><div className="content-list"><Link className="content-row" href="/control/campaigns"><div className="content-main"><h2>{reviewCount} advertiser creative{reviewCount === 1 ? "" : "s"} awaiting review</h2><p>Paid campaigns remain off-air until an administrator approves the creative.</p></div><ArrowRight size={18} /></Link><Link className="content-row" href="/control/screens"><div className="content-main"><h2>{attentionScreens.length} screen{attentionScreens.length === 1 ? "" : "s"} need attention</h2><p>Pending, offline, and maintenance players appear here.</p></div>{attentionScreens.length ? <CircleAlert size={18} /> : <MonitorCheck size={18} />}</Link></div></article>
      <article className="panel"><div className="panel-heading"><div><span className="panel-kicker"><MonitorCheck size={14} /> Screen network</span><h2>Active screens</h2></div><Link className="text-link" href="/control/screens">Open screens <ArrowRight size={16} /></Link></div>{activeScreens.length ? <div className="content-list">{activeScreens.slice(0, 6).map((screen) => <article className="content-row" key={screen.id}><div className="content-main"><div className="content-title-line"><h2>{screen.venue} · {screen.name}</h2><span className={`status-badge status-${screen.status === "online" ? "approved" : "revision"}`}>{screen.status}</span></div><p>{screen.city} · {heartbeatLabel(screen.lastSeenAt)}</p></div></article>)}</div> : <div className="empty-state"><h3>No screens yet</h3><p>Add the first venue and player from Screens.</p><Link className="button button-primary" href="/control/screens">Add a screen</Link></div>}</article>
    </section>
  </div>;
}
