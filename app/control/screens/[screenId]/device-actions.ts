"use server";

import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { screens } from "@/lib/db/schema";
import { createPlayerPairingToken, pairingCookieName } from "@/lib/player/pairing";

const controlRoomEmails = new Set(
  (process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

async function requireControlUser() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress.toLowerCase();
  if (!user || !email || !controlRoomEmails.has(email)) {
    throw new Error("Control Room authorization required.");
  }
}

async function savePairingCookie(screenId: string, token: string) {
  (await cookies()).set(pairingCookieName(screenId), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60,
    path: `/control/screens/${screenId}`,
  });
}

export async function createPlayerPairingLink(formData: FormData) {
  await requireControlUser();
  await ensureScreenManagementSchema();
  const screenId = String(formData.get("screenId") ?? "").trim().slice(0, 36);
  if (!screenId) return;

  const [screen] = await getDatabase()
    .select({ id: screens.id, active: screens.active, deviceCredentialHash: screens.deviceCredentialHash })
    .from(screens)
    .where(eq(screens.id, screenId))
    .limit(1);
  if (!screen || !screen.active || screen.deviceCredentialHash) return;

  const pairing = createPlayerPairingToken();
  await getDatabase()
    .update(screens)
    .set({
      pairingTokenHash: pairing.hash,
      pairingTokenExpiresAt: pairing.expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(screens.id, screenId));
  await savePairingCookie(screenId, pairing.token);
  revalidatePath(`/control/screens/${screenId}`);
  redirect(`/control/screens/${screenId}?pairing=1`);
}

export async function resetPlayerDevice(formData: FormData) {
  await requireControlUser();
  await ensureScreenManagementSchema();
  const screenId = String(formData.get("screenId") ?? "").trim().slice(0, 36);
  if (!screenId) return;

  const pairing = createPlayerPairingToken();

  await getDatabase()
    .update(screens)
    .set({
      deviceId: null,
      deviceCredentialHash: null,
      deviceClaimedAt: null,
      lastSeenAt: null,
      lastHeartbeatAt: null,
      lastManifestAt: null,
      lastManifestVersion: null,
      lastPlaybackAt: null,
      currentItemId: null,
      currentManifestVersion: null,
      playerVersion: null,
      sessionId: null,
      viewportWidth: null,
      viewportHeight: null,
      lastError: null,
      lastErrorAt: null,
      pairingTokenHash: pairing.hash,
      pairingTokenExpiresAt: pairing.expiresAt,
      status: "pending",
      updatedAt: new Date(),
    })
    .where(eq(screens.id, screenId));

  await savePairingCookie(screenId, pairing.token);
  revalidatePath("/control/screens");
  revalidatePath(`/control/screens/${screenId}`);
  redirect(`/control/screens/${screenId}?reset=1`);
}
