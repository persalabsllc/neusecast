"use server";

import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { appUsers, screenAdvertiserBlocks } from "@/lib/db/schema";

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
