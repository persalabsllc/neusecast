"use server";

import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";
import { advertiserAccounts, appUsers, campaignScreens, campaigns, creatives, screens } from "@/lib/db/schema";
import { localDateTimeInputInZone } from "@/lib/time-zone";

const CONTROL_TIME_ZONE = "America/New_York";
const HOUSE_ADVERTISER_USER_ID = "system:house-advertising";
const HOUSE_ADVERTISER_EMAIL = "house-advertising@neusecast.com";
const HOUSE_AD_KINDS = new Set([
  "direct_in_person",
  "direct_phone",
  "complimentary",
  "trial",
  "captain_97",
  "new_bern_websites",
  "neusecast",
  "other",
]);
const CREATIVE_THEMES = new Set(["aqua", "navy", "coral", "gold"]);

async function requireControlUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!user || !isControlRoomEmail(email)) throw new Error("Control Room authorization required.");
  return { user, email: email! };
}

function value(formData: FormData, key: string, maximumLength: number) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, maximumLength) : "";
}

function boundedInteger(formData: FormData, key: string, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value(formData, key, 8));
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

export async function createHouseAdvertisement(formData: FormData) {
  const { user, email } = await requireControlUser();
  const sponsor = value(formData, "sponsor", 200);
  const houseAdKind = value(formData, "houseAdKind", 40);
  const name = value(formData, "name", 180);
  const eyebrow = value(formData, "eyebrow", 50);
  const headline = value(formData, "headline", 120);
  const body = value(formData, "body", 500);
  const callToAction = value(formData, "callToAction", 120);
  const requestedTheme = value(formData, "theme", 20);
  const theme = CREATIVE_THEMES.has(requestedTheme) ? requestedTheme : "aqua";

  if (!sponsor || !HOUSE_AD_KINDS.has(houseAdKind) || !name || !eyebrow || !headline || !body || !callToAction) {
    redirect("/control/campaigns?houseError=details");
  }

  const now = new Date();
  const startsAtRaw = value(formData, "startsAt", 20);
  const endsAtRaw = value(formData, "endsAt", 20);
  const startsAt = startsAtRaw ? localDateTimeInputInZone(startsAtRaw, CONTROL_TIME_ZONE) : now;
  const endsAt = endsAtRaw ? localDateTimeInputInZone(endsAtRaw, CONTROL_TIME_ZONE) : null;
  if (!startsAt || (endsAtRaw && !endsAt) || (endsAt && endsAt <= startsAt)) {
    redirect("/control/campaigns?houseError=schedule");
  }

  const durationSeconds = boundedInteger(formData, "durationSeconds", 10, 30, 15);
  const playsPerDay = boundedInteger(formData, "playsPerDay", 1, 48, 12);
  const database = getDatabase();

  await database
    .insert(appUsers)
    .values({
      clerkUserId: user.id,
      email,
      displayName: user.fullName ?? "Control Room",
      role: "admin",
      status: "active",
    })
    .onConflictDoUpdate({
      target: appUsers.clerkUserId,
      set: { email, displayName: user.fullName ?? "Control Room", role: "admin", status: "active", updatedAt: now },
    });

  await database
    .insert(appUsers)
    .values({
      clerkUserId: HOUSE_ADVERTISER_USER_ID,
      email: HOUSE_ADVERTISER_EMAIL,
      displayName: "NeuseCast House Advertising",
      role: "advertiser",
      status: "active",
    })
    .onConflictDoUpdate({
      target: appUsers.clerkUserId,
      set: { displayName: "NeuseCast House Advertising", status: "active", updatedAt: now },
    });

  const [houseAccount] = await database
    .insert(advertiserAccounts)
    .values({
      ownerClerkUserId: HOUSE_ADVERTISER_USER_ID,
      businessName: "NeuseCast House Advertising",
      billingEmail: HOUSE_ADVERTISER_EMAIL,
      subscriptionStatus: "active",
      active: true,
    })
    .onConflictDoUpdate({
      target: advertiserAccounts.ownerClerkUserId,
      set: { businessName: "NeuseCast House Advertising", subscriptionStatus: "active", active: true, updatedAt: now },
    })
    .returning({ id: advertiserAccounts.id });

  if (!houseAccount) throw new Error("Unable to initialize the house advertising account.");

  const campaignId = randomUUID();
  const creativeId = randomUUID();
  const status = startsAt <= now ? "active" : "scheduled";
  const campaignInsert = database.insert(campaigns).values({
    id: campaignId,
    advertiserAccountId: houseAccount.id,
    createdByClerkUserId: user.id,
    name,
    objective: body,
    status,
    startsAt,
    endsAt,
    durationSeconds,
    targeting: {
      markets: ["Eastern Carolina"],
      notes: "All active NeuseCast screens",
      houseAd: { kind: houseAdKind, sponsor, enteredBy: user.id, bypassBilling: true },
    },
    subtotalCents: 0,
    totalCents: 0,
    billingPaused: false,
  });
  const creativeInsert = database.insert(creatives).values({
    id: creativeId,
    campaignId,
    createdByClerkUserId: user.id,
    type: "generated_slide",
    status: "approved",
    name,
    headline,
    body,
    callToAction,
    durationSeconds,
    metadata: { eyebrow, theme, sponsor, source: "house_ad", houseAdKind },
  });
  const activeScreens = await database.select({ id: screens.id }).from(screens).where(eq(screens.active, true));

  if (activeScreens.length) {
    const screenAssignments = database.insert(campaignScreens).values(activeScreens.map((screen) => ({
      campaignId,
      screenId: screen.id,
      priceCents: 0,
      scheduledPlaysPerDay: playsPerDay,
    }))).onConflictDoNothing();
    await database.batch([campaignInsert, creativeInsert, screenAssignments] as const);
  } else {
    await database.batch([campaignInsert, creativeInsert] as const);
  }

  revalidatePath("/control/campaigns");
  revalidatePath("/control/content");
  revalidatePath("/control/schedule");
  revalidatePath("/control/screens");
  redirect("/control/campaigns?houseCreated=1");
}

export async function approveCreative(formData: FormData) {
  await requireControlUser();
  const creativeId = String(formData.get("creativeId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!creativeId || !campaignId) return;
  const database = getDatabase();

  const [eligibleCreative] = await database
    .select({
      startsAt: campaigns.startsAt,
      billingPaused: campaigns.billingPaused,
      advertiserActive: advertiserAccounts.active,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
    })
    .from(creatives)
    .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
    .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
    .where(and(
      eq(creatives.id, creativeId),
      eq(creatives.campaignId, campaignId),
      eq(creatives.status, "review"),
    ))
    .limit(1);

  if (
    !eligibleCreative
    || !eligibleCreative.advertiserActive
    || eligibleCreative.subscriptionStatus !== "active"
    || eligibleCreative.billingPaused
  ) {
    revalidatePath("/control/campaigns");
    return;
  }

  await database.update(creatives).set({ status: "archived", updatedAt: new Date() }).where(and(eq(creatives.campaignId, campaignId), eq(creatives.status, "approved"), ne(creatives.id, creativeId)));
  await database.update(creatives).set({ status: "approved", updatedAt: new Date() }).where(and(eq(creatives.id, creativeId), eq(creatives.campaignId, campaignId), eq(creatives.status, "review")));

  const status = eligibleCreative.startsAt && eligibleCreative.startsAt <= new Date() ? "active" : "scheduled";
  await database.update(campaigns).set({ status, updatedAt: new Date() }).where(and(eq(campaigns.id, campaignId), eq(campaigns.billingPaused, false)));
  revalidatePath("/control/campaigns");
}

export async function rejectCreative(formData: FormData) {
  await requireControlUser();
  const creativeId = String(formData.get("creativeId") ?? "");
  if (!creativeId) return;
  await getDatabase().update(creatives).set({ status: "rejected", updatedAt: new Date() }).where(eq(creatives.id, creativeId));
  revalidatePath("/control/campaigns");
}

export async function pauseCampaign(formData: FormData) {
  await requireControlUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) return;
  await getDatabase().update(campaigns).set({ status: "paused", updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  revalidatePath("/control/campaigns");
}

export async function resumeCampaign(formData: FormData) {
  await requireControlUser();
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) return;
  const database = getDatabase();
  const [campaign] = await database
    .select({ startsAt: campaigns.startsAt, endsAt: campaigns.endsAt, billingPaused: campaigns.billingPaused })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  if (!campaign || campaign.billingPaused) return;
  const now = new Date();
  const status = campaign.endsAt && campaign.endsAt <= now ? "completed" : campaign.startsAt && campaign.startsAt > now ? "scheduled" : "active";
  await database.update(campaigns).set({ status, updatedAt: now }).where(eq(campaigns.id, campaignId));
  revalidatePath("/control/campaigns");
  revalidatePath("/control/schedule");
  revalidatePath("/control/screens");
}
