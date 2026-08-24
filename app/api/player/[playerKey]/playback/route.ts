import { and, eq, isNull, lte, or } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { playbackEvents, playerManifestSnapshots, screens } from "@/lib/db/schema";
import {
  authenticatePlayerDevice,
  playerDeviceAuthErrorResponse,
} from "@/lib/player/device-auth";
import { getPlayerManifest } from "@/lib/player/playlist";

type PlaybackPayload = {
  eventId?: string;
  itemId?: string;
  source?: string;
  campaignId?: string | null;
  creativeId?: string | null;
  durationSeconds?: number;
  manifestVersion?: string | null;
  sessionId?: string | null;
  playerVersion?: string | null;
  playedAt?: string;
};

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;
const SOURCES = new Set(["creative", "host_content", "generated_content"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerKey: string }> },
) {
  const { playerKey } = await params;

  try {
    const device = await authenticatePlayerDevice(request, playerKey);
    const rawPayload = await request.json().catch(() => null) as unknown;
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as PlaybackPayload
      : null;
    const eventId = payload?.eventId;
    const itemId = payload?.itemId;
    const source = payload?.source;
    const reportedManifestVersion = payload?.manifestVersion;
    const reportedPlaybackAt = typeof payload?.playedAt === "string" ? new Date(payload.playedAt) : null;

    if (
      !payload
      || typeof eventId !== "string"
      || !EVENT_ID_PATTERN.test(eventId)
      || typeof itemId !== "string"
      || !ITEM_ID_PATTERN.test(itemId)
      || typeof source !== "string"
      || !SOURCES.has(source)
      || typeof reportedManifestVersion !== "string"
      || !reportedPlaybackAt
      || !Number.isFinite(reportedPlaybackAt.getTime())
    ) {
      return Response.json({ error: "Invalid playback event" }, { status: 400 });
    }

    const database = getDatabase();
    const now = new Date();
    const ageMs = now.getTime() - reportedPlaybackAt.getTime();
    if (ageMs < -60_000 || ageMs > 24 * 60 * 60 * 1_000) {
      return Response.json({ error: "Playback timestamp is outside the accepted window" }, { status: 400 });
    }

    const [duplicate] = await database
      .select({ id: playbackEvents.id })
      .from(playbackEvents)
      .where(eq(playbackEvents.providerEventId, eventId))
      .limit(1);
    if (duplicate) {
      return Response.json({ ok: true, duplicate: true, serverTime: now.toISOString() }, { status: 202 });
    }

    const manifest = await getPlayerManifest(playerKey);
    if (!manifest) return Response.json({ error: "Screen not found" }, { status: 404 });
    let manifestItem: {
      id: string;
      source: string;
      campaignId: string | null;
      creativeId: string | null;
      durationSeconds: number;
    } | undefined = reportedManifestVersion === manifest.version
      ? manifest.items.find((item) => item.id === itemId && item.source === source)
      : undefined;

    if (!manifestItem) {
      const [snapshot] = await database
        .select({ items: playerManifestSnapshots.items, deliveredAt: playerManifestSnapshots.deliveredAt })
        .from(playerManifestSnapshots)
        .where(and(
          eq(playerManifestSnapshots.screenId, device.screenId),
          eq(playerManifestSnapshots.version, reportedManifestVersion),
        ))
        .limit(1);
      const snapshotAgeMs = snapshot ? now.getTime() - snapshot.deliveredAt.getTime() : Number.POSITIVE_INFINITY;
      const playedBeforeDeliveryMs = snapshot ? snapshot.deliveredAt.getTime() - reportedPlaybackAt.getTime() : Number.POSITIVE_INFINITY;
      if (snapshot && snapshotAgeMs <= 24 * 60 * 60 * 1_000 && playedBeforeDeliveryMs <= 5 * 60 * 1_000) {
        manifestItem = snapshot.items.find((item) => item.id === itemId && item.source === source);
      }
    }

    if (!manifestItem) {
      return Response.json({ error: "Playback item is not in a recently delivered manifest" }, { status: 409 });
    }

    const minimumGapMs = Math.max(3_000, Math.min(30_000, manifestItem.durationSeconds * 700));
    const latestAllowedPlaybackAt = new Date(reportedPlaybackAt.getTime() - minimumGapMs);
    const isCurrentPlayback = ageMs <= 5 * 60 * 1_000;
    const reserved = await database
      .update(screens)
      .set({
        lastPlaybackAt: reportedPlaybackAt,
        ...(isCurrentPlayback ? {
          currentItemId: manifestItem.id,
          currentManifestVersion: reportedManifestVersion,
        } : {}),
        updatedAt: now,
      })
      .where(and(
        eq(screens.id, device.screenId),
        or(
          isNull(screens.lastPlaybackAt),
          lte(screens.lastPlaybackAt, latestAllowedPlaybackAt),
        ),
      ))
      .returning({ id: screens.id });

    if (reserved.length === 0) {
      return Response.json({ error: "Playback event arrived faster than the scheduled rotation" }, { status: 429 });
    }

    const inserted = await database
      .insert(playbackEvents)
      .values({
        screenId: device.screenId,
        campaignId: manifestItem.campaignId,
        creativeId: manifestItem.creativeId,
        providerEventId: eventId.slice(0, 255),
        playedAt: reportedPlaybackAt,
        durationSeconds: manifestItem.durationSeconds,
        metadata: {
          itemId: manifestItem.id,
          source: manifestItem.source,
          player: "neusecast-web",
          deviceId: device.deviceId,
          manifestVersion: reportedManifestVersion,
          sessionId: boundedText(payload.sessionId, 128),
          playerVersion: boundedText(payload.playerVersion, 80),
          receivedAt: now.toISOString(),
        },
      })
      .onConflictDoNothing({ target: playbackEvents.providerEventId })
      .returning({ id: playbackEvents.id });

    return Response.json({ ok: true, duplicate: inserted.length === 0, serverTime: now.toISOString() }, { status: 202 });
  } catch (error) {
    return playerDeviceAuthErrorResponse(error);
  }
}
