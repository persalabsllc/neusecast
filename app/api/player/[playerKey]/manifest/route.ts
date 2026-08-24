import { eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { playerManifestSnapshots, screens } from "@/lib/db/schema";
import {
  authenticatePlayerDevice,
  playerDeviceAuthErrorResponse,
} from "@/lib/player/device-auth";
import { getPlayerManifest } from "@/lib/player/playlist";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerKey: string }> },
) {
  const { playerKey } = await params;

  try {
    const device = await authenticatePlayerDevice(request, playerKey);
    const manifest = await getPlayerManifest(playerKey);

    if (!manifest) return Response.json({ error: "Screen not found" }, { status: 404 });

    const now = new Date();
    const database = getDatabase();
    const snapshotItems = manifest.items.map((item) => ({
      id: item.id,
      source: item.source,
      campaignId: item.campaignId,
      creativeId: item.creativeId,
      durationSeconds: item.durationSeconds,
    }));
    await Promise.all([
      database
        .update(screens)
        .set({ lastManifestAt: now, lastManifestVersion: manifest.version, updatedAt: now })
        .where(eq(screens.id, device.screenId)),
      database
        .insert(playerManifestSnapshots)
        .values({ screenId: device.screenId, version: manifest.version, items: snapshotItems, deliveredAt: now })
        .onConflictDoUpdate({
          target: [playerManifestSnapshots.screenId, playerManifestSnapshots.version],
          // Preserve the first delivery time for a manifest version. Repeated polls
          // are screen-health activity, but they must not invalidate legitimate
          // offline proof-of-play receipts queued after the original delivery.
          set: { items: snapshotItems },
        }),
    ]);

    return Response.json(manifest, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        ETag: `"${manifest.version}"`,
        "X-NeuseCast-Manifest-Version": manifest.version,
      },
    });
  } catch (error) {
    return playerDeviceAuthErrorResponse(error);
  }
}
