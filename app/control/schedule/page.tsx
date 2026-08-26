import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, CalendarClock, Check, MonitorPlay, ShieldCheck, Sparkles } from "lucide-react";
import { ScreenFleetRefresh } from "@/components/screen-fleet-refresh";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { getDatabase } from "@/lib/db";
import {
  advertiserAccounts,
  campaigns,
  creatives,
  generatedContent,
  hostContent,
  newsroomEditions,
  playerManifestSnapshots,
  screens,
  venues,
} from "@/lib/db/schema";
import { isNeusecastHouseAdId, NEUSECAST_HOUSE_AD } from "@/lib/player/house-ad";
import { deriveScreenHealth, type ScreenHealth } from "@/lib/player/health";

export const dynamic = "force-dynamic";

const CONTROL_TIME_ZONE = "America/New_York";
const AIRABLE_CAMPAIGN_STATUSES = new Set(["approved", "scheduled", "active"]);

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

function formatTimestamp(timestamp: Date | null, timeZone: string) {
  if (!timestamp) return null;
  return timestamp.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatWindow(startsAt: Date | null, endsAt: Date | null, timeZone: string) {
  const start = formatTimestamp(startsAt, timeZone);
  const end = formatTimestamp(endsAt, timeZone);
  if (start && end) return `${start} → ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Now → ${end}`;
  return "No end date";
}

function shortVersion(version: string | null) {
  if (!version) return "No manifest received";
  return version.length > 14 ? `${version.slice(0, 8)}…${version.slice(-4)}` : version;
}

export default async function SchedulePage() {
  await ensureScreenManagementSchema();
  const db = getDatabase();
  const [screenRows, campaignRows, creativeRows, hostRows, fillerRows, newsroomRows, snapshotRows] = await Promise.all([
    db
      .select({
        id: screens.id,
        name: screens.name,
        venue: venues.name,
        status: screens.status,
        active: screens.active,
        lastHeartbeatAt: screens.lastHeartbeatAt,
        lastManifestAt: screens.lastManifestAt,
        lastManifestVersion: screens.lastManifestVersion,
        lastPlaybackAt: screens.lastPlaybackAt,
        currentItemId: screens.currentItemId,
      })
      .from(screens)
      .innerJoin(venues, eq(screens.venueId, venues.id))
      .orderBy(venues.name, screens.name),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        business: advertiserAccounts.businessName,
        status: campaigns.status,
        startsAt: campaigns.startsAt,
        endsAt: campaigns.endsAt,
        targeting: campaigns.targeting,
        billingPaused: campaigns.billingPaused,
        advertiserActive: advertiserAccounts.active,
        subscriptionStatus: advertiserAccounts.subscriptionStatus,
      })
      .from(campaigns)
      .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
      .orderBy(desc(campaigns.createdAt)),
    db
      .select({
        id: creatives.id,
        name: creatives.name,
        headline: creatives.headline,
        status: creatives.status,
        campaignStatus: campaigns.status,
        targeting: campaigns.targeting,
        billingPaused: campaigns.billingPaused,
        advertiserActive: advertiserAccounts.active,
        subscriptionStatus: advertiserAccounts.subscriptionStatus,
      })
      .from(creatives)
      .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
      .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id)),
    db
      .select({
        id: hostContent.id,
        headline: hostContent.headline,
        status: hostContent.status,
        startsAt: hostContent.startsAt,
        endsAt: hostContent.endsAt,
        venue: venues.name,
        screen: screens.name,
        timeZone: venues.timeZone,
      })
      .from(hostContent)
      .innerJoin(venues, eq(hostContent.venueId, venues.id))
      .leftJoin(screens, eq(hostContent.screenId, screens.id))
      .orderBy(desc(hostContent.updatedAt)),
    db
      .select({
        id: generatedContent.id,
        title: generatedContent.title,
        market: generatedContent.market,
        approved: generatedContent.approved,
        startsAt: generatedContent.startsAt,
        expiresAt: generatedContent.expiresAt,
      })
      .from(generatedContent)
      .orderBy(desc(generatedContent.updatedAt)),
    db
      .select({
        id: newsroomEditions.id,
        label: newsroomEditions.label,
        headline: newsroomEditions.headline,
        status: newsroomEditions.status,
        market: newsroomEditions.market,
        scheduledAt: newsroomEditions.scheduledAt,
        expiresAt: newsroomEditions.expiresAt,
        revision: newsroomEditions.revision,
      })
      .from(newsroomEditions)
      .orderBy(desc(newsroomEditions.updatedAt)),
    db
      .selectDistinctOn([playerManifestSnapshots.screenId], {
        screenId: playerManifestSnapshots.screenId,
        items: playerManifestSnapshots.items,
      })
      .from(playerManifestSnapshots)
      .orderBy(playerManifestSnapshots.screenId, desc(playerManifestSnapshots.deliveredAt)),
  ]);

  const now = new Date();
  const billingEntitled = (row: {
    advertiserActive: boolean;
    subscriptionStatus: string;
    billingPaused: boolean;
  }) => row.advertiserActive && row.subscriptionStatus === "active" && !row.billingPaused;
  const scheduledCampaigns = campaignRows.filter((row) => (
    AIRABLE_CAMPAIGN_STATUSES.has(row.status)
    && (!row.endsAt || row.endsAt.getTime() >= now.getTime())
  ));
  const eligibleCampaigns = scheduledCampaigns.filter(billingEntitled).length;
  const approvedCreative = creativeRows.filter((row) => (
    row.status === "approved"
    && AIRABLE_CAMPAIGN_STATUSES.has(row.campaignStatus)
    && billingEntitled(row)
  )).length;
  const scheduledHost = hostRows.filter((row) => (
    ["scheduled", "approved"].includes(row.status)
    && (!row.endsAt || row.endsAt.getTime() >= now.getTime())
  ));
  const scheduledFiller = fillerRows.filter((row) => (
    row.approved
    && (!row.expiresAt || row.expiresAt.getTime() >= now.getTime())
  ));
  const scheduledNewsroom = newsroomRows.filter((row) => (
    row.status === "published" && row.expiresAt.getTime() >= now.getTime()
  ));
  const activeScreens = screenRows
    .filter((row) => row.active && row.status !== "retired")
    .map((row) => ({ ...row, health: deriveScreenHealth(row, now) }));
  const contentNames = new Map<string, string>([
    [NEUSECAST_HOUSE_AD.id, NEUSECAST_HOUSE_AD.title],
    ...creativeRows.map((row) => [row.id, row.headline || row.name] as const),
    ...hostRows.map((row) => [row.id, row.headline] as const),
    ...fillerRows.map((row) => [row.id, row.title] as const),
    ...newsroomRows.map((row) => [`newsroom-${row.id}-r${row.revision}`, `${row.label}: ${row.headline}`] as const),
  ]);
  const contentName = (itemId: string) => (
    isNeusecastHouseAdId(itemId) ? NEUSECAST_HOUSE_AD.title : contentNames.get(itemId) ?? itemId
  );
  const snapshotByScreen = new Map(snapshotRows.map((row) => [row.screenId, row]));

  return (
    <div className="control-page schedule-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Live playlist rules</p>
          <h1>Schedule</h1>
          <p className="page-description">Verify every delivery window and the latest venue-specific playlist sync in one place.</p>
        </div>
        <div className="page-actions"><ScreenFleetRefresh /></div>
      </header>

      <section className="metric-grid metric-grid-3">
        <article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-teal"><MonitorPlay size={18} /></span><div><p className="metric-label">Active screens</p><p className="metric-value">{activeScreens.length}</p></div><span className="metric-callout">Venue-specific manifests</span></article>
        <article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-green"><ShieldCheck size={18} /></span><div><p className="metric-label">Air-ready ad creative</p><p className="metric-value">{approvedCreative}</p></div><span className="metric-callout">{eligibleCampaigns} paid or house campaigns queued/live</span></article>
        <article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-gold"><CalendarClock size={18} /></span><div><p className="metric-label">Host posts queued/live</p><p className="metric-value">{scheduledHost.length}</p></div><span className="metric-callout">Only on the host’s screen</span></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Deterministic delivery</p><h2>Rotation rules</h2></div></div>
        <ul className="check-list">
          <li><span className="check-dot" /><strong>Paid advertiser campaign:</strong>&nbsp; starts the next day, network-wide, only after admin creative approval.</li>
          <li><span className="check-dot" /><strong>Host content:</strong>&nbsp; publishes immediately or at the host’s chosen time, only to their assigned screen.</li>
          <li><span className="check-dot" /><strong>Network filler:</strong>&nbsp; approved manual and sourced automatic cards mix between host posts; the NeuseCast house promotion remains in every loop.</li>
          <li><span className="check-dot" /><strong>NeuseCast Newsroom:</strong>&nbsp; the current 3–5 minute edition is offered about once per hour; sensitive stories require approval before they enter the broadcast package.</li>
          <li><span className="check-dot" /><strong>Venue blocking:</strong>&nbsp; advertiser blocks are applied independently for each screen.</li>
          <li><span className="check-dot" /><strong>Player URL:</strong>&nbsp; each screen has its own addressable manifest and display URL.</li>
        </ul>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Delivery windows</p><h2>Advertiser, host, and filler schedule</h2><p>Campaign and filler times are shown in Eastern Time. Host times use each venue’s timezone.</p></div></div>
        <div className="content-list">
          {scheduledCampaigns.map((campaign) => {
            const houseAd = campaign.targeting?.houseAd;
            const entitled = billingEntitled(campaign);
            const billingLabel = houseAd
              ? "House ad · billing bypassed"
              : entitled
              ? "Billing active"
              : !campaign.advertiserActive
                ? "Account disabled"
                : campaign.billingPaused
                  ? "Billing hold"
                  : `Billing ${campaign.subscriptionStatus.replaceAll("_", " ")}`;
            return <article className="content-row" key={campaign.id}><span className="metric-icon metric-icon-gold"><ShieldCheck size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{houseAd?.sponsor || campaign.business} · {campaign.name}</h2><span className={`status-badge status-${campaign.status}`}>{campaign.status}</span><span className={`status-badge status-${houseAd || entitled ? "active" : "payment_pending"}`}>{billingLabel}</span></div><p>{houseAd ? "Network-wide house advertisement" : "Network-wide advertiser campaign"}</p><div className="metadata-row"><span>{formatWindow(campaign.startsAt, campaign.endsAt, CONTROL_TIME_ZONE)}</span></div></div></article>;
          })}
          {scheduledHost.map((item) => <article className="content-row" key={item.id}><span className="metric-icon metric-icon-teal"><MonitorPlay size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{item.headline}</h2><span className={`status-badge status-${item.status === "approved" ? "active" : item.status}`}>{item.status}</span></div><p>{item.venue}{item.screen ? ` · ${item.screen}` : ""} · venue-only</p><div className="metadata-row"><span>{formatWindow(item.startsAt, item.endsAt, item.timeZone)}</span></div></div></article>)}
          {scheduledFiller.map((item) => <article className="content-row" key={item.id}><span className="metric-icon metric-icon-blue"><Sparkles size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{item.title}</h2><span className="status-badge status-active">Filler enabled</span></div><p>{item.market || "Every market"}</p><div className="metadata-row"><span>{formatWindow(item.startsAt, item.expiresAt, CONTROL_TIME_ZONE)}</span></div></div></article>)}
          {scheduledNewsroom.map((item) => <article className="content-row" key={item.id}><span className="metric-icon metric-icon-coral"><CalendarClock size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{item.label} · {item.headline}</h2><span className="status-badge status-active">Newsroom on air</span></div><p>{item.market} · approximately once per hour</p><div className="metadata-row"><span>{formatWindow(item.scheduledAt, item.expiresAt, CONTROL_TIME_ZONE)}</span></div></div><Link className="button button-secondary" href={`/control/newsroom/${item.id}`} target="_blank">Preview</Link></article>)}
          {!scheduledCampaigns.length && !scheduledHost.length && !scheduledFiller.length && !scheduledNewsroom.length ? <div className="empty-state"><h3>No scheduled content yet</h3><p>Approved advertiser, host, filler, and newsroom windows will appear here.</p></div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Destinations</p><h2>Screen playlists</h2><p>Manifest sync and proof-of-play show what each venue player most recently received and displayed.</p></div></div>
        {activeScreens.length ? <div className="content-list">{activeScreens.map((screen) => { const snapshot = snapshotByScreen.get(screen.id); const playbackLabel = screen.health === "online" ? "Now playing" : "Last reported"; return <article className="content-row" key={screen.id}><span className="metric-icon metric-icon-teal"><Check size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{screen.venue} · {screen.name}</h2><span className={`status-badge status-${screen.health}`}><span className="status-dot" />{healthLabels[screen.health]}</span></div><p>Playlist synced {formatAge(screen.lastManifestAt, now)} · manifest {shortVersion(screen.lastManifestVersion)}</p><div className="metadata-row"><span>Playback {formatAge(screen.lastPlaybackAt, now)}</span><span>{screen.currentItemId ? `${playbackLabel}: ${contentName(screen.currentItemId)}` : "No current item reported"}</span></div>{snapshot ? <div className="metadata-row" aria-label={`Latest ordered playlist for ${screen.venue}`}><span>Latest loop ({snapshot.items.length} items):</span>{snapshot.items.map((item, index) => <span key={`${item.id}-${index}`}>{index + 1}. {contentName(item.id)}</span>)}</div> : <div className="metadata-row"><span>No authenticated manifest snapshot yet</span></div>}</div><Link className="button button-secondary" href={`/control/screens/${screen.id}`}>Inspect <ArrowRight size={15} /></Link></article>; })}</div> : <div className="empty-state"><h3>No screens configured</h3><p>Add a screen to create its venue-specific playlist URL.</p></div>}
      </section>
    </div>
  );
}
