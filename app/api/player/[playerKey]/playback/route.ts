import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { playbackEvents, screens } from "@/lib/db/schema";

type PlaybackPayload = {
  eventId?: string;
  itemId?: string;
  source?: string;
  campaignId?: string | null;
  creativeId?: string | null;
  durationSeconds?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerKey: string }> },
) {
  const { playerKey } = await params;
  const payload = (await request.json().catch(() => null)) as PlaybackPayload | null;

  if (!payload?.eventId || !payload.itemId || !payload.source) {
    return Response.json({ error: "Invalid playback event" }, { status: 400 });
  }

  const database = getDatabase();
  const [screen] = await database
    .select({ id: screens.id })
    .from(screens)
    .where(and(eq(screens.provider, "neusecast"), eq(screens.providerScreenId, playerKey), eq(screens.active, true)))
    .limit(1);

  if (!screen) return Response.json({ error: "Screen not found" }, { status: 404 });

  await database
    .insert(playbackEvents)
    .values({
      screenId: screen.id,
      campaignId: payload.campaignId ?? null,
      creativeId: payload.creativeId ?? null,
      providerEventId: payload.eventId,
      playedAt: new Date(),
      durationSeconds: Math.max(1, Math.min(payload.durationSeconds ?? 0, 3600)),
      metadata: { itemId: payload.itemId, source: payload.source, player: "neusecast-web" },
    })
    .onConflictDoNothing({ target: playbackEvents.providerEventId });

  return Response.json({ ok: true }, { status: 202 });
}
