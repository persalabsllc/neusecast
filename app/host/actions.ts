"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, hostContent, screenAdvertiserBlocks, screens, venues } from "@/lib/db/schema";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { localDateTimeInputInZone } from "@/lib/time-zone";

function value(formData: FormData, key: string, max = 200) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

export async function requireHostUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!user || !email) redirect("/sign-in?redirect_url=/host");
  await ensureScreenManagementSchema();
  const database = getDatabase();
  const claimEmail = `claiming.${user.id}@neusecast.invalid`;
  const [[actual], [invitation], [emailOwner]] = await Promise.all([
    database
      .select({ id: appUsers.clerkUserId, role: appUsers.role, status: appUsers.status })
      .from(appUsers)
      .where(eq(appUsers.clerkUserId, user.id))
      .limit(1),
    database
      .select({ id: appUsers.clerkUserId })
      .from(appUsers)
      .where(and(
        or(eq(appUsers.email, email), eq(appUsers.email, claimEmail)),
        eq(appUsers.role, "host"),
        eq(appUsers.status, "invited"),
      ))
      .limit(1),
    database
      .select({ id: appUsers.clerkUserId, status: appUsers.status })
      .from(appUsers)
      .where(eq(appUsers.email, email))
      .limit(1),
  ]);
  const pendingInvitation = invitation?.id === user.id ? null : invitation;

  if (actual?.status === "suspended") redirect("/access-required?workspace=host");
  if (!actual && emailOwner && emailOwner.id !== pendingInvitation?.id) {
    redirect("/access-required?workspace=host");
  }

  if (!actual) {
    if (pendingInvitation) {
      await database
        .update(appUsers)
        .set({ email: claimEmail, updatedAt: new Date() })
        .where(eq(appUsers.clerkUserId, pendingInvitation.id));
    }
    await database.insert(appUsers).values({
      clerkUserId: user.id,
      email,
      displayName: user.fullName ?? email,
      role: "host",
      status: "active",
    });
  }

  // The deterministic claim email makes this sequence recoverable. If a network
  // error interrupts it, the next sign-in can finish without orphaning the venue.
  if (pendingInvitation) {
    await database
      .update(venues)
      .set({ hostClerkUserId: user.id, updatedAt: new Date() })
      .where(eq(venues.hostClerkUserId, pendingInvitation.id));
    await database.delete(appUsers).where(eq(appUsers.clerkUserId, pendingInvitation.id));
    if (actual && actual.role !== "admin") {
      await database
        .update(appUsers)
        .set({ role: "host", status: "active", updatedAt: new Date() })
        .where(eq(appUsers.clerkUserId, user.id));
    }
  } else if (actual?.status === "invited") {
    await database
      .update(appUsers)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(appUsers.clerkUserId, user.id));
  }
  return user;
}

export async function submitHostContent(formData: FormData) {
  const user = await requireHostUser();
  const screenId = value(formData, "screenId", 36);
  const template = value(formData, "template", 60) || "aqua";
  const headline = value(formData, "headline", 120);
  const body = value(formData, "body", 500);
  const detail = value(formData, "detail", 50);
  const callToAction = [detail, value(formData, "callToAction", 120)].filter(Boolean).join(" · ").slice(0, 120);
  const startsAtRaw = value(formData, "startsAt", 40);
  const endsAtRaw = value(formData, "endsAt", 40);
  if (!screenId || !headline || !body) redirect("/host?error=content");
  const database = getDatabase();
  const [owned] = await database
    .select({ screenId: screens.id, venueId: venues.id, timeZone: venues.timeZone })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .where(and(eq(screens.id, screenId), eq(venues.hostClerkUserId, user.id), eq(screens.active, true)))
    .limit(1);
  if (!owned) throw new Error("This screen is not assigned to your host account.");
  const startsAt = startsAtRaw ? localDateTimeInputInZone(startsAtRaw, owned.timeZone) : new Date();
  const endsAt = endsAtRaw ? localDateTimeInputInZone(endsAtRaw, owned.timeZone) : null;
  if (!startsAt || (endsAtRaw && !endsAt) || (endsAt && endsAt <= startsAt)) redirect("/host?error=schedule");
  await database.insert(hostContent).values({ venueId: owned.venueId, screenId: owned.screenId, submittedByClerkUserId: user.id, status: "scheduled", template, headline, body, callToAction: callToAction || null, startsAt, endsAt });
  revalidatePath("/host");
  redirect("/host?saved=1");
}

export async function updateHostAdvertiserBlock(formData: FormData) {
  const user = await requireHostUser();
  const screenId = value(formData, "screenId", 36);
  const advertiserAccountId = value(formData, "advertiserAccountId", 36);
  const blocked = value(formData, "blocked", 5) === "true";
  const database = getDatabase();
  const [owned] = await database.select({ id: screens.id }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)).where(and(eq(screens.id, screenId), eq(venues.hostClerkUserId, user.id))).limit(1);
  if (!owned) throw new Error("This screen is not assigned to your host account.");
  if (blocked) await database.insert(screenAdvertiserBlocks).values({ screenId, advertiserAccountId, blockedByClerkUserId: user.id, reason: "Host competitor restriction" }).onConflictDoNothing();
  else await database.delete(screenAdvertiserBlocks).where(and(eq(screenAdvertiserBlocks.screenId, screenId), eq(screenAdvertiserBlocks.advertiserAccountId, advertiserAccountId)));
  revalidatePath("/host");
  revalidatePath(`/control/screens/${screenId}`);
}
