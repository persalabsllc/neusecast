import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  CalendarDays,
  Check,
  Clock3,
  CloudSun,
  History,
  Lightbulb,
  LockKeyhole,
  Megaphone,
  MonitorPlay,
  Newspaper,
  Radio,
  Sparkles,
} from "lucide-react";
import {
  CreateFillerButton,
  DeleteFillerForm,
  FillerStatusButton,
  GenerateFillerButton,
} from "@/components/filler-actions";
import { FillerEditDialog } from "@/components/filler-edit-dialog";
import { ScreenFleetRefresh } from "@/components/screen-fleet-refresh";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { getDatabase } from "@/lib/db";
import {
  advertiserAccounts,
  campaigns,
  creatives,
  generatedContent,
  hostContent,
  screens,
  venues,
} from "@/lib/db/schema";
import {
  FILLER_CATEGORIES,
  FILLER_CATEGORY_LABELS,
  FILLER_THEMES,
  type FillerCategory,
} from "@/lib/filler/constants";
import { selectBalancedFiller } from "@/lib/filler/selection";
import { NEUSECAST_HOUSE_AD } from "@/lib/player/house-ad";
import { deriveScreenHealth } from "@/lib/player/health";
import {
  createFillerContent,
  deleteFillerContent,
  generateFillerNow,
  setFillerActive,
  updateFillerContent,
} from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type FillerState = "airing" | "queued" | "scheduled" | "paused" | "expired";

const stateLabels: Record<FillerState, string> = {
  airing: "Airing",
  queued: "Queued",
  scheduled: "Scheduled",
  paused: "Paused",
  expired: "Expired",
};

function fillerState(item: { approved: boolean; startsAt: Date | null; expiresAt: Date | null }, now: Date): FillerState {
  if (item.expiresAt && item.expiresAt.getTime() < now.getTime()) return "expired";
  if (!item.approved) return "paused";
  if (item.startsAt && item.startsAt.getTime() > now.getTime()) return "scheduled";
  return "airing";
}

function categoryLabel(category: string) {
  return FILLER_CATEGORY_LABELS[category as FillerCategory] ?? category.replaceAll("_", " ");
}

function metadataText(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(metadata: Record<string, unknown> | null, key: string, fallback: number) {
  const value = Number(metadata?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function FillerIcon({ category }: { category: string }) {
  if (category === "weather") return <CloudSun size={18} />;
  if (category === "news") return <Newspaper size={18} />;
  if (category === "event") return <CalendarDays size={18} />;
  if (category === "history" || category === "on_this_day") return <History size={18} />;
  return <Lightbulb size={18} />;
}

export default async function ContentPage({ searchParams }: {
  searchParams: Promise<{
    created?: string;
    error?: string;
    generated?: string;
    markets?: string;
    generationError?: string;
  }>;
}) {
  await ensureScreenManagementSchema();
  const db = getDatabase();
  const [query, adRows, hostRows, fillerRows, marketRows, screenRows] = await Promise.all([
    searchParams,
    db
      .select({
        id: creatives.id,
        name: creatives.name,
        headline: creatives.headline,
        status: creatives.status,
        duration: creatives.durationSeconds,
        campaign: campaigns.name,
        campaignStatus: campaigns.status,
        billingPaused: campaigns.billingPaused,
        business: advertiserAccounts.businessName,
        advertiserActive: advertiserAccounts.active,
        subscriptionStatus: advertiserAccounts.subscriptionStatus,
        updatedAt: creatives.updatedAt,
      })
      .from(creatives)
      .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
      .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
      .orderBy(desc(creatives.updatedAt)),
    db
      .select({
        id: hostContent.id,
        headline: hostContent.headline,
        status: hostContent.status,
        venue: venues.name,
        timeZone: venues.timeZone,
        screen: screens.name,
        startsAt: hostContent.startsAt,
        endsAt: hostContent.endsAt,
      })
      .from(hostContent)
      .innerJoin(venues, eq(hostContent.venueId, venues.id))
      .leftJoin(screens, eq(hostContent.screenId, screens.id))
      .orderBy(desc(hostContent.updatedAt)),
    db
      .select({
        id: generatedContent.id,
        category: generatedContent.category,
        market: generatedContent.market,
        title: generatedContent.title,
        body: generatedContent.body,
        sourceName: generatedContent.sourceName,
        sourceUrl: generatedContent.sourceUrl,
        artworkUrl: generatedContent.artworkUrl,
        startsAt: generatedContent.startsAt,
        expiresAt: generatedContent.expiresAt,
        approved: generatedContent.approved,
        metadata: generatedContent.metadata,
        createdAt: generatedContent.createdAt,
        updatedAt: generatedContent.updatedAt,
      })
      .from(generatedContent)
      .orderBy(desc(generatedContent.updatedAt)),
    db.selectDistinct({ market: venues.market, timeZone: venues.timeZone }).from(venues).orderBy(venues.market),
    db
      .select({
        market: venues.market,
        active: screens.active,
        status: screens.status,
        lastHeartbeatAt: screens.lastHeartbeatAt,
        currentItemId: screens.currentItemId,
      })
      .from(screens)
      .innerJoin(venues, eq(screens.venueId, venues.id)),
  ]);

  const now = new Date();
  const liveScreenRows = screenRows.filter((screen) => deriveScreenHealth({
    active: screen.active,
    status: screen.status,
    lastHeartbeatAt: screen.lastHeartbeatAt,
  }, now) === "online");
  const housePromoNowCount = liveScreenRows.filter((screen) => screen.currentItemId === NEUSECAST_HOUSE_AD.id).length;
  const fillerWithState = fillerRows.map((item) => ({ ...item, state: fillerState(item, now) }));
  const rotationIdsByScreen = screenRows
    .filter((screen) => screen.active && screen.status !== "retired")
    .map((screen) => new Set(selectBalancedFiller(fillerWithState.filter((item) => (
      item.state === "airing" && (!item.market || item.market === screen.market)
    )).slice(0, 200)).map((item) => item.id)));
  const hasActiveBilling = (item: (typeof adRows)[number]) => (
    item.advertiserActive
    && item.subscriptionStatus === "active"
    && !item.billingPaused
  );
  const reviewCount = adRows.filter((item) => item.status === "review").length;
  const airReadyCount = adRows.filter((item) => (
    item.status === "approved"
    && hasActiveBilling(item)
    && ["approved", "scheduled", "active"].includes(item.campaignStatus)
  )).length;
  const liveHostCount = hostRows.filter((item) => ["scheduled", "approved"].includes(item.status)).length;
  const activeFillerIds = new Set(rotationIdsByScreen.flatMap((ids) => [...ids]));
  const activeFillerCount = activeFillerIds.size + 1;
  const markets = [...new Set(marketRows.map((item) => item.market).filter(Boolean))];
  const timeZoneByMarket = new Map(marketRows.map((item) => [item.market, item.timeZone]));

  return (
    <div className="control-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Live creative library</p>
          <h1>Content</h1>
          <p className="page-description">Manage the exact filler, host posts, and approved advertising available to every screen.</p>
        </div>
        <div className="page-actions"><ScreenFleetRefresh /></div>
      </header>

      {query.created ? <div className="success-banner">Filler card added to the network library.</div> : null}
      {query.error ? <div className="form-error">Add a category, theme, title, and message before saving filler content.</div> : null}
      {query.generated !== undefined ? (
        <div className={query.generationError ? "screen-error-banner" : "success-banner"}>
          <Sparkles size={18} />
          <div>
            <strong>{query.generated} fresh sourced card{query.generated === "1" ? "" : "s"} generated</strong>
            <span>Across {query.markets ?? "0"} active market{query.markets === "1" ? "" : "s"}.{query.generationError ? " Some requested cards were rejected because they lacked a verified source or generation failed." : ""}</span>
          </div>
        </div>
      ) : null}

      <section className="metric-grid metric-grid-4" aria-label="Content library summary">
        <article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-gold"><Clock3 size={18} /></span><div><p className="metric-label">Advertiser review</p><p className="metric-value">{reviewCount}</p></div><span className="metric-callout">Admin approval required</span></article>
        <article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-green"><Check size={18} /></span><div><p className="metric-label">Air-ready ads</p><p className="metric-value">{airReadyCount}</p></div><span className="metric-callout">Approved + billing active</span></article>
        <article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-teal"><MonitorPlay size={18} /></span><div><p className="metric-label">Host posts</p><p className="metric-value">{liveHostCount}</p></div><span className="metric-callout">Published directly</span></article>
        <article className="metric-card compact-metric-card"><span className="metric-icon metric-icon-blue"><Sparkles size={18} /></span><div><p className="metric-label">Filler airing</p><p className="metric-value">{activeFillerCount}</p></div><span className="metric-callout">Includes house promo</span></article>
      </section>

      <section className="filler-control-grid">
        <details className="panel filler-editor" open={fillerRows.length === 0 || Boolean(query.error)}>
          <summary><Megaphone size={18} /> Add filler manually</summary>
          <form action={createFillerContent} className="filler-form">
            <label className="field"><span className="field-label">Category</span><select name="category" defaultValue="did_you_know">{FILLER_CATEGORIES.map((category) => <option value={category} key={category}>{FILLER_CATEGORY_LABELS[category]}</option>)}</select></label>
            <label className="field"><span className="field-label">Market</span><input name="market" list="filler-markets" placeholder="Leave blank for every market" /><datalist id="filler-markets">{markets.map((market) => <option value={market} key={market} />)}</datalist></label>
            <label className="field field-wide"><span className="field-label">Headline</span><input name="title" maxLength={180} required /></label>
            <label className="field field-wide"><span className="field-label">Message</span><textarea name="body" rows={4} maxLength={1000} required /></label>
            <label className="field"><span className="field-label">Eyebrow</span><input name="eyebrow" maxLength={80} placeholder="Did you know?" /></label>
            <label className="field"><span className="field-label">Call to action</span><input name="callToAction" maxLength={120} /></label>
            <label className="field"><span className="field-label">Source name</span><input name="sourceName" maxLength={160} /></label>
            <label className="field"><span className="field-label">Source URL</span><input name="sourceUrl" type="url" /></label>
            <label className="field field-wide"><span className="field-label">Artwork URL (optional)</span><input name="artworkUrl" type="url" /></label>
            <label className="field field-wide"><span className="field-label">Visible artwork credit</span><input name="artworkCredit" maxLength={200} placeholder="Photo: creator / source / license" /></label>
            <label className="field"><span className="field-label">Theme</span><select name="theme" defaultValue="navy">{FILLER_THEMES.map((theme) => <option value={theme} key={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>)}</select></label>
            <label className="field"><span className="field-label">Screen time</span><select name="durationSeconds" defaultValue="12"><option value="10">10 seconds</option><option value="12">12 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option></select></label>
            <label className="field"><span className="field-label">Expires</span><select name="lifetime" defaultValue="never"><option value="never">Never</option><option value="1_day">After 1 day</option><option value="7_days">After 7 days</option><option value="30_days">After 30 days</option></select></label>
            <label className="checkbox-field filler-publish"><input name="publish" type="checkbox" defaultChecked /><span><strong>Publish immediately</strong><small>Uncheck to save it paused.</small></span></label>
            <div className="field-wide form-actions"><CreateFillerButton /></div>
          </form>
        </details>

        <article className="panel filler-automation-panel">
          <div className="panel-heading"><div><p className="panel-kicker"><Sparkles size={14} /> Automatic filler</p><h2>Research fresh local cards</h2><p>Uses live web sources and rejects unsourced time-sensitive content. Weather refreshes every three hours; the remaining categories refresh each morning.</p></div></div>
          <form action={generateFillerNow} className="automation-form">
            <label className="field"><span className="field-label">Market</span><input name="market" list="automatic-filler-markets" placeholder="Blank = all active markets" /><datalist id="automatic-filler-markets">{markets.map((market) => <option value={market} key={market} />)}</datalist></label>
            <GenerateFillerButton />
          </form>
          <div className="automation-categories">{FILLER_CATEGORIES.map((category) => <span key={category}><Check size={12} /> {FILLER_CATEGORY_LABELS[category]}</span>)}</div>
        </article>
      </section>

      <section className="panel filler-library">
        <div className="panel-heading"><div><p className="eyebrow">Network filler</p><h2>What screens can play now</h2><p>Pause, resume, or remove any managed card. Market-specific cards only appear on matching screens.</p></div></div>
        <div className="content-list">
          <article className="content-row filler-row filler-row-system">
            <span className="metric-icon metric-icon-gold"><Radio size={18} /></span>
            <div className="content-main">
              <div className="content-title-line"><h2>{NEUSECAST_HOUSE_AD.title}</h2><span className="status-badge status-airing"><span className="status-dot" />Airing</span></div>
              <p>{NEUSECAST_HOUSE_AD.body}</p>
              <div className="metadata-row"><span><LockKeyhole size={12} /> Required system promo</span><span>{NEUSECAST_HOUSE_AD.durationSeconds} sec</span><span>Every active screen</span>{housePromoNowCount ? <span className="playing-now-label">Now on {housePromoNowCount} screen{housePromoNowCount === 1 ? "" : "s"}</span> : null}</div>
            </div>
            <span className="locked-content-note">Always on</span>
          </article>

          {fillerWithState.map((item) => {
            const active = item.state === "airing" || item.state === "scheduled";
            const origin = metadataText(item.metadata, "origin") === "automatic" ? "Automatic · sourced" : "Manual";
            const eligibleScreenCount = screenRows.filter((screen) => screen.active && (!item.market || screen.market === item.market)).length;
            const rotationScreenCount = rotationIdsByScreen.filter((ids) => ids.has(item.id)).length;
            const showingNowCount = liveScreenRows.filter((screen) => screen.currentItemId === item.id).length;
            const displayState: FillerState = item.state === "airing" && rotationScreenCount === 0 ? "queued" : item.state;
            return (
              <article className={`content-row filler-row filler-state-${displayState}`} key={item.id}>
                <span className="metric-icon metric-icon-blue"><FillerIcon category={item.category} /></span>
                <div className="content-main">
                  <div className="content-title-line"><h2>{item.title}</h2><span className={`status-badge status-${displayState}`}><span className="status-dot" />{stateLabels[displayState]}</span></div>
                  <p>{item.body}</p>
                  <div className="metadata-row">
                    <span>{categoryLabel(item.category)}</span>
                    <span>{origin}</span>
                    <span>{metadataNumber(item.metadata, "durationSeconds", 12)} sec</span>
                    <span>{item.market || "Every market"}</span>
                    <span>{eligibleScreenCount} eligible screen{eligibleScreenCount === 1 ? "" : "s"}</span>
                    <span>{rotationScreenCount} screen rotation{rotationScreenCount === 1 ? "" : "s"}</span>
                    {showingNowCount ? <span className="playing-now-label">Now on {showingNowCount} screen{showingNowCount === 1 ? "" : "s"}</span> : null}
                  </div>
                  <div className="metadata-row">
                    {item.sourceUrl ? <Link href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Source: {item.sourceName || "Open source"}</Link> : <span>{item.sourceName ? `Source: ${item.sourceName}` : "No source attached"}</span>}
                    {item.startsAt ? <span>Starts {item.startsAt.toLocaleString("en-US", { timeZone: timeZoneByMarket.get(item.market ?? "") ?? "America/New_York", timeZoneName: "short" })}</span> : null}
                    {item.expiresAt ? <span>Expires {item.expiresAt.toLocaleString("en-US", { timeZone: timeZoneByMarket.get(item.market ?? "") ?? "America/New_York", timeZoneName: "short" })}</span> : <span>No expiration</span>}
                  </div>
                </div>
                <div className="filler-row-actions">
                  <FillerEditDialog
                    key={item.updatedAt.toISOString()}
                    action={updateFillerContent}
                    markets={markets}
                    filler={{
                      id: item.id,
                      category: item.category as FillerCategory,
                      market: item.market,
                      title: item.title,
                      body: item.body,
                      eyebrow: metadataText(item.metadata, "eyebrow") ?? "",
                      callToAction: metadataText(item.metadata, "callToAction") ?? "",
                      sourceName: item.sourceName ?? "",
                      sourceUrl: item.sourceUrl ?? "",
                      artworkUrl: item.artworkUrl ?? "",
                      artworkCredit: metadataText(item.metadata, "artworkCredit") ?? "",
                      theme: (metadataText(item.metadata, "theme") ?? "navy") as (typeof FILLER_THEMES)[number],
                      durationSeconds: metadataNumber(item.metadata, "durationSeconds", 12),
                      automatic: metadataText(item.metadata, "origin") === "automatic",
                    }}
                  />
                  <form action={setFillerActive}>
                    <input type="hidden" name="contentId" value={item.id} />
                    <input type="hidden" name="approved" value={active ? "false" : "true"} />
                    <input type="hidden" name="resetExpiry" value={item.expiresAt && item.expiresAt.getTime() < now.getTime() ? "true" : "false"} />
                    <FillerStatusButton active={active} />
                  </form>
                  <DeleteFillerForm action={deleteFillerContent} contentId={item.id} title={item.title} />
                </div>
              </article>
            );
          })}
          {fillerRows.length === 0 ? <div className="empty-state filler-empty"><Sparkles size={30} /><h3>The house promo is protecting the loop.</h3><p>Add filler manually or generate a sourced batch to mix more local content into host posts.</p></div> : null}
        </div>
      </section>

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Advertiser campaigns</p><h2>Advertiser creative</h2><p>Editorial status and billing entitlement are shown separately. Only approved, entitled creative enters player manifests.</p></div></div>{adRows.length ? <div className="content-list">{adRows.map((item) => { const billingActive = hasActiveBilling(item); const billingLabel = billingActive ? "Billing active" : !item.advertiserActive ? "Account disabled" : item.billingPaused ? "Billing hold" : `Billing ${item.subscriptionStatus.replaceAll("_", " ")}`; return <article className="content-row" key={item.id}><span className="metric-icon metric-icon-gold"><Megaphone size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{item.headline || item.name}</h2><span className={`status-badge status-${item.status === "approved" ? "approved" : item.status === "review" ? "pending" : "revision"}`}>{item.status}</span><span className={`status-badge status-${billingActive ? "active" : "payment_pending"}`}>{billingLabel}</span></div><p>{item.business} · {item.campaign}</p><div className="metadata-row"><span>{item.duration} sec</span><span>Campaign {item.campaignStatus.replaceAll("_", " ")}</span><span>Updated {item.updatedAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })}</span></div></div></article>; })}</div> : <div className="empty-state"><h3>No advertiser creative yet</h3><p>Completed advertiser onboarding will appear here for review.</p></div>}</section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Venue-owned</p><h2>Host content</h2></div></div>{hostRows.length ? <div className="content-list">{hostRows.map((item) => <article className="content-row" key={item.id}><span className="metric-icon metric-icon-teal"><MonitorPlay size={18} /></span><div className="content-main"><div className="content-title-line"><h2>{item.headline}</h2><span className={`status-badge status-${["scheduled", "approved"].includes(item.status) ? "approved" : "revision"}`}>{item.status}</span></div><p>{item.venue}{item.screen ? ` · ${item.screen}` : ""}</p><div className="metadata-row"><span>{item.startsAt ? `Starts ${item.startsAt.toLocaleString("en-US", { timeZone: item.timeZone, timeZoneName: "short" })}` : "Published immediately"}</span>{item.endsAt ? <span>Ends {item.endsAt.toLocaleString("en-US", { timeZone: item.timeZone, timeZoneName: "short" })}</span> : null}</div></div></article>)}</div> : <div className="empty-state"><h3>No host content yet</h3><p>Host posts will appear here as soon as they publish to a screen.</p></div>}</section>
    </div>
  );
}
