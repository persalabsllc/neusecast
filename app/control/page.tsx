import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, CircleAlert, DollarSign, Megaphone, MonitorCheck, Play, Radio } from "lucide-react";
import { ScreenFleetRefresh } from "@/components/screen-fleet-refresh";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaigns, creatives, playbackEvents, screens, venues } from "@/lib/db/schema";
import { deriveScreenHealth, type ScreenHealth } from "@/lib/player/health";

export const dynamic = "force-dynamic";

const healthLabels: Record<ScreenHealth, string> = {
  never_connected: "Never connected",
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
  maintenance: "Maintenance",
  retired: "Retired",
};

function heartbeatLabel(lastHeartbeatAt: Date | null) {
  if (!lastHeartbeatAt) return "No authenticated heartbeat";
  const minutes = Math.max(0, Math.floor((Date.now() - lastHeartbeatAt.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

export default async function ControlDashboard() {
  await ensureScreenManagementSchema();
  const db = getDatabase();
  const [screenRows, campaignRows, creativeRows, advertiserRows, playRows] = await Promise.all([
    db.select({ id: screens.id, name: screens.name, status: screens.status, active: screens.active, lastHeartbeatAt: screens.lastHeartbeatAt, playerKey: screens.providerScreenId, venue: venues.name, city: venues.city }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)).orderBy(desc(screens.createdAt)),
    db.select({ status: campaigns.status, endsAt: campaigns.endsAt, billingPaused: campaigns.billingPaused, advertiserActive: advertiserAccounts.active, subscriptionStatus: advertiserAccounts.subscriptionStatus }).from(campaigns).innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id)),
    db.select({ status: creatives.status, billingPaused: campaigns.billingPaused, advertiserActive: advertiserAccounts.active, subscriptionStatus: advertiserAccounts.subscriptionStatus }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id)),
    db.select({ active: advertiserAccounts.active, subscriptionStatus: advertiserAccounts.subscriptionStatus }).from(advertiserAccounts),
    db.select({ id: playbackEvents.id }).from(playbackEvents),
  ]);
  const now = new Date();
  const activeScreens = screenRows
    .filter((screen) => screen.active && screen.status !== "retired")
    .map((screen) => ({
      ...screen,
      health: deriveScreenHealth({
        active: screen.active,
        status: screen.status,
        lastHeartbeatAt: screen.lastHeartbeatAt,
      }, now),
    }));
  const onlineScreens = activeScreens.filter((screen) => screen.health === "online");
  const attentionScreens = activeScreens.filter((screen) => screen.health !== "online");
  const activeCampaigns = campaignRows.filter((campaign) => (
    campaign.advertiserActive
    && campaign.subscriptionStatus === "active"
    && !campaign.billingPaused
    && (!campaign.endsAt || campaign.endsAt >= now)
    && ["approved", "scheduled", "active"].includes(campaign.status)
  )).length;
  const reviewCount = creativeRows.filter((creative) => (
    creative.advertiserActive
    && creative.subscriptionStatus === "active"
    && !creative.billingPaused
    && creative.status === "review"
  )).length;
  const activeSubscriptions = advertiserRows.filter((advertiser) => advertiser.active && advertiser.subscriptionStatus === "active").length;
  const monthlyRecurringRevenue = activeSubscriptions * 7_500;
  const firstPlayer = activeScreens.find((screen) => screen.playerKey)?.playerKey;
  const metrics = [
    { label: "Screens online", value: `${onlineScreens.length} / ${activeScreens.length}`, detail: attentionScreens.length ? `${attentionScreens.length} need attention` : "All active screens reporting", icon: MonitorCheck, tone: "teal" },
    { label: "Live + scheduled campaigns", value: String(activeCampaigns), detail: `${reviewCount} creative${reviewCount === 1 ? "" : "s"} awaiting approval`, icon: Megaphone, tone: "coral" },
    { label: "Verified plays", value: playRows.length.toLocaleString(), detail: "Recorded player events", icon: Radio, tone: "blue" },
    { label: "Monthly recurring revenue", value: `$${(monthlyRecurringRevenue / 100).toLocaleString()}`, detail: `${activeSubscriptions} active subscription${activeSubscriptions === 1 ? "" : "s"} · $75 each`, icon: DollarSign, tone: "gold" },
  ] as const;

  return <div className="dashboard-page">
    <section className="dashboard-intro" aria-labelledby="dashboard-summary-title"><div><p className="eyebrow">Live operations</p><h2 id="dashboard-summary-title">Your network at a glance.</h2><p>Screen health is calculated from authenticated player heartbeats, not a saved status label.</p></div><div className="dashboard-actions"><ScreenFleetRefresh />{firstPlayer ? <Link className="button button-secondary" href={`/player/${firstPlayer}?preview=1`} target="_blank" rel="noopener noreferrer"><Play size={17} /> Preview a player</Link> : null}<Link className="button button-secondary" href="/control/screens">Manage screens</Link><Link className="button button-primary" href="/control/campaigns">Review campaigns <ArrowRight size={17} /></Link></div></section>
    <section className="metric-grid" aria-label="Network performance">{metrics.map((metric) => { const Icon = metric.icon; return <article className={`metric-card metric-card-${metric.tone}`} key={metric.label}><div className="metric-heading"><span>{metric.label}</span><span className="metric-icon"><Icon size={19} /></span></div><strong className="metric-value">{metric.value}</strong><p>{metric.detail}</p></article>; })}</section>
    <section className="dashboard-primary-grid">
      <article className="panel"><div className="panel-heading"><div><span className="panel-kicker"><Radio size={14} /> Network status</span><h2>Operations queue</h2></div></div><div className="content-list"><Link className="content-row" href="/control/campaigns"><div className="content-main"><h2>{reviewCount} advertiser creative{reviewCount === 1 ? "" : "s"} awaiting review</h2><p>Paid campaigns remain off-air until an administrator approves the creative.</p></div><ArrowRight size={18} /></Link><Link className="content-row" href="/control/screens"><div className="content-main"><h2>{attentionScreens.length} screen{attentionScreens.length === 1 ? "" : "s"} need attention</h2><p>Pending, degraded, and offline active players appear here.</p></div>{attentionScreens.length ? <CircleAlert size={18} /> : <MonitorCheck size={18} />}</Link></div></article>
      <article className="panel"><div className="panel-heading"><div><span className="panel-kicker"><MonitorCheck size={14} /> Screen network</span><h2>Active screens</h2></div><Link className="text-link" href="/control/screens">Open screens <ArrowRight size={16} /></Link></div>{activeScreens.length ? <div className="content-list">{activeScreens.slice(0, 6).map((screen) => <article className="content-row" key={screen.id}><div className="content-main"><div className="content-title-line"><h2>{screen.venue} · {screen.name}</h2><span className={`status-badge status-${screen.health}`}><span className="status-dot" />{healthLabels[screen.health]}</span></div><p>{screen.city} · {heartbeatLabel(screen.lastHeartbeatAt)}</p></div></article>)}</div> : <div className="empty-state"><h3>No screens yet</h3><p>Add the first venue and player from Screens.</p><Link className="button button-primary" href="/control/screens">Add a screen</Link></div>}</article>
    </section>
  </div>;
}
