import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { count, countDistinct, desc, eq } from "drizzle-orm";
import { ArrowRight, BadgeCheck, BarChart3, CalendarRange, CircleDollarSign, Clock3, Edit3, Megaphone, Plus, Target } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaignOrders, campaigns, playbackEvents } from "@/lib/db/schema";
import { NEUSECAST_MONTHLY_PRICE } from "@/lib/pricing";
import { createAdvertiserAccount } from "./actions";

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
          <h1>Let’s set up your business profile.</h1>
          <p>We’ll use these details for campaign review, receipts, and billing. Creating your profile is free; campaigns are a transparent $75 per month.</p>
          <ul>
            <li><BadgeCheck size={17} aria-hidden="true" /> Build and preview your own creative</li>
            <li><BadgeCheck size={17} aria-hidden="true" /> Run on every active NeuseCast screen</li>
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
  const latestOrderByCampaign = new Map(orderRows.map((order) => [order.campaignId, order]));
  const liveCampaigns = campaignRows.filter((campaign) => campaign.status === "active" || campaign.status === "scheduled").length;
  const resultsByCampaign = new Map(resultRows.map((result) => [result.campaignId, result]));
  const totalPlays = resultRows.filter((result) => campaignRows.some((campaign) => campaign.id === result.campaignId)).reduce((sum, result) => sum + result.plays, 0);

  return (
    <main className="advertiser-dashboard">
      <header className="advertiser-dashboard-header">
        <div><div className="eyebrow">{account.businessName} · {NEUSECAST_MONTHLY_PRICE}/month</div><h1>Your local campaigns.</h1><p>Build creative, manage live campaigns, and follow verified screen plays from one place.</p></div>
        <Link className="button button-primary" href="/advertiser/new"><Plus size={17} aria-hidden="true" /> Build new campaign</Link>
      </header>

      {params.welcome ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your advertiser account is ready.</strong> Design and preview your first campaign, then launch it for $75/month.</span></div> : null}
      {params.created ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your new campaign is queued.</strong> It is included with your active plan and is now waiting for creative review.</span></div> : null}

      <section className="advertiser-metrics" aria-label="Campaign summary">
        <article><span><Megaphone size={18} aria-hidden="true" /></span><div><small>Campaigns</small><strong>{campaignRows.length}</strong></div></article>
        <article><span><Target size={18} aria-hidden="true" /></span><div><small>Live or scheduled</small><strong>{liveCampaigns}</strong></div></article>
        <article><span><BarChart3 size={18} aria-hidden="true" /></span><div><small>Verified plays</small><strong>{totalPlays.toLocaleString()}</strong></div></article>
      </section>

      <section className="advertiser-campaign-section">
        <div className="section-title-row"><div><span>Campaign workspace</span><h2>Creative, status, and results</h2></div><p>Every campaign is $75/month and includes all active screens. Paid creative queues for the following broadcast day.</p></div>
        {campaignRows.length === 0 ? (
          <div className="advertiser-empty-state"><span><Megaphone size={25} aria-hidden="true" /></span><h3>Your first local campaign starts here.</h3><p>Build the ad, preview it, and subscribe in one sitting. No proposal, sales call, or waiting period required.</p><Link className="button button-primary" href="/advertiser/new">Build your first campaign <ArrowRight size={17} aria-hidden="true" /></Link></div>
        ) : (
          <div className="advertiser-campaign-list">
            {campaignRows.map((campaign) => {
              const order = latestOrderByCampaign.get(campaign.id);
              const canPay = order?.status === "pending" && order.amountCents > 0;
              const results = resultsByCampaign.get(campaign.id);
              return (
                <article className="advertiser-campaign-row" key={campaign.id}>
                  <div className="campaign-row-main"><span className={`status-badge status-${campaign.status}`}><span className="status-dot" aria-hidden="true" />{statusCopy[campaign.status]}</span><h3>{campaign.name}</h3><p>{campaign.objective}</p></div>
                  <dl><div><dt><CalendarRange size={14} aria-hidden="true" /> Broadcast</dt><dd>{campaign.startsAt ? `From ${date.format(campaign.startsAt)}` : "Starts after checkout"}</dd></div><div><dt><BarChart3 size={14} aria-hidden="true" /> Results</dt><dd>{results ? `${results.plays.toLocaleString()} plays · ${results.screens} screens` : "Awaiting first verified play"}</dd></div><div><dt><CircleDollarSign size={14} aria-hidden="true" /> Subscription</dt><dd>{order ? `${currency.format(order.amountCents / 100)}/month` : "$75/month"}</dd></div></dl>
                  <div className="campaign-row-action">{canPay && order ? <CheckoutButton orderId={order.id} /> : <><Link className="button button-secondary button-small" href={`/advertiser/campaign/${campaign.id}`}><Edit3 size={15} aria-hidden="true" /> Edit</Link>{order?.status === "paid" ? <span className="paid-label"><BadgeCheck size={16} aria-hidden="true" /> Subscribed</span> : <span className="review-label"><Clock3 size={16} aria-hidden="true" /> Draft</span>}</>}</div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
