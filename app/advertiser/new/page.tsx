import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ArrowLeft, Check, MonitorPlay, ShieldCheck } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CampaignBuilder } from "@/components/campaign-builder";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts } from "@/lib/db/schema";
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
  const [account] = await database
    .select({ id: advertiserAccounts.id, subscriptionStatus: advertiserAccounts.subscriptionStatus })
    .from(advertiserAccounts)
    .where(eq(advertiserAccounts.ownerClerkUserId, user.id))
    .limit(1);
  if (!account) redirect("/advertiser?setup=business");
  const hasActiveSubscription = account.subscriptionStatus === "active";
  const submissionId = randomUUID();
  return (
    <main className="campaign-studio-page">
      <Link className="back-link" href="/advertiser"><ArrowLeft size={16} aria-hidden="true" /> Advertiser dashboard</Link>
      <header className="campaign-studio-header">
        <div><div className="eyebrow">One simple plan</div><h1>Build it. Preview it. Put it everywhere.</h1><p>Create your message now, see exactly how it will look, and continue directly to secure checkout while your campaign is ready to go.</p></div>
        <aside className="campaign-plan-card"><span>{hasActiveSubscription ? "Plan active" : "$75"} <small>{hasActiveSubscription ? "· no additional charge" : "/ month"}</small></span><ul><li><Check size={15} aria-hidden="true" /> Every active NeuseCast screen</li><li><MonitorPlay size={15} aria-hidden="true" /> 12 verified plays per screen, per day</li><li><ShieldCheck size={15} aria-hidden="true" /> Screen-ready creative and review included</li></ul></aside>
      </header>
      {params.error ? <p className="form-error campaign-studio-error">{params.error === "terms-required" ? "Please accept the service and advertising terms before checkout." : "Please complete every creative field before continuing."}</p> : null}
      <CampaignBuilder action={createCampaignAndCheckout} mode={hasActiveSubscription ? "included" : "checkout"} submissionId={submissionId} />
    </main>
  );
}
