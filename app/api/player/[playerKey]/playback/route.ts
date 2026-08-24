import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { playbackEvents, playerManifestSnapshots } from "@/lib/db/schema";
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
    const playbackMetadata = {
      itemId: manifestItem.id,
      source: manifestItem.source,
      player: "neusecast-web",
      deviceId: device.deviceId,
      manifestVersion: reportedManifestVersion,
      sessionId: boundedText(payload.sessionId, 128),
      playerVersion: boundedText(payload.playerVersion, 80),
      receivedAt: now.toISOString(),
    };
    const result = await database.execute(sql<{ reserved: boolean; inserted: boolean }>`
      WITH reserved_screen AS (
        UPDATE "screens"
        SET
          "last_playback_at" = ${reportedPlaybackAt},
          "current_item_id" = CASE WHEN ${isCurrentPlayback} THEN ${manifestItem.id} ELSE "current_item_id" END,
          "current_manifest_version" = CASE WHEN ${isCurrentPlayback} THEN ${reportedManifestVersion} ELSE "current_manifest_version" END,
          "updated_at" = ${now}
        WHERE
          "id" = ${device.screenId}
          AND ("last_playback_at" IS NULL OR "last_playback_at" <= ${latestAllowedPlaybackAt})
        RETURNING "id"
      ),
      inserted_event AS (
        INSERT INTO "playback_events" (
          "screen_id", "campaign_id", "creative_id", "provider_event_id",
          "played_at", "duration_seconds", "metadata"
        )
        SELECT
          ${device.screenId}, ${manifestItem.campaignId}, ${manifestItem.creativeId}, ${eventId.slice(0, 255)},
          ${reportedPlaybackAt}, ${manifestItem.durationSeconds}, ${JSON.stringify(playbackMetadata)}::jsonb
        FROM reserved_screen
        ON CONFLICT ("provider_event_id") DO NOTHING
        RETURNING "id"
      )
      SELECT
        EXISTS(SELECT 1 FROM reserved_screen) AS "reserved",
        EXISTS(SELECT 1 FROM inserted_event) AS "inserted"
    `);
    const outcome = result.rows[0] as { reserved: boolean; inserted: boolean } | undefined;

    if (!outcome?.reserved) {
      const [duplicateAfterReservation] = await database
        .select({ id: playbackEvents.id })
        .from(playbackEvents)
        .where(eq(playbackEvents.providerEventId, eventId))
        .limit(1);
      if (duplicateAfterReservation) {
        return Response.json({ ok: true, duplicate: true, serverTime: now.toISOString() }, { status: 202 });
      }
      return Response.json({ error: "Playback event arrived faster than the scheduled rotation" }, { status: 429 });
    }

    return Response.json({ ok: true, duplicate: !outcome.inserted, serverTime: now.toISOString() }, { status: 202 });
  } catch (error) {
    return playerDeviceAuthErrorResponse(error);
  }
}
