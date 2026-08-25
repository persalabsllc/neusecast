"use server";

import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, campaignScreens, campaigns, screens, venues } from "@/lib/db/schema";
import { createPlayerPairingToken, pairingCookieName } from "@/lib/player/pairing";

function value(formData: FormData, key: string, max = 200) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function timeZoneValue(formData: FormData) {
  const candidate = value(formData, "timeZone", 64) || "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "America/New_York";
  }
}

async function requireControlUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!user || !isControlRoomEmail(email)) throw new Error("Control Room authorization required.");
  return user;
}

export async function activateScreen(formData: FormData) {
  await requireControlUser();
  await ensureScreenManagementSchema();
  const existingHostId = value(formData, "existingHostId", 200);
  const hostEmail = value(formData, "hostEmail", 320).toLowerCase();
  const hostName = value(formData, "hostName", 160);
  const venueName = value(formData, "venueName");
  const venueType = value(formData, "venueType", 80);
  const addressLine1 = value(formData, "addressLine1");
  const addressLine2 = value(formData, "addressLine2");
  const city = value(formData, "city", 100);
  const state = value(formData, "state", 2).toUpperCase() || "NC";
  const postalCode = value(formData, "postalCode", 12);
  const market = value(formData, "market", 100);
  const timeZone = timeZoneValue(formData);
  const screenName = value(formData, "screenName", 160);
  const orientation = value(formData, "orientation", 20) || "landscape";
  if ((!existingHostId && !hostEmail.includes("@")) || !venueName || !venueType || !addressLine1 || !city || !postalCode || !market || !screenName) redirect("/control/screens?error=required");

  const database = getDatabase();
  const [selectedHost] = existingHostId
    ? await database.select({ clerkUserId: appUsers.clerkUserId }).from(appUsers).where(and(eq(appUsers.clerkUserId, existingHostId), eq(appUsers.role, "host"), inArray(appUsers.status, ["active", "invited"]))).limit(1)
    : [];
  if (existingHostId && !selectedHost) redirect("/control/screens?error=host");

  const [emailUser] = !selectedHost
    ? await database.select({ clerkUserId: appUsers.clerkUserId, role: appUsers.role, status: appUsers.status }).from(appUsers).where(eq(appUsers.email, hostEmail)).limit(1)
    : [];
  if (emailUser?.status === "suspended") redirect("/control/screens?error=host");
  const hostClerkUserId = selectedHost?.clerkUserId ?? emailUser?.clerkUserId ?? `invited:${hostEmail}`;
  const createHostInvitation = !selectedHost && !emailUser;
  const venueId = randomUUID();
  const screenId = randomUUID();
  const playerKey = `nc-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const pairing = createPlayerPairingToken();
  const venueInsert = database.insert(venues).values({
    id: venueId,
    hostClerkUserId,
    name: venueName,
    venueType,
    addressLine1,
    addressLine2: addressLine2 || null,
    city,
    state,
    postalCode,
    market,
    timeZone,
    status: "active",
  });
  const screenInsert = database.insert(screens).values({
    id: screenId,
    venueId,
    name: screenName,
    provider: "neusecast",
    providerScreenId: playerKey,
    orientation,
    monthlyPriceCents: 0,
    status: "pending",
    active: true,
    pairingTokenHash: pairing.hash,
    pairingTokenExpiresAt: pairing.expiresAt,
  });

  // Neon HTTP batches are committed as one transaction. A failed activation cannot
  // leave behind only an invitation or venue without its corresponding screen.
  if (createHostInvitation) {
    await database.batch([
      database.insert(appUsers).values({ clerkUserId: hostClerkUserId, email: hostEmail, displayName: hostName || venueName, role: "host", status: "invited" }),
      venueInsert,
      screenInsert,
    ] as const);
  } else if (emailUser && emailUser.role !== "host" && emailUser.role !== "admin") {
    await database.batch([
      database.update(appUsers).set({ role: "host", updatedAt: new Date() }).where(eq(appUsers.clerkUserId, emailUser.clerkUserId)),
      venueInsert,
      screenInsert,
    ] as const);
  } else {
    await database.batch([venueInsert, screenInsert] as const);
  }

  const activeCampaigns = await database
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(inArray(campaigns.status, ["approved", "scheduled", "active"]));
  if (activeCampaigns.length > 0) {
    await database.insert(campaignScreens).values(activeCampaigns.map((campaign) => ({
      campaignId: campaign.id,
      screenId,
      priceCents: 0,
      scheduledPlaysPerDay: 12,
    }))).onConflictDoNothing();
  }

  (await cookies()).set(pairingCookieName(screenId), pairing.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60,
    path: `/control/screens/${screenId}`,
  });
  revalidatePath("/control/screens");
  redirect(`/control/screens/${screenId}?created=1`);
}

export async function setScreenActive(formData: FormData) {
  await requireControlUser();
  const screenId = value(formData, "screenId", 36);
  const active = value(formData, "active", 5) === "true";
  await getDatabase().update(screens).set({ active, status: active ? "pending" : "maintenance", updatedAt: new Date() }).where(eq(screens.id, screenId));
  revalidatePath("/control/screens");
  revalidatePath(`/control/screens/${screenId}`);
}
