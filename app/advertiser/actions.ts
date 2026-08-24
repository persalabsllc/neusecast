"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createCampaignCheckout, hasActiveAdvertiserSubscription, requiresAdvertiserBillingAction } from "@/lib/billing";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, appUsers, campaignOrders, campaignScreens, campaigns, creatives, screens } from "@/lib/db/schema";
import { NEUSECAST_PLAN } from "@/lib/pricing";
import { getApplicationUrl, getStripe } from "@/lib/stripe";

function textValue(formData: FormData, key: string, maximumLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function nextBroadcastMorning() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  date.setUTCHours(10, 0, 0, 0);
  return date;
}

async function scheduleIncludedCampaign(campaignId: string) {
  const database = getDatabase();
  await database.update(campaigns).set({ status: "scheduled", startsAt: nextBroadcastMorning(), endsAt: null, billingPaused: false, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  await database.update(creatives).set({ status: "review", updatedAt: new Date() }).where(eq(creatives.campaignId, campaignId));
  const activeScreens = await database.select({ id: screens.id }).from(screens).where(eq(screens.active, true));
  if (activeScreens.length > 0) {
    await database.insert(campaignScreens).values(activeScreens.map((screen) => ({ campaignId, screenId: screen.id, priceCents: 0, scheduledPlaysPerDay: 12 }))).onConflictDoNothing();
  }
}

async function requireAdvertiserUser() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();

  if (!user || !email) redirect("/sign-in?redirect_url=/advertiser");
  return { user, email };
}

async function redirectToBillingPortal(stripeCustomerId: string | null) {
  if (!stripeCustomerId) redirect("/advertiser?error=billing-unavailable");
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${getApplicationUrl()}/advertiser`,
  });
  redirect(session.url);
}

export async function createAdvertiserAccount(formData: FormData) {
  const { user, email } = await requireAdvertiserUser();
  const businessName = textValue(formData, "businessName", 200);
  const billingEmail = textValue(formData, "billingEmail", 320).toLowerCase();
  const phone = textValue(formData, "phone", 40);
  const website = textValue(formData, "website", 500);

  if (!businessName || !billingEmail || !billingEmail.includes("@")) {
    redirect("/advertiser?error=business-details");
  }

  const database = getDatabase();
  await database
    .insert(appUsers)
    .values({
      clerkUserId: user.id,
      email,
      displayName: user.fullName ?? businessName,
      role: "advertiser",
    })
    .onConflictDoNothing();

  const [existingAccount] = await database
    .select({ id: advertiserAccounts.id })
    .from(advertiserAccounts)
    .where(eq(advertiserAccounts.ownerClerkUserId, user.id))
    .limit(1);

  if (!existingAccount) {
    await database.insert(advertiserAccounts).values({
      ownerClerkUserId: user.id,
      businessName,
      billingEmail,
      phone: phone || null,
      website: website || null,
    });
  }

  redirect("/advertiser?welcome=1");
}

export async function createCampaignAndCheckout(formData: FormData) {
  const { user } = await requireAdvertiserUser();
  const database = getDatabase();
  const [account] = await database
    .select({
      id: advertiserAccounts.id,
      businessName: advertiserAccounts.businessName,
      stripeCustomerId: advertiserAccounts.stripeCustomerId,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
    })
    .from(advertiserAccounts)
    .where(
      and(
        eq(advertiserAccounts.ownerClerkUserId, user.id),
        eq(advertiserAccounts.active, true),
      ),
    )
    .limit(1);

  if (!account) redirect("/advertiser?error=account-required");

  const name = textValue(formData, "name", 180);
  const headline = textValue(formData, "headline", 120);
  const body = textValue(formData, "body", 500);
  const callToAction = textValue(formData, "callToAction", 120);
  const eyebrow = textValue(formData, "eyebrow", 50) || "Local business";
  const theme = textValue(formData, "theme", 20) || "aqua";

  if (!name || !headline || !body || !callToAction) redirect("/advertiser/new?error=campaign-details");

  if (requiresAdvertiserBillingAction(account.subscriptionStatus)) {
    await redirectToBillingPortal(account.stripeCustomerId);
  }

  const [pendingOrder] = await database
    .select({ id: campaignOrders.id, campaignId: campaignOrders.campaignId })
    .from(campaignOrders)
    .where(and(
      eq(campaignOrders.advertiserAccountId, account.id),
      inArray(campaignOrders.status, ["pending", "failed"]),
      isNull(campaignOrders.stripePaymentIntentId),
    ))
    .orderBy(desc(campaignOrders.createdAt))
    .limit(1);

  if (!hasActiveAdvertiserSubscription(account.subscriptionStatus) && pendingOrder) {
    await database.update(campaigns).set({
      name,
      objective: body,
      status: "payment_pending",
      targeting: { markets: ["Eastern Carolina"], notes: "All active NeuseCast screens" },
      subtotalCents: NEUSECAST_PLAN.amountCents,
      totalCents: NEUSECAST_PLAN.amountCents,
      currency: NEUSECAST_PLAN.currency,
      updatedAt: new Date(),
    }).where(and(eq(campaigns.id, pendingOrder.campaignId), eq(campaigns.advertiserAccountId, account.id)));

    const [draftCreative] = await database
      .select({ id: creatives.id })
      .from(creatives)
      .where(and(eq(creatives.campaignId, pendingOrder.campaignId), eq(creatives.status, "draft")))
      .orderBy(desc(creatives.createdAt))
      .limit(1);

    if (draftCreative) {
      await database.update(creatives).set({
        name,
        headline,
        body,
        callToAction,
        metadata: { eyebrow, theme, sponsor: account.businessName },
        updatedAt: new Date(),
      }).where(eq(creatives.id, draftCreative.id));
    } else {
      await database.insert(creatives).values({
        campaignId: pendingOrder.campaignId,
        createdByClerkUserId: user.id,
        type: "generated_slide",
        status: "draft",
        name,
        headline,
        body,
        callToAction,
        metadata: { eyebrow, theme, sponsor: account.businessName },
      });
    }

    redirect(await createCampaignCheckout(pendingOrder.id, user.id));
  }

  const [campaign] = await database.insert(campaigns).values({
    advertiserAccountId: account.id,
    createdByClerkUserId: user.id,
    name,
    objective: body,
    status: "draft",
    targeting: { markets: ["Eastern Carolina"], notes: "All active NeuseCast screens" },
    subtotalCents: NEUSECAST_PLAN.amountCents,
    totalCents: NEUSECAST_PLAN.amountCents,
    currency: NEUSECAST_PLAN.currency,
  }).returning({ id: campaigns.id });

  await database.insert(creatives).values({
    campaignId: campaign.id,
    createdByClerkUserId: user.id,
    type: "generated_slide",
    status: "draft",
    name,
    headline,
    body,
    callToAction,
    metadata: { eyebrow, theme, sponsor: account.businessName },
  });

  if (hasActiveAdvertiserSubscription(account.subscriptionStatus)) {
    await scheduleIncludedCampaign(campaign.id);
    redirect("/advertiser?created=1");
  }

  const [order] = await database.insert(campaignOrders).values({
    campaignId: campaign.id,
    advertiserAccountId: account.id,
    amountCents: NEUSECAST_PLAN.amountCents,
    currency: NEUSECAST_PLAN.currency,
  }).returning({ id: campaignOrders.id });

  const checkoutUrl = await createCampaignCheckout(order.id, user.id);
  redirect(checkoutUrl);
}

export async function openBillingPortal() {
  const { user } = await requireAdvertiserUser();
  const [account] = await getDatabase()
    .select({ stripeCustomerId: advertiserAccounts.stripeCustomerId })
    .from(advertiserAccounts)
    .where(and(
      eq(advertiserAccounts.ownerClerkUserId, user.id),
      eq(advertiserAccounts.active, true),
    ))
    .limit(1);

  await redirectToBillingPortal(account?.stripeCustomerId ?? null);
}

export async function submitCampaignRevision(formData: FormData) {
  const { user } = await requireAdvertiserUser();
  const campaignId = textValue(formData, "campaignId", 36);
  const name = textValue(formData, "name", 180);
  const headline = textValue(formData, "headline", 120);
  const body = textValue(formData, "body", 500);
  const callToAction = textValue(formData, "callToAction", 120);
  const eyebrow = textValue(formData, "eyebrow", 50) || "Local business";
  const theme = textValue(formData, "theme", 20) || "aqua";
  const database = getDatabase();

  const [ownedCampaign] = await database
    .select({
      id: campaigns.id,
      advertiserAccountId: campaigns.advertiserAccountId,
      businessName: advertiserAccounts.businessName,
      billingPaused: campaigns.billingPaused,
      stripeCustomerId: advertiserAccounts.stripeCustomerId,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
    })
    .from(campaigns)
    .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
    .where(and(eq(campaigns.id, campaignId), eq(advertiserAccounts.ownerClerkUserId, user.id)))
    .limit(1);

  if (!ownedCampaign || !name || !headline || !body || !callToAction) redirect(`/advertiser/campaign/${campaignId}?error=creative`);
  if (requiresAdvertiserBillingAction(ownedCampaign.subscriptionStatus) || ownedCampaign.billingPaused) {
    await redirectToBillingPortal(ownedCampaign.stripeCustomerId);
  }
  if (!hasActiveAdvertiserSubscription(ownedCampaign.subscriptionStatus)) {
    redirect("/advertiser?error=subscription-required");
  }

  await database.update(campaigns).set({ name, objective: body, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  await database.insert(creatives).values({
    campaignId,
    createdByClerkUserId: user.id,
    type: "generated_slide",
    status: "review",
    name,
    headline,
    body,
    callToAction,
    metadata: { eyebrow, theme, sponsor: ownedCampaign.businessName, revision: true },
  });

  redirect(`/advertiser/campaign/${campaignId}?updated=1`);
}
