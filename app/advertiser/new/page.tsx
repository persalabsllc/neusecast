import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, MonitorPlay, ShieldCheck } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CampaignBuilder } from "@/components/campaign-builder";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaignOrders } from "@/lib/db/schema";
import { createCampaignAndCheckout } from "../actions";

export const metadata: Metadata = {
  title: "Build your campaign · $75/month",
  description: "Create and preview a NeuseCast all-screen campaign, then launch securely for $75 per month.",
};

type NewCampaignPageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewCampaignPage({ searchParams }: NewCampaignPageProps) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/sign-in?redirect_url=/advertiser/new");
  const database = getDatabase();
  const [account] = await database.select({ id: advertiserAccounts.id }).from(advertiserAccounts).where(eq(advertiserAccounts.ownerClerkUserId, user.id)).limit(1);
  if (!account) redirect("/advertiser?setup=business");
  const [subscription] = await database.select({ id: campaignOrders.id }).from(campaignOrders).where(and(eq(campaignOrders.advertiserAccountId, account.id), eq(campaignOrders.status, "paid"))).limit(1);
  return (
    <main className="campaign-studio-page">
      <Link className="back-link" href="/advertiser"><ArrowLeft size={16} aria-hidden="true" /> Advertiser dashboard</Link>
      <header className="campaign-studio-header">
        <div><div className="eyebrow">One simple plan</div><h1>Build it. Preview it. Put it everywhere.</h1><p>Create your message now, see exactly how it will look, and continue directly to secure checkout while your campaign is ready to go.</p></div>
        <aside className="campaign-plan-card"><span>{subscription ? "Plan active" : "$75"} <small>{subscription ? "· no additional charge" : "/ month"}</small></span><ul><li><Check size={15} aria-hidden="true" /> Every active NeuseCast screen</li><li><MonitorPlay size={15} aria-hidden="true" /> Screen-ready creative included</li><li><ShieldCheck size={15} aria-hidden="true" /> Next-day queue with human review</li></ul></aside>
      </header>
      {params.error ? <p className="form-error campaign-studio-error">Please complete every creative field before continuing.</p> : null}
      <CampaignBuilder action={createCampaignAndCheckout} mode={subscription ? "included" : "checkout"} />
    </main>
  );
}
