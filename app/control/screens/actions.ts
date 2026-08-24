"use server";

import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, screens, venues } from "@/lib/db/schema";

const controlRoomEmails = new Set((process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

function value(formData: FormData, key: string, max = 200) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

async function requireControlUser() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress.toLowerCase();
  if (!user || !email || !controlRoomEmails.has(email)) throw new Error("Control Room authorization required.");
  return user;
}

export async function activateScreen(formData: FormData) {
  await requireControlUser();
  await ensureScreenManagementSchema();
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
  const screenName = value(formData, "screenName", 160);
  const orientation = value(formData, "orientation", 20) || "landscape";
  if (!hostEmail.includes("@") || !venueName || !venueType || !addressLine1 || !city || !postalCode || !market || !screenName) redirect("/control/screens?error=required");

  const database = getDatabase();
  const [existingHost] = await database.select({ clerkUserId: appUsers.clerkUserId }).from(appUsers).where(eq(appUsers.email, hostEmail)).limit(1);
  const hostClerkUserId = existingHost?.clerkUserId ?? `invited:${hostEmail}`;
  if (!existingHost) await database.insert(appUsers).values({ clerkUserId: hostClerkUserId, email: hostEmail, displayName: hostName || venueName, role: "host", status: "invited" });

  const [venue] = await database.insert(venues).values({ hostClerkUserId, name: venueName, venueType, addressLine1, addressLine2: addressLine2 || null, city, state, postalCode, market, status: "active" }).returning({ id: venues.id });
  const playerKey = `nc-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const [screen] = await database.insert(screens).values({ venueId: venue.id, name: screenName, provider: "neusecast", providerScreenId: playerKey, orientation, monthlyPriceCents: 0, status: "pending", active: true }).returning({ id: screens.id });
  revalidatePath("/control/screens");
  redirect(`/control/screens/${screen.id}?created=1`);
}

export async function setScreenActive(formData: FormData) {
  await requireControlUser();
  const screenId = value(formData, "screenId", 36);
  const active = value(formData, "active", 5) === "true";
  await getDatabase().update(screens).set({ active, status: active ? "pending" : "maintenance", updatedAt: new Date() }).where(eq(screens.id, screenId));
  revalidatePath("/control/screens");
  revalidatePath(`/control/screens/${screenId}`);
}
