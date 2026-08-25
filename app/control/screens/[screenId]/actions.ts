"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, screenAdvertiserBlocks, screens, venues } from "@/lib/db/schema";

function value(formData: FormData, key: string, max = 200) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

async function requireControlUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!user || !email || !isControlRoomEmail(email)) throw new Error("Control Room authorization required.");
  return { user, email };
}

export async function updateAdvertiserBlock(formData: FormData) {
  const { user, email } = await requireControlUser();
  await ensureScreenManagementSchema();
  const screenId = String(formData.get("screenId") ?? "").slice(0, 36);
  const advertiserAccountId = String(formData.get("advertiserAccountId") ?? "").slice(0, 36);
  const blocked = String(formData.get("blocked") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!screenId || !advertiserAccountId) return;
  const database = getDatabase();
  if (blocked) {
    await database.insert(appUsers).values({ clerkUserId: user.id, email, displayName: user.fullName ?? "Control Room", role: "admin", status: "active" }).onConflictDoNothing();
    await database.insert(screenAdvertiserBlocks).values({ screenId, advertiserAccountId, blockedByClerkUserId: user.id, reason: reason || "Venue conflict" }).onConflictDoUpdate({ target: [screenAdvertiserBlocks.screenId, screenAdvertiserBlocks.advertiserAccountId], set: { reason: reason || "Venue conflict", blockedByClerkUserId: user.id } });
  } else {
    await database.delete(screenAdvertiserBlocks).where(and(eq(screenAdvertiserBlocks.screenId, screenId), eq(screenAdvertiserBlocks.advertiserAccountId, advertiserAccountId)));
  }
  revalidatePath(`/control/screens/${screenId}`);
  revalidatePath("/host");
}

export async function updateHostAssignment(formData: FormData) {
  await requireControlUser();
  await ensureScreenManagementSchema();
  const screenId = value(formData, "screenId", 36);
  const existingHostId = value(formData, "existingHostId", 200);
  const hostEmail = value(formData, "hostEmail", 320).toLowerCase();
  const hostName = value(formData, "hostName", 160);
  const detailPath = `/control/screens/${screenId}`;

  if (!screenId || (!existingHostId && !hostEmail.includes("@"))) {
    redirect(`${detailPath}?hostError=required`);
  }

  const database = getDatabase();
  const [screen] = await database
    .select({ venueId: screens.venueId, venueName: venues.name })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .where(eq(screens.id, screenId))
    .limit(1);
  if (!screen) redirect("/control/screens?error=screen");

  const [selectedHost] = existingHostId
    ? await database
      .select({ clerkUserId: appUsers.clerkUserId })
      .from(appUsers)
      .where(and(eq(appUsers.clerkUserId, existingHostId), eq(appUsers.role, "host"), inArray(appUsers.status, ["active", "invited"])))
      .limit(1)
    : [];
  if (existingHostId && !selectedHost) redirect(`${detailPath}?hostError=invalid`);

  const [emailUser] = !selectedHost
    ? await database
      .select({ clerkUserId: appUsers.clerkUserId, role: appUsers.role, status: appUsers.status })
      .from(appUsers)
      .where(eq(appUsers.email, hostEmail))
      .limit(1)
    : [];
  if (emailUser?.status === "suspended") redirect(`${detailPath}?hostError=invalid`);

  const hostClerkUserId = selectedHost?.clerkUserId ?? emailUser?.clerkUserId ?? `invited:${hostEmail}`;
  const venueUpdate = database
    .update(venues)
    .set({ hostClerkUserId, updatedAt: new Date() })
    .where(eq(venues.id, screen.venueId));

  if (!selectedHost && !emailUser) {
    await database.batch([
      database.insert(appUsers).values({
        clerkUserId: hostClerkUserId,
        email: hostEmail,
        displayName: hostName || screen.venueName,
        role: "host",
        status: "invited",
      }),
      venueUpdate,
    ] as const);
  } else if (emailUser && emailUser.role !== "host" && emailUser.role !== "admin") {
    await database.batch([
      database.update(appUsers).set({ role: "host", updatedAt: new Date() }).where(eq(appUsers.clerkUserId, emailUser.clerkUserId)),
      venueUpdate,
    ] as const);
  } else {
    await venueUpdate;
  }

  revalidatePath("/control/screens");
  revalidatePath(detailPath);
  revalidatePath("/host");
  redirect(`${detailPath}?hostUpdated=1`);
}
