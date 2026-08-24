"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, screenAdvertiserBlocks } from "@/lib/db/schema";

const controlRoomEmails = new Set((process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

async function requireControlUser() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress.toLowerCase();
  if (!user || !email || !controlRoomEmails.has(email)) throw new Error("Control Room authorization required.");
  return user;
}

export async function updateAdvertiserBlock(formData: FormData) {
  const user = await requireControlUser();
  await ensureScreenManagementSchema();
  const screenId = String(formData.get("screenId") ?? "").slice(0, 36);
  const advertiserAccountId = String(formData.get("advertiserAccountId") ?? "").slice(0, 36);
  const blocked = String(formData.get("blocked") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!screenId || !advertiserAccountId) return;
  const database = getDatabase();
  if (blocked) {
    await database.insert(appUsers).values({ clerkUserId: user.id, email: user.primaryEmailAddress?.emailAddress.toLowerCase() ?? user.id, displayName: user.fullName ?? "Control Room", role: "admin", status: "active" }).onConflictDoNothing();
    await database.insert(screenAdvertiserBlocks).values({ screenId, advertiserAccountId, blockedByClerkUserId: user.id, reason: reason || "Venue conflict" }).onConflictDoUpdate({ target: [screenAdvertiserBlocks.screenId, screenAdvertiserBlocks.advertiserAccountId], set: { reason: reason || "Venue conflict", blockedByClerkUserId: user.id } });
  } else {
    await database.delete(screenAdvertiserBlocks).where(and(eq(screenAdvertiserBlocks.screenId, screenId), eq(screenAdvertiserBlocks.advertiserAccountId, advertiserAccountId)));
  }
  revalidatePath(`/control/screens/${screenId}`);
  revalidatePath("/host");
}
