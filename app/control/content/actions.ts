"use server";

import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { generatedContent } from "@/lib/db/schema";
import {
  FILLER_CATEGORIES,
  FILLER_THEMES,
  type FillerCategory,
  type FillerTheme,
} from "@/lib/filler/constants";
import { generateAutomaticFiller } from "@/lib/filler/generator";

const controlRoomEmails = new Set(
  (process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

async function requireControlUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!user || !email || !controlRoomEmails.has(email)) {
    throw new Error("Control Room authorization required.");
  }
  return user;
}

function value(formData: FormData, key: string, max: number) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function optionalHttpUrl(formData: FormData, key: string) {
  const raw = value(formData, key, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function expiration(formData: FormData, now: Date) {
  const lifetime = value(formData, "lifetime", 20);
  const days = lifetime === "1_day" ? 1 : lifetime === "7_days" ? 7 : lifetime === "30_days" ? 30 : 0;
  return days ? new Date(now.getTime() + days * 24 * 60 * 60 * 1_000) : null;
}

export async function createFillerContent(formData: FormData) {
  await requireControlUser();
  const category = value(formData, "category", 40) as FillerCategory;
  const theme = value(formData, "theme", 20) as FillerTheme;
  const title = value(formData, "title", 180);
  const body = value(formData, "body", 1_000);
  if (!FILLER_CATEGORIES.includes(category) || !FILLER_THEMES.includes(theme) || !title || !body) {
    redirect("/control/content?error=manual");
  }
  const durationRaw = Number(value(formData, "durationSeconds", 4));
  const durationSeconds = Number.isFinite(durationRaw) ? Math.max(8, Math.min(30, Math.round(durationRaw))) : 12;
  const now = new Date();
  const market = value(formData, "market", 100);
  await getDatabase().insert(generatedContent).values({
    category,
    market: market || null,
    title,
    body,
    sourceName: value(formData, "sourceName", 160) || null,
    sourceUrl: optionalHttpUrl(formData, "sourceUrl"),
    artworkUrl: optionalHttpUrl(formData, "artworkUrl"),
    startsAt: now,
    expiresAt: expiration(formData, now),
    approved: formData.get("publish") === "on",
    metadata: {
      origin: "manual",
      eyebrow: value(formData, "eyebrow", 80) || null,
      callToAction: value(formData, "callToAction", 120) || null,
      theme,
      durationSeconds,
      createdBy: "control_room",
    },
  });
  revalidatePath("/control/content");
  revalidatePath("/control/screens");
  redirect("/control/content?created=1");
}

export async function updateFillerContent(formData: FormData) {
  await requireControlUser();
  const contentId = value(formData, "contentId", 36);
  const category = value(formData, "category", 40) as FillerCategory;
  const theme = value(formData, "theme", 20) as FillerTheme;
  const title = value(formData, "title", 180);
  const body = value(formData, "body", 1_000);
  if (
    !contentId
    || !FILLER_CATEGORIES.includes(category)
    || !FILLER_THEMES.includes(theme)
    || !title
    || !body
  ) return;

  const database = getDatabase();
  const [existing] = await database
    .select({ metadata: generatedContent.metadata })
    .from(generatedContent)
    .where(eq(generatedContent.id, contentId))
    .limit(1);
  if (!existing) return;

  const durationRaw = Number(value(formData, "durationSeconds", 4));
  const durationSeconds = Number.isFinite(durationRaw) ? Math.max(8, Math.min(30, Math.round(durationRaw))) : 12;
  const now = new Date();
  const market = value(formData, "market", 100);
  await database
    .update(generatedContent)
    .set({
      category,
      market: market || null,
      title,
      body,
      sourceName: value(formData, "sourceName", 160) || null,
      sourceUrl: optionalHttpUrl(formData, "sourceUrl"),
      artworkUrl: optionalHttpUrl(formData, "artworkUrl"),
      metadata: {
        ...(existing.metadata ?? {}),
        eyebrow: value(formData, "eyebrow", 80) || null,
        callToAction: value(formData, "callToAction", 120) || null,
        theme,
        durationSeconds,
        editedAt: now.toISOString(),
        editedBy: "control_room",
      },
      updatedAt: now,
    })
    .where(eq(generatedContent.id, contentId));
  revalidatePath("/control/content");
  revalidatePath("/control/screens");
}

export async function setFillerActive(formData: FormData) {
  await requireControlUser();
  const contentId = value(formData, "contentId", 36);
  const approved = value(formData, "approved", 5) === "true";
  if (!contentId) return;
  const now = new Date();
  await getDatabase()
    .update(generatedContent)
    .set({
      approved,
      ...(approved && value(formData, "resetExpiry", 5) === "true"
        ? { startsAt: now, expiresAt: null }
        : {}),
      updatedAt: now,
    })
    .where(eq(generatedContent.id, contentId));
  revalidatePath("/control/content");
  revalidatePath("/control/screens");
}

export async function deleteFillerContent(formData: FormData) {
  await requireControlUser();
  const contentId = value(formData, "contentId", 36);
  if (!contentId) return;
  await getDatabase().delete(generatedContent).where(eq(generatedContent.id, contentId));
  revalidatePath("/control/content");
  revalidatePath("/control/screens");
}

export async function generateFillerNow(formData: FormData) {
  await requireControlUser();
  const market = value(formData, "market", 100);
  const result = await generateAutomaticFiller(market ? [market] : undefined);
  revalidatePath("/control/content");
  revalidatePath("/control/screens");
  const params = new URLSearchParams({
    generated: String(result.created),
    markets: String(result.markets),
  });
  if (result.errors.length) params.set("generationError", "1");
  redirect(`/control/content?${params.toString()}`);
}
