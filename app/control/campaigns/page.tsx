import { count, countDistinct, desc, eq, inArray } from "drizzle-orm";
import { BadgeCheck, Ban, BarChart3, CalendarClock, CircleDollarSign, Eye, Megaphone, Pause, ShieldCheck } from "lucide-react";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaigns, creatives, playbackEvents } from "@/lib/db/schema";
import { NEUSECAST_MONTHLY_PRICE } from "@/lib/pricing";
import { approveCreative, pauseCampaign, rejectCreative } from "./actions";

function metadataText(metadata: Record<string, unknown> | null, key: string) {
  return typeof metadata?.[key] === "string" ? String(metadata[key]) : "";
}

export default async function CampaignsPage() {
  const database = getDatabase();
  const [reviewRows, paidCampaigns, results] = await Promise.all([
    database.select({
      creativeId: creatives.id,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      businessName: advertiserAccounts.businessName,
      headline: creatives.headline,
      body: creatives.body,
      callToAction: creatives.callToAction,
      metadata: creatives.metadata,
      createdAt: creatives.createdAt,
    }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id)).where(eq(creatives.status, "review")).orderBy(desc(creatives.createdAt)),
    database.select({ id: campaigns.id, name: campaigns.name, businessName: advertiserAccounts.businessName, status: campaigns.status, startsAt: campaigns.startsAt }).from(campaigns).innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id)).where(inArray(campaigns.status, ["payment_pending", "scheduled", "active", "paused"])).orderBy(desc(campaigns.createdAt)),
    database.select({ campaignId: playbackEvents.campaignId, plays: count(playbackEvents.id), screens: countDistinct(playbackEvents.screenId) }).from(playbackEvents).groupBy(playbackEvents.campaignId),
  ]);
  const resultMap = new Map(results.map((row) => [row.campaignId, row]));
  const activeCount = paidCampaigns.filter((campaign) => campaign.status === "active" || campaign.status === "scheduled").length;

  return (
    <div className="control-page">
      <header className="page-header"><div><p className="eyebrow">Sales &amp; delivery</p><h1>Campaigns</h1><p className="page-description">Review paid creative, control broadcast eligibility, and track verified delivery.</p></div></header>
      <section className="metric-grid metric-grid-4" aria-label="Campaign summary">
        <article className="metric-card"><span className="metric-icon metric-icon-coral"><ShieldCheck size={18} aria-hidden="true" /></span><div><p className="metric-label">Creative to review</p><p className="metric-value">{reviewRows.length}</p><p className="metric-detail">Paid and waiting</p></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-green"><Megaphone size={18} aria-hidden="true" /></span><div><p className="metric-label">Live or queued</p><p className="metric-value">{activeCount}</p><p className="metric-detail">Across all active screens</p></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-blue"><BarChart3 size={18} aria-hidden="true" /></span><div><p className="metric-label">Verified plays</p><p className="metric-value">{results.reduce((sum, row) => sum + row.plays, 0).toLocaleString()}</p><p className="metric-detail">Proof of play</p></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-violet"><CircleDollarSign size={18} aria-hidden="true" /></span><div><p className="metric-label">Standard plan</p><p className="metric-value">{NEUSECAST_MONTHLY_PRICE}</p><p className="metric-detail">Per campaign / month</p></div></article>
      </section>

      <section className="panel campaign-review-panel">
        <div className="section-title-row"><div><span>Moderation queue</span><h2>Creative awaiting review</h2></div><p>Approving makes the newest creative eligible at its scheduled start. Rejecting keeps it off every player.</p></div>
        {reviewRows.length === 0 ? <div className="control-empty"><BadgeCheck size={24} aria-hidden="true" /><strong>Review queue is clear.</strong><span>New paid campaigns will appear here automatically.</span></div> : <div className="review-creative-grid">{reviewRows.map((creative) => {
          const theme = metadataText(creative.metadata, "theme") || "aqua";
          return <article className="review-creative-card" key={creative.creativeId}>
            <div className={`campaign-creative-preview theme-${theme}`}><div className="campaign-creative-topline"><span>{metadataText(creative.metadata, "eyebrow") || "Local business"}</span><span>Eastern Carolina</span></div><div className="campaign-creative-message"><strong>{creative.headline}</strong><p>{creative.body}</p></div><div className="campaign-creative-footer"><span>{creative.callToAction}</span><span>NEUSECAST</span></div></div>
            <div className="review-creative-meta"><span>{creative.businessName}</span><h3>{creative.campaignName}</h3><small>Submitted {creative.createdAt.toLocaleString("en-US", { timeZone: "America/New_York" })}</small></div>
            <div className="review-actions"><form action={approveCreative}><input type="hidden" name="creativeId" value={creative.creativeId} /><input type="hidden" name="campaignId" value={creative.campaignId} /><button className="button button-primary button-small"><BadgeCheck size={15} aria-hidden="true" /> Approve</button></form><form action={rejectCreative}><input type="hidden" name="creativeId" value={creative.creativeId} /><button className="button button-secondary button-small"><Ban size={15} aria-hidden="true" /> Reject</button></form></div>
          </article>;
        })}</div>}
      </section>

      <section className="panel campaign-review-panel">
        <div className="section-title-row"><div><span>Delivery</span><h2>Paid campaign roster</h2></div></div>
        <div className="paid-campaign-table">{paidCampaigns.map((campaign) => { const result = resultMap.get(campaign.id); return <article key={campaign.id}><div><span className={`status-badge status-${campaign.status}`}>{campaign.status}</span><h3>{campaign.businessName} · {campaign.name}</h3></div><dl><div><dt><CalendarClock size={14} /> Start</dt><dd>{campaign.startsAt ? campaign.startsAt.toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "After payment"}</dd></div><div><dt><Eye size={14} /> Results</dt><dd>{result ? `${result.plays} plays · ${result.screens} screens` : "No plays yet"}</dd></div></dl><form action={pauseCampaign}><input type="hidden" name="campaignId" value={campaign.id} /><button className="button button-secondary button-small" disabled={campaign.status === "paused"}><Pause size={14} /> Pause</button></form></article>; })}</div>
      </section>
    </div>
  );
}
