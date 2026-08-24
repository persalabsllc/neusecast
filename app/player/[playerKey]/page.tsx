import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PlayerRuntime } from "@/components/player-runtime";
import { getDatabase } from "@/lib/db";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { screens } from "@/lib/db/schema";
import {
  authorizePlayerBootstrap,
  playerDeviceCookieNames,
} from "@/lib/player/device-auth";
import { getPlayerManifest } from "@/lib/player/playlist";
import { deriveScreenHealth } from "@/lib/player/health";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NeuseCast Player",
  description: "NeuseCast digital signage player",
  robots: { index: false, follow: false },
};

const controlRoomEmails = new Set(
  (process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerKey: string }>;
  searchParams: Promise<{ preview?: string | string[]; pair?: string | string[] }>;
}) {
  const [{ playerKey }, query] = await Promise.all([params, searchParams]);
  const preview = queryValue(query.preview) === "1";
  const pairingToken = queryValue(query.pair)?.trim();
  let previewCurrentItemId: string | null = null;

  if (preview) {
    const user = await currentUser();
    const email = verifiedPrimaryEmail(user);
    if (!email || !controlRoomEmails.has(email)) notFound();
    const [screen] = await getDatabase()
      .select({
        active: screens.active,
        status: screens.status,
        lastHeartbeatAt: screens.lastHeartbeatAt,
        currentItemId: screens.currentItemId,
      })
      .from(screens)
      .where(and(eq(screens.provider, "neusecast"), eq(screens.providerScreenId, playerKey)))
      .limit(1);
    if (screen && deriveScreenHealth(screen) === "online") {
      previewCurrentItemId = screen.currentItemId;
    }
  } else {
    const cookieStore = await cookies();
    const names = playerDeviceCookieNames(playerKey);
    try {
      await authorizePlayerBootstrap(playerKey, {
        deviceId: cookieStore.get(names.deviceId)?.value,
        credential: cookieStore.get(names.credential)?.value,
        pairingToken,
      });
    } catch {
      notFound();
    }
  }

  const manifest = await getPlayerManifest(playerKey, { includeInactive: preview });

  if (!manifest) notFound();

  return (
    <PlayerRuntime
      initialManifest={manifest}
      initialItemId={previewCurrentItemId}
      pairingToken={preview ? undefined : pairingToken}
      playerKey={playerKey}
      playerVersion={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)}
      preview={preview}
    />
  );
}
