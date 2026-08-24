"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createCampaignCheckout } from "@/lib/billing";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, appUsers, campaignOrders, campaignScreens, campaigns, creatives, screens } from "@/lib/db/schema";
import { NEUSECAST_PLAN } from "@/lib/pricing";

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
  await database.update(campaigns).set({ status: "scheduled", startsAt: nextBroadcastMorning(), endsAt: null, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
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
    .select({ id: advertiserAccounts.id, businessName: advertiserAccounts.businessName })
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
    .select({ id: advertiserAccounts.id, businessName: advertiserAccounts.businessName })
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

  const [activeSubscription] = await database
    .select({ id: campaignOrders.id })
    .from(campaignOrders)
    .where(and(eq(campaignOrders.advertiserAccountId, account.id), eq(campaignOrders.status, "paid")))
    .limit(1);

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

  if (activeSubscription) {
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
    .select({ id: campaigns.id, advertiserAccountId: campaigns.advertiserAccountId, businessName: advertiserAccounts.businessName })
    .from(campaigns)
    .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
    .where(and(eq(campaigns.id, campaignId), eq(advertiserAccounts.ownerClerkUserId, user.id)))
    .limit(1);

  if (!ownedCampaign || !name || !headline || !body || !callToAction) redirect(`/advertiser/campaign/${campaignId}?error=creative`);

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
