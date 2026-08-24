"use server";

import { and, eq, ne } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";
import { advertiserAccounts, campaigns, creatives } from "@/lib/db/schema";

async function requireControlUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!isControlRoomEmail(email)) throw new Error("Control Room authorization required.");
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
