"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";
import { getDatabase } from "@/lib/db";
import { newsroomEditions, newsroomStories } from "@/lib/db/schema";
import { generateNewsroomEdition, rebuildNewsroomEdition } from "@/lib/newsroom/generator";
import type { NewsroomSlot } from "@/lib/newsroom/types";

export type NewsroomGenerationActionState = {
  status: "idle" | "success" | "error";
  message: string;
  editionId: string | null;
};

async function requireControlUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!user || !isControlRoomEmail(email)) throw new Error("Control Room authorization required.");
  return user;
}

function value(formData: FormData, key: string, max: number) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function refreshNewsroom(editionId?: string) {
  revalidatePath("/control");
  revalidatePath("/control/newsroom");
  revalidatePath("/control/screens");
  revalidatePath("/watch");
  if (editionId) revalidatePath(`/control/newsroom/${editionId}`);
}

export async function generateNewsroomEditionAction(
  _previousState: NewsroomGenerationActionState,
  formData: FormData,
): Promise<NewsroomGenerationActionState> {
  await requireControlUser();
  const market = value(formData, "market", 100) || "Eastern North Carolina";
  const requestedSlot = value(formData, "slot", 24);
  const slot: NewsroomSlot = requestedSlot === "morning" || requestedSlot === "afternoon"
    ? requestedSlot
    : "manual";
  console.log("[newsroom:manual] generation started", { market, slot });
  const result = await generateNewsroomEdition({ market, slot, force: true });
  console.log("[newsroom:manual] generation completed", {
    market,
    slot,
    editionId: result.editionId,
    createdStories: result.createdStories,
    autoApprovedStories: result.autoApprovedStories,
    reviewStories: result.reviewStories,
    published: result.published,
    error: result.error,
  });
  refreshNewsroom();
  if (result.error) {
    return {
      status: "error",
      message: `The newsroom could not complete this edition: ${result.error}`,
      editionId: result.editionId,
    };
  }
  const reviewMessage = result.reviewStories
    ? ` ${result.reviewStories} sensitive ${result.reviewStories === 1 ? "story is" : "stories are"} waiting for review.`
    : "";
  return {
    status: "success",
    message: result.published
      ? `Edition created with ${result.createdStories} verified stories and placed on air.${reviewMessage}`
      : `Edition created with ${result.createdStories} verified stories. Approve at least four stories to publish it.${reviewMessage}`,
    editionId: result.editionId,
  };
}

export async function reviewNewsroomStoryAction(formData: FormData) {
  const user = await requireControlUser();
  const storyId = value(formData, "storyId", 36);
  const editionId = value(formData, "editionId", 36);
  const decision = value(formData, "decision", 20);
  const status = decision === "approve" ? "approved"
    : decision === "kill" ? "killed"
      : "rejected";
  if (!storyId || !editionId) return;

  await getDatabase()
    .update(newsroomStories)
    .set({
      status,
      reviewedByClerkUserId: user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(newsroomStories.id, storyId), eq(newsroomStories.editionId, editionId)));
  await rebuildNewsroomEdition(editionId, {
    approvedByClerkUserId: decision === "approve" ? user.id : undefined,
    preservePublished: true,
  });
  refreshNewsroom(editionId);
}

export async function updateNewsroomStoryAction(formData: FormData) {
  const user = await requireControlUser();
  const storyId = value(formData, "storyId", 36);
  const editionId = value(formData, "editionId", 36);
  const headline = value(formData, "headline", 180);
  const summary = value(formData, "summary", 420);
  const narration = value(formData, "narration", 1_200);
  const ticker = value(formData, "ticker", 300);
  if (!storyId || !editionId || !headline || !summary || !narration || !ticker) return;

  await getDatabase()
    .update(newsroomStories)
    .set({
      headline,
      summary,
      narration,
      ticker,
      status: "approved",
      reviewedByClerkUserId: user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(newsroomStories.id, storyId), eq(newsroomStories.editionId, editionId)));
  await rebuildNewsroomEdition(editionId, { approvedByClerkUserId: user.id, preservePublished: true });
  refreshNewsroom(editionId);
}

export async function publishNewsroomEditionAction(formData: FormData) {
  const user = await requireControlUser();
  const editionId = value(formData, "editionId", 36);
  if (!editionId) return;
  await rebuildNewsroomEdition(editionId, { publish: true, approvedByClerkUserId: user.id });
  refreshNewsroom(editionId);
}

export async function withdrawNewsroomEditionAction(formData: FormData) {
  await requireControlUser();
  const editionId = value(formData, "editionId", 36);
  if (!editionId) return;
  await getDatabase().update(newsroomEditions).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(newsroomEditions.id, editionId));
  refreshNewsroom(editionId);
}
