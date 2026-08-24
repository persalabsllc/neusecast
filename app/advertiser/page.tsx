import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { count, countDistinct, desc, eq } from "drizzle-orm";
import { ArrowRight, BadgeCheck, BarChart3, CalendarRange, CircleDollarSign, Clock3, Edit3, Megaphone, Plus, Target } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaignOrders, campaigns, playbackEvents } from "@/lib/db/schema";
import { NEUSECAST_MONTHLY_PRICE } from "@/lib/pricing";
import { createAdvertiserAccount, openBillingPortal } from "./actions";

export const metadata: Metadata = {
  title: "Advertiser dashboard",
  description: "Build, manage, and measure NeuseCast local screen campaigns.",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

const statusCopy = {
  draft: "Draft",
  payment_pending: "Payment ready",
  submitted: "Proposal requested",
  approved: "Approved",
  scheduled: "Scheduled",
  active: "Live",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

type AdvertiserPageProps = {
  searchParams: Promise<{ welcome?: string; created?: string; error?: string }>;
};

export default async function AdvertiserPage({ searchParams }: AdvertiserPageProps) {
  const user = await currentUser();
  const params = await searchParams;
  const database = getDatabase();
  const [account] = user
    ? await database
        .select()
        .from(advertiserAccounts)
        .where(eq(advertiserAccounts.ownerClerkUserId, user.id))
        .limit(1)
    : [];

  if (!account) {
    const email = user?.primaryEmailAddress?.emailAddress ?? "";
    return (
      <main className="advertiser-onboarding">
        <section className="advertiser-onboarding-copy">
          <div className="eyebrow">Advertiser workspace</div>
          <h1>Put your business on local screens.</h1>
          <p>Create your free profile, build and preview your ad, then launch across the network for one transparent $75 monthly price.</p>
          <ul>
            <li><BadgeCheck size={17} aria-hidden="true" /> Build and preview your own creative</li>
            <li><BadgeCheck size={17} aria-hidden="true" /> 12 verified plays per screen, per day</li>
            <li><BadgeCheck size={17} aria-hidden="true" /> Launch for {NEUSECAST_MONTHLY_PRICE}/month after secure checkout</li>
          </ul>
        </section>
        <form className="advertiser-form-card" action={createAdvertiserAccount}>
          <div><span>Step 1 of 1</span><h2>Business details</h2></div>
          {params.error ? <p className="form-error">Please enter a business name and valid billing email.</p> : null}
          <label className="field"><span className="field-label">Business name</span><input name="businessName" required autoComplete="organization" /></label>
          <label className="field"><span className="field-label">Billing email</span><input name="billingEmail" type="email" required defaultValue={email} autoComplete="email" /></label>
          <label className="field"><span className="field-label">Phone</span><input name="phone" type="tel" autoComplete="tel" /></label>
          <label className="field"><span className="field-label">Website</span><input name="website" type="url" placeholder="https://" autoComplete="url" /></label>
          <button className="button button-primary" type="submit">Open advertiser dashboard <ArrowRight size={17} aria-hidden="true" /></button>
        </form>
      </main>
    );
  }

  const [campaignRows, orderRows, resultRows] = await Promise.all([
    database.select().from(campaigns).where(eq(campaigns.advertiserAccountId, account.id)).orderBy(desc(campaigns.createdAt)),
    database.select().from(campaignOrders).where(eq(campaignOrders.advertiserAccountId, account.id)).orderBy(desc(campaignOrders.createdAt)),
    database.select({ campaignId: playbackEvents.campaignId, plays: count(playbackEvents.id), screens: countDistinct(playbackEvents.screenId) }).from(playbackEvents).groupBy(playbackEvents.campaignId),
  ]);
  const latestOrderByCampaign = new Map<string, (typeof orderRows)[number]>();
  for (const order of orderRows) {
    if (!latestOrderByCampaign.has(order.campaignId)) {
      latestOrderByCampaign.set(order.campaignId, order);
    }
  }
  const activePlan = account.subscriptionStatus === "active";
  const billingNeedsAttention = ["past_due", "unpaid", "paused"].includes(account.subscriptionStatus);
  const hasBillingCustomer = Boolean(account.stripeCustomerId);
  const liveCampaigns = campaignRows.filter((campaign) => activePlan && !campaign.billingPaused && (campaign.status === "active" || campaign.status === "scheduled")).length;
  const resultsByCampaign = new Map(resultRows.map((result) => [result.campaignId, result]));
  const totalPlays = resultRows.filter((result) => campaignRows.some((campaign) => campaign.id === result.campaignId)).reduce((sum, result) => sum + result.plays, 0);

  return (
    <main className="advertiser-dashboard">
      <header className="advertiser-dashboard-header">
        <div><div className="eyebrow">{account.businessName} · {NEUSECAST_MONTHLY_PRICE}/month · {activePlan ? "Active plan" : billingNeedsAttention ? "Billing attention needed" : "Plan not active"}</div><h1>Your local campaigns.</h1><p>Build creative, manage live campaigns, and follow verified screen plays from one place.</p></div>
        <div className="advertiser-header-actions">
          {hasBillingCustomer ? <form action={openBillingPortal}><button className="button button-secondary" type="submit"><CircleDollarSign size={17} aria-hidden="true" /> Manage billing</button></form> : null}
          {!billingNeedsAttention ? <Link className="button button-primary" href="/advertiser/new"><Plus size={17} aria-hidden="true" /> Build new campaign</Link> : null}
        </div>
      </header>

      {params.welcome ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your advertiser account is ready.</strong> Design and preview your first campaign, then launch it for $75/month.</span></div> : null}
      {params.created ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your new campaign is queued.</strong> It is included with your active plan and is now waiting for creative review.</span></div> : null}
      {params.error === "billing-unavailable" ? <div className="portal-notice portal-notice-error"><Clock3 size={18} aria-hidden="true" /><span><strong>Billing management is not available yet.</strong> Complete your first checkout, then try again.</span></div> : null}
      {billingNeedsAttention || params.error === "billing-past-due" ? <div className="portal-notice portal-notice-error"><Clock3 size={18} aria-hidden="true" /><span><strong>Your subscription needs attention.</strong> Campaign broadcasting and creative changes are paused until you update payment details in Manage billing.</span>{hasBillingCustomer ? <form action={openBillingPortal}><button className="button button-secondary button-small" type="submit">Manage billing</button></form> : null}</div> : null}
      {params.error === "subscription-required" ? <div className="portal-notice portal-notice-error"><Clock3 size={18} aria-hidden="true" /><span><strong>An active plan is required to submit creative changes.</strong> Complete your $75 monthly checkout first.</span></div> : null}

      <section className="advertiser-metrics" aria-label="Campaign summary">
        <article><span><Megaphone size={18} aria-hidden="true" /></span><div><small>Campaigns</small><strong>{campaignRows.length}</strong></div></article>
        <article><span><Target size={18} aria-hidden="true" /></span><div><small>Live or scheduled</small><strong>{liveCampaigns}</strong></div></article>
        <article><span><BarChart3 size={18} aria-hidden="true" /></span><div><small>Verified plays</small><strong>{totalPlays.toLocaleString()}</strong></div></article>
      </section>

      <section className="advertiser-campaign-section">
        <div className="section-title-row"><div><span>Campaign workspace</span><h2>Creative, status, and results</h2></div><p>One $75/month plan includes every campaign and every active screen. New paid creative queues for the following broadcast day.</p></div>
        {campaignRows.length === 0 ? (
          <div className="advertiser-empty-state"><span><Megaphone size={25} aria-hidden="true" /></span><h3>Your first local campaign starts here.</h3><p>Build the ad, preview it, and subscribe in one sitting. No proposal, sales call, or waiting period required.</p><Link className="button button-primary" href="/advertiser/new">Build your first campaign <ArrowRight size={17} aria-hidden="true" /></Link></div>
        ) : (
          <div className="advertiser-campaign-list">
            {campaignRows.map((campaign) => {
              const order = latestOrderByCampaign.get(campaign.id);
              const canPay = (order?.status === "pending" || order?.status === "failed")
                && order.amountCents > 0
                && !order.stripePaymentIntentId
                && !activePlan
                && !billingNeedsAttention;
              const results = resultsByCampaign.get(campaign.id);
              const subscriptionCopy = activePlan
                ? "Included in active $75 plan"
                : billingNeedsAttention || campaign.billingPaused
                  ? "Billing attention needed"
                : order?.amountCents
                ? `${currency.format(order.amountCents / 100)}/month`
                  : "$75/month plan";
              const campaignState = billingNeedsAttention || campaign.billingPaused
                ? "Billing hold"
                : activePlan
                  ? "Included in plan"
                : order?.status === "failed" && order.stripePaymentIntentId
                  ? "Payment issue"
                  : campaign.status === "scheduled" || campaign.status === "active"
                    ? "Awaiting review"
                    : "Draft";
              return (
                <article className="advertiser-campaign-row" key={campaign.id}>
                  <div className="campaign-row-main"><span className={`status-badge status-${campaign.status}`}><span className="status-dot" aria-hidden="true" />{statusCopy[campaign.status]}</span><h3>{campaign.name}</h3><p>{campaign.objective}</p></div>
                  <dl><div><dt><CalendarRange size={14} aria-hidden="true" /> Broadcast</dt><dd>{billingNeedsAttention || campaign.billingPaused ? "On billing hold" : campaign.startsAt ? `From ${date.format(campaign.startsAt)}` : "Starts after checkout"}</dd></div><div><dt><BarChart3 size={14} aria-hidden="true" /> Results</dt><dd>{results ? `${results.plays.toLocaleString()} plays · ${results.screens} screens` : "Awaiting first verified play"}</dd></div><div><dt><CircleDollarSign size={14} aria-hidden="true" /> Subscription</dt><dd>{subscriptionCopy}</dd></div></dl>
                  <div className="campaign-row-action">{canPay && order ? <CheckoutButton orderId={order.id} /> : <>{activePlan && !campaign.billingPaused ? <Link className="button button-secondary button-small" href={`/advertiser/campaign/${campaign.id}`}><Edit3 size={15} aria-hidden="true" /> Edit</Link> : null}{activePlan && !campaign.billingPaused ? <span className="paid-label"><BadgeCheck size={16} aria-hidden="true" /> {campaignState}</span> : <span className="review-label"><Clock3 size={16} aria-hidden="true" /> {campaignState}</span>}</>}</div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
