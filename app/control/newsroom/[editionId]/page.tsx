import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PlayerRuntime } from "@/components/player-runtime";
import { getDatabase } from "@/lib/db";
import { newsroomEditions } from "@/lib/db/schema";
import { newsroomItemFromEdition } from "@/lib/newsroom/scheduling";
import type { PlayerManifest } from "@/lib/player/types";

export default async function NewsroomEditionPreview({ params }: { params: Promise<{ editionId: string }> }) {
  const { editionId } = await params;
  const [edition] = await getDatabase().select().from(newsroomEditions).where(eq(newsroomEditions.id, editionId)).limit(1);
  if (!edition) notFound();
  const now = new Date();
  const item = newsroomItemFromEdition(edition);
  const manifest: PlayerManifest = {
    generatedAt: now.toISOString(),
    serverTime: now.toISOString(),
    version: `newsroom-preview-${edition.id}-${edition.revision}`,
    refreshAfterSeconds: 300,
    screen: { id: "newsroom-preview", name: "Newsroom preview", orientation: "landscape" },
    venue: { name: "NeuseCast Newsroom", city: "Eastern North Carolina", state: "", market: edition.market, timeZone: "America/New_York" },
    items: [item],
  };
  return <PlayerRuntime initialManifest={manifest} playerKey="newsroom-preview" preview embedded />;
}
