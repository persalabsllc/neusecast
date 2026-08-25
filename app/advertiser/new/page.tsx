import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { ArrowLeft } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CampaignBuilder } from "@/components/campaign-builder";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, advertiserRadioBriefs } from "@/lib/db/schema";
import { getMediaPlan, isMediaPlanKey, MEDIA_PLANS } from "@/lib/pricing";
import { createCampaignAndCheckout } from "../actions";

export const metadata: Metadata = {
  title: "Build your NeuseCast campaign",
  description: "Create and preview a NeuseCast campaign, choose your media plan, and launch securely.",
};

type NewCampaignPageProps = { searchParams: Promise<{ error?: string; plan?: string }> };

export default async function NewCampaignPage({ searchParams }: NewCampaignPageProps) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/sign-in?redirect_url=/advertiser/new");
  const database = getDatabase();
  const [account] = await database
    .select({
      id: advertiserAccounts.id,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
      subscriptionPlanKey: advertiserAccounts.subscriptionPlanKey,
    })
    .from(advertiserAccounts)
    .where(eq(advertiserAccounts.ownerClerkUserId, user.id))
    .limit(1);
  const requestedPlanKey = isMediaPlanKey(params.plan) ? params.plan : "screens";
  if (!account) redirect(`/advertiser?setup=business&plan=${requestedPlanKey}`);
  const hasActiveSubscription = account.subscriptionStatus === "active";
  const activePlan = getMediaPlan(account.subscriptionPlanKey);
  const initialPlan = hasActiveSubscription ? (activePlan?.key ?? "screens") : requestedPlanKey;
  const selectedPlan = MEDIA_PLANS[initialPlan];
  const [radioBrief] = await database
    .select({
      messageFocus: advertiserRadioBriefs.messageFocus,
      destination: advertiserRadioBriefs.destination,
      pronunciationNotes: advertiserRadioBriefs.pronunciationNotes,
      preferredTone: advertiserRadioBriefs.preferredTone,
    })
    .from(advertiserRadioBriefs)
    .where(eq(advertiserRadioBriefs.advertiserAccountId, account.id))
    .limit(1);
  const submissionId = randomUUID();
  return (
    <main className="campaign-studio-page">
      <Link className="back-link" href="/advertiser"><ArrowLeft size={16} aria-hidden="true" /> Advertiser dashboard</Link>
      <header className="campaign-studio-header campaign-edit-header">
        <div><div className="eyebrow">{hasActiveSubscription ? `${selectedPlan.name} · active plan` : "Three month-to-month options"}</div><h1>Build it. Preview it. Put it everywhere.</h1><p>Create your screen message, choose the reach that fits your business, and continue directly to secure checkout. Plans with Captain 97.1 include a short underwriting brief for compliant sponsor acknowledgments.</p></div>
      </header>
      {params.error ? <p className="form-error campaign-studio-error">{params.error === "terms-required" ? "Please accept the service and advertising terms before checkout." : params.error === "radio-brief" ? "Please complete the Captain 97.1 underwriting brief without promotional calls to action, prices, discounts, or comparative claims." : "Please complete every creative field before continuing."}</p> : null}
      <CampaignBuilder
        action={createCampaignAndCheckout}
        mode={hasActiveSubscription ? "included" : "checkout"}
        submissionId={submissionId}
        initialPlan={initialPlan}
        initialRadioBrief={radioBrief ? {
          messageFocus: radioBrief.messageFocus,
          destination: radioBrief.destination,
          pronunciationNotes: radioBrief.pronunciationNotes ?? undefined,
          preferredTone: radioBrief.preferredTone ?? undefined,
        } : undefined}
      />
    </main>
  );
}
