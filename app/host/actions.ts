"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, hostContent, screenAdvertiserBlocks, screens, venues } from "@/lib/db/schema";

function value(formData: FormData, key: string, max = 200) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function localDateTimeInZone(raw: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (!Number.isFinite(target)) return null;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const renderedLocalTime = (date: Date) => {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  };

  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const adjustment = target - renderedLocalTime(new Date(candidate));
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  const result = new Date(candidate);
  return renderedLocalTime(result) === target ? result : null;
}

export async function requireHostUser() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress.toLowerCase();
  if (!user || !email) redirect("/sign-in?redirect_url=/host");
  await ensureScreenManagementSchema();
  const database = getDatabase();
  const [actual] = await database
    .select({ id: appUsers.clerkUserId, role: appUsers.role, status: appUsers.status })
    .from(appUsers)
    .where(eq(appUsers.clerkUserId, user.id))
    .limit(1);
  if (actual && (actual.role !== "host" || actual.status !== "active")) notFound();
  if (!actual) {
    const [invitation] = await database
      .select({ id: appUsers.clerkUserId })
      .from(appUsers)
      .where(and(eq(appUsers.email, email), eq(appUsers.role, "host"), eq(appUsers.status, "invited")))
      .limit(1);
    if (invitation) {
      const assigned = await database.select({ id: venues.id }).from(venues).where(eq(venues.hostClerkUserId, invitation.id));
      await database.update(venues).set({ hostClerkUserId: null, updatedAt: new Date() }).where(eq(venues.hostClerkUserId, invitation.id));
      await database.delete(appUsers).where(eq(appUsers.clerkUserId, invitation.id));
      await database.insert(appUsers).values({ clerkUserId: user.id, email, displayName: user.fullName ?? email, role: "host", status: "active" });
      if (assigned.length) await database.update(venues).set({ hostClerkUserId: user.id, updatedAt: new Date() }).where(inArray(venues.id, assigned.map((item) => item.id)));
    } else {
      await database.insert(appUsers).values({ clerkUserId: user.id, email, displayName: user.fullName ?? email, role: "host", status: "active" });
    }
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
  const startsAt = startsAtRaw ? localDateTimeInZone(startsAtRaw, owned.timeZone) : new Date();
  const endsAt = endsAtRaw ? localDateTimeInZone(endsAtRaw, owned.timeZone) : null;
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
