import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { count, countDistinct, desc, eq } from "drizzle-orm";
import { ArrowRight, BadgeCheck, BarChart3, CalendarRange, CircleDollarSign, Clock3, Edit3, Megaphone, MonitorPlay, Plus, Radio, Target } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, advertiserRadioBriefs, campaignOrders, campaigns, playbackEvents } from "@/lib/db/schema";
import { getMediaPlan, MEDIA_PLANS } from "@/lib/pricing";
import { createAdvertiserAccount, openBillingPortal } from "./actions";

export const metadata: Metadata = {
  title: "Advertiser dashboard",
  description: "Build, manage, and measure NeuseCast local screen campaigns.",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const monthlyCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
  searchParams: Promise<{ welcome?: string; created?: string; error?: string; setup?: string; plan?: string }>;
};

const radioBriefStatusCopy = {
  pending_payment: "Saved · awaiting payment",
  submitted: "Submitted for production",
  in_production: "In production",
  approved: "Approved",
  active: "Active on Captain 97.1",
  retired: "Retired",
} as const;

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
    const requestedPlan = getMediaPlan(params.plan) ?? MEDIA_PLANS.screens;
    return (
      <main className="advertiser-onboarding">
        <section className="advertiser-onboarding-copy">
          <div className="eyebrow">Advertiser workspace</div>
          <h1>Put your business on local screens.</h1>
          <p>Create your free profile, build and preview your ad, then choose screen-only reach or pair every screen with Captain 97.1 sponsor acknowledgments.</p>
          <ul>
            <li><BadgeCheck size={17} aria-hidden="true" /> Build and preview your own creative</li>
            <li><BadgeCheck size={17} aria-hidden="true" /> 12 verified plays per screen, per day</li>
            <li><BadgeCheck size={17} aria-hidden="true" /> Plans from $75/month, all month-to-month</li>
          </ul>
        </section>
        <form className="advertiser-form-card" action={createAdvertiserAccount}>
          <div><span>Business profile</span><h2>Continue with {requestedPlan.name}</h2></div>
          <input type="hidden" name="planKey" value={requestedPlan.key} />
          {params.error ? <p className="form-error">{params.error === "account-conflict" ? "This verified email is connected to another login. Sign out and use the original account, or contact NeuseCast for help." : "Please enter a business name and valid billing email."}</p> : null}
          <label className="field"><span className="field-label">Business name</span><input name="businessName" required autoComplete="organization" /></label>
          <label className="field"><span className="field-label">Billing email</span><input name="billingEmail" type="email" required defaultValue={email} autoComplete="email" /></label>
          <label className="field"><span className="field-label">Phone</span><input name="phone" type="tel" autoComplete="tel" /></label>
          <label className="field"><span className="field-label">Website</span><input name="website" type="url" placeholder="https://" autoComplete="url" /></label>
          <button className="button button-primary" type="submit">Continue to campaign builder <ArrowRight size={17} aria-hidden="true" /></button>
        </form>
      </main>
    );
  }

  const [campaignRows, orderRows, resultRows, radioBriefRows] = await Promise.all([
    database.select().from(campaigns).where(eq(campaigns.advertiserAccountId, account.id)).orderBy(desc(campaigns.createdAt)),
    database.select().from(campaignOrders).where(eq(campaignOrders.advertiserAccountId, account.id)).orderBy(desc(campaignOrders.createdAt)),
    database.select({ campaignId: playbackEvents.campaignId, plays: count(playbackEvents.id), screens: countDistinct(playbackEvents.screenId) }).from(playbackEvents).groupBy(playbackEvents.campaignId),
    database.select({ status: advertiserRadioBriefs.status }).from(advertiserRadioBriefs).where(eq(advertiserRadioBriefs.advertiserAccountId, account.id)).limit(1),
  ]);
  const latestOrderByCampaign = new Map<string, (typeof orderRows)[number]>();
  for (const order of orderRows) {
    if (!latestOrderByCampaign.has(order.campaignId)) {
      latestOrderByCampaign.set(order.campaignId, order);
    }
  }
  const activePlan = account.subscriptionStatus === "active";
  const currentPlan = getMediaPlan(account.subscriptionPlanKey) ?? getMediaPlan(orderRows[0]?.planKey) ?? MEDIA_PLANS.screens;
  const currentPlanPrice = monthlyCurrency.format(currentPlan.amountCents / 100);
  const radioBrief = radioBriefRows[0];
  const includesRadio = currentPlan.radioAcknowledgmentsPerMonth > 0;
  const billingNeedsAttention = ["past_due", "unpaid", "paused"].includes(account.subscriptionStatus);
  const hasBillingCustomer = Boolean(account.stripeCustomerId);
  const liveCampaigns = campaignRows.filter((campaign) => activePlan && !campaign.billingPaused && (campaign.status === "active" || campaign.status === "scheduled")).length;
  const resultsByCampaign = new Map(resultRows.map((result) => [result.campaignId, result]));
  const totalPlays = resultRows.filter((result) => campaignRows.some((campaign) => campaign.id === result.campaignId)).reduce((sum, result) => sum + result.plays, 0);

  return (
    <main className="advertiser-dashboard">
      <header className="advertiser-dashboard-header">
        <div><div className="eyebrow">{account.businessName} · {currentPlan.name} · {activePlan ? "Active plan" : billingNeedsAttention ? "Billing attention needed" : "Plan not active"}</div><h1>Your local campaigns.</h1><p>Build creative, manage live campaigns, and follow verified screen plays from one place.</p></div>
        <div className="advertiser-header-actions">
          {hasBillingCustomer ? <form action={openBillingPortal}><button className="button button-secondary" type="submit"><CircleDollarSign size={17} aria-hidden="true" /> Manage billing</button></form> : null}
          {!billingNeedsAttention ? <Link className="button button-primary" href={`/advertiser/new?plan=${currentPlan.key}`}><Plus size={17} aria-hidden="true" /> Build new campaign</Link> : null}
        </div>
      </header>

      {params.welcome ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your advertiser account is ready.</strong> Design and preview your first campaign, then choose the month-to-month media plan that fits.</span></div> : null}
      {params.created ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your new campaign is queued.</strong> It is included with your active plan and is now waiting for creative review.</span></div> : null}
      {params.error === "billing-unavailable" ? <div className="portal-notice portal-notice-error"><Clock3 size={18} aria-hidden="true" /><span><strong>Billing management is not available yet.</strong> Complete your first checkout, then try again.</span></div> : null}
      {params.error === "checkout-processing" ? <div className="portal-notice"><Clock3 size={18} aria-hidden="true" /><span><strong>Your completed checkout is still processing.</strong> Stripe has the payment; refresh this dashboard in a moment while the signed confirmation activates your plan.</span></div> : null}
      {billingNeedsAttention || params.error === "billing-past-due" ? <div className="portal-notice portal-notice-error"><Clock3 size={18} aria-hidden="true" /><span><strong>Your subscription needs attention.</strong> Campaign broadcasting and creative changes are paused until you update payment details in Manage billing.</span>{hasBillingCustomer ? <form action={openBillingPortal}><button className="button button-secondary button-small" type="submit">Manage billing</button></form> : null}</div> : null}
      {params.error === "subscription-required" ? <div className="portal-notice portal-notice-error"><Clock3 size={18} aria-hidden="true" /><span><strong>An active plan is required to submit creative changes.</strong> Complete your {currentPlanPrice} monthly checkout first.</span></div> : null}

      <section className="advertiser-plan-overview" aria-label="Current media plan">
        <article className="advertiser-plan-summary">
          <span><MonitorPlay size={20} aria-hidden="true" /></span>
          <div><small>{activePlan ? "Current plan" : "Selected plan"}</small><strong>{currentPlan.name}</strong><p>{currentPlanPrice}/month · month-to-month · every active NeuseCast screen</p></div>
          <em>{activePlan ? "Active" : "Checkout pending"}</em>
        </article>
        {includesRadio ? (
          <article className="advertiser-radio-summary">
            <span><Radio size={20} aria-hidden="true" /></span>
            <div><small>Captain 97.1 underwriting</small><strong>{currentPlan.radioAcknowledgmentsPerMonth} acknowledgments/month</strong><p>{radioBrief ? radioBriefStatusCopy[radioBrief.status] : "Underwriting brief needed with your campaign"}</p></div>
            <em className={radioBrief ? "is-ready" : "is-needed"}>{radioBrief ? radioBriefStatusCopy[radioBrief.status] : "Brief needed"}</em>
          </article>
        ) : null}
      </section>

      <section className="advertiser-metrics" aria-label="Campaign summary">
        <article><span><Megaphone size={18} aria-hidden="true" /></span><div><small>Campaigns</small><strong>{campaignRows.length}</strong></div></article>
        <article><span><Target size={18} aria-hidden="true" /></span><div><small>Live or scheduled</small><strong>{liveCampaigns}</strong></div></article>
        <article><span><BarChart3 size={18} aria-hidden="true" /></span><div><small>Verified plays</small><strong>{totalPlays.toLocaleString()}</strong></div></article>
      </section>

      <section className="advertiser-campaign-section">
        <div className="section-title-row"><div><span>Campaign workspace</span><h2>Creative, status, and results</h2></div><p>Your {currentPlan.name} plan includes every campaign and every active screen. New paid creative queues for the following broadcast day.</p></div>
        {campaignRows.length === 0 ? (
          <div className="advertiser-empty-state"><span><Megaphone size={25} aria-hidden="true" /></span><h3>Your first local campaign starts here.</h3><p>Build the ad, preview it, and subscribe in one sitting. No proposal, sales call, or waiting period required.</p><Link className="button button-primary" href={`/advertiser/new?plan=${currentPlan.key}`}>Build your first campaign <ArrowRight size={17} aria-hidden="true" /></Link></div>
        ) : (
          <div className="advertiser-campaign-list">
            {campaignRows.map((campaign) => {
              const order = latestOrderByCampaign.get(campaign.id);
              const campaignPlan = getMediaPlan(order?.planKey) ?? currentPlan;
              const canPay = (order?.status === "pending" || order?.status === "failed")
                && order.amountCents > 0
                && !order.stripePaymentIntentId
                && !activePlan
                && !billingNeedsAttention;
              const results = resultsByCampaign.get(campaign.id);
              const subscriptionCopy = activePlan
                ? `Included in active ${currentPlan.name} plan`
                : billingNeedsAttention || campaign.billingPaused
                  ? "Billing attention needed"
                : order?.amountCents
                ? `${currency.format(order.amountCents / 100)}/month`
                  : `${monthlyCurrency.format(campaignPlan.amountCents / 100)}/month plan`;
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
                  <div className="campaign-row-action">{canPay && order ? <CheckoutButton orderId={order.id} planName={campaignPlan.name} amountCents={order.amountCents} /> : <>{activePlan && !campaign.billingPaused ? <Link className="button button-secondary button-small" href={`/advertiser/campaign/${campaign.id}`}><Edit3 size={15} aria-hidden="true" /> Edit</Link> : null}{activePlan && !campaign.billingPaused ? <span className="paid-label"><BadgeCheck size={16} aria-hidden="true" /> {campaignState}</span> : <span className="review-label"><Clock3 size={16} aria-hidden="true" /> {campaignState}</span>}</>}</div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
