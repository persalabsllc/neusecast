"use server";

import { and, eq, ne } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { campaigns, creatives } from "@/lib/db/schema";

const controlRoomEmails = new Set(
  (process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

async function requireControlUser() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress.toLowerCase();
  if (!email || !controlRoomEmails.has(email)) throw new Error("Control Room authorization required.");
}

export async function approveCreative(formData: FormData) {
  await requireControlUser();
  const creativeId = String(formData.get("creativeId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!creativeId || !campaignId) return;
  const database = getDatabase();

  await database.update(creatives).set({ status: "archived", updatedAt: new Date() }).where(and(eq(creatives.campaignId, campaignId), eq(creatives.status, "approved"), ne(creatives.id, creativeId)));
  await database.update(creatives).set({ status: "approved", updatedAt: new Date() }).where(and(eq(creatives.id, creativeId), eq(creatives.campaignId, campaignId)));

  const [campaign] = await database.select({ startsAt: campaigns.startsAt }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const status = campaign?.startsAt && campaign.startsAt <= new Date() ? "active" : "scheduled";
  await database.update(campaigns).set({ status, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
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
