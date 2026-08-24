import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, BadgeCheck, CalendarRange, CircleDollarSign, Clock3, Megaphone, Plus, Target } from "lucide-react";
import { CheckoutButton } from "@/components/checkout-button";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaignOrders, campaigns } from "@/lib/db/schema";
import { createAdvertiserAccount } from "./actions";

export const metadata: Metadata = {
  title: "Advertiser dashboard",
  description: "Request, approve, and pay for NeuseCast local screen campaigns.",
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
  searchParams: Promise<{ welcome?: string; requested?: string; error?: string }>;
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
          <p>We’ll use these details for proposals, campaign approvals, receipts, and billing. Nothing is charged when you create the profile.</p>
          <ul>
            <li><BadgeCheck size={17} aria-hidden="true" /> Request a locally targeted campaign</li>
            <li><BadgeCheck size={17} aria-hidden="true" /> Review status and approved pricing</li>
            <li><BadgeCheck size={17} aria-hidden="true" /> Pay securely only when you are ready</li>
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

  const [campaignRows, orderRows] = await Promise.all([
    database.select().from(campaigns).where(eq(campaigns.advertiserAccountId, account.id)).orderBy(desc(campaigns.createdAt)),
    database.select().from(campaignOrders).where(eq(campaignOrders.advertiserAccountId, account.id)).orderBy(desc(campaignOrders.createdAt)),
  ]);
  const latestOrderByCampaign = new Map(orderRows.map((order) => [order.campaignId, order]));
  const payableTotal = orderRows.filter((order) => order.status === "pending").reduce((total, order) => total + order.amountCents, 0);
  const liveCampaigns = campaignRows.filter((campaign) => campaign.status === "active" || campaign.status === "scheduled").length;

  return (
    <main className="advertiser-dashboard">
      <header className="advertiser-dashboard-header">
        <div><div className="eyebrow">{account.businessName}</div><h1>Your local campaigns.</h1><p>Request placements, approve pricing, and follow every campaign from proposal to proof of play.</p></div>
        <Link className="button button-primary" href="/advertiser/new"><Plus size={17} aria-hidden="true" /> Request campaign</Link>
      </header>

      {params.welcome ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your advertiser account is ready.</strong> Start with a campaign request whenever you’re ready.</span></div> : null}
      {params.requested ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Campaign request received.</strong> We’ll prepare screen options and pricing for your review.</span></div> : null}

      <section className="advertiser-metrics" aria-label="Campaign summary">
        <article><span><Megaphone size={18} aria-hidden="true" /></span><div><small>Campaigns</small><strong>{campaignRows.length}</strong></div></article>
        <article><span><Target size={18} aria-hidden="true" /></span><div><small>Live or scheduled</small><strong>{liveCampaigns}</strong></div></article>
        <article><span><CircleDollarSign size={18} aria-hidden="true" /></span><div><small>Ready for payment</small><strong>{currency.format(payableTotal / 100)}</strong></div></article>
      </section>

      <section className="advertiser-campaign-section">
        <div className="section-title-row"><div><span>Campaign workspace</span><h2>Requests and orders</h2></div><p>Payment appears only after the NeuseCast team approves placement and pricing.</p></div>
        {campaignRows.length === 0 ? (
          <div className="advertiser-empty-state"><span><Megaphone size={25} aria-hidden="true" /></span><h3>Your first local campaign starts here.</h3><p>Tell us what you’re promoting and when you want it seen. We’ll build a clear proposal around available local screens.</p><Link className="button button-primary" href="/advertiser/new">Request your first campaign <ArrowRight size={17} aria-hidden="true" /></Link></div>
        ) : (
          <div className="advertiser-campaign-list">
            {campaignRows.map((campaign) => {
              const order = latestOrderByCampaign.get(campaign.id);
              const canPay = order?.status === "pending" && order.amountCents > 0;
              return (
                <article className="advertiser-campaign-row" key={campaign.id}>
                  <div className="campaign-row-main"><span className={`status-badge status-${campaign.status}`}><span className="status-dot" aria-hidden="true" />{statusCopy[campaign.status]}</span><h3>{campaign.name}</h3><p>{campaign.objective}</p></div>
                  <dl><div><dt><CalendarRange size={14} aria-hidden="true" /> Flight</dt><dd>{campaign.startsAt && campaign.endsAt ? `${date.format(campaign.startsAt)} – ${date.format(campaign.endsAt)}` : "Dates under review"}</dd></div><div><dt><CircleDollarSign size={14} aria-hidden="true" /> Approved total</dt><dd>{order ? currency.format(order.amountCents / 100) : "Proposal pending"}</dd></div></dl>
                  <div className="campaign-row-action">{canPay && order ? <CheckoutButton orderId={order.id} /> : order?.status === "paid" ? <span className="paid-label"><BadgeCheck size={16} aria-hidden="true" /> Paid</span> : <span className="review-label"><Clock3 size={16} aria-hidden="true" /> We’re preparing your proposal</span>}</div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
