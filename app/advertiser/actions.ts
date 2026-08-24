"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, appUsers, campaigns } from "@/lib/db/schema";

function textValue(formData: FormData, key: string, maximumLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function optionalDate(formData: FormData, key: string) {
  const value = textValue(formData, key, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
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

export async function createCampaignRequest(formData: FormData) {
  const { user } = await requireAdvertiserUser();
  const database = getDatabase();
  const [account] = await database
    .select({ id: advertiserAccounts.id })
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
  const objective = textValue(formData, "objective", 1800);
  const market = textValue(formData, "market", 100) || "New Bern";
  const venueTypes = formData
    .getAll("venueTypes")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().slice(0, 80))
    .filter(Boolean);
  const notes = textValue(formData, "notes", 1200);
  const startsAt = optionalDate(formData, "startsAt");
  const endsAt = optionalDate(formData, "endsAt");

  if (!name || !objective || !startsAt || !endsAt || endsAt < startsAt) {
    redirect("/advertiser/new?error=campaign-details");
  }

  await database.insert(campaigns).values({
    advertiserAccountId: account.id,
    createdByClerkUserId: user.id,
    name,
    objective,
    status: "submitted",
    startsAt,
    endsAt,
    targeting: {
      markets: [market],
      venueTypes,
      notes: notes || undefined,
    },
  });

  redirect("/advertiser?requested=1");
}
