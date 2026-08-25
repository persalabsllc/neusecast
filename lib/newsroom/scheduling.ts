import "server-only";

import { and, desc, eq, gt, lte, or } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { newsroomEditions } from "@/lib/db/schema";
import type { PlayerItem, PlayerNewsroomEdition } from "@/lib/player/types";

export const NEWSROOM_DEFAULT_GAP_MINUTES = 55;

function boundedDuration(value: number) {
  return Math.max(180, Math.min(300, Math.round(value)));
}

export function newsroomMinimumGapMinutes() {
  const configured = Number(process.env.NEWSROOM_MINIMUM_GAP_MINUTES);
  return Number.isFinite(configured)
    ? Math.max(30, Math.min(180, Math.round(configured)))
    : NEWSROOM_DEFAULT_GAP_MINUTES;
}

export async function latestPublishedNewsroomEdition(
  market: string,
  now = new Date(),
  options: { networkFallback?: boolean } = {},
) {
  const marketFilter = options.networkFallback
    ? or(
        eq(newsroomEditions.market, market),
        eq(newsroomEditions.market, "Eastern North Carolina"),
        eq(newsroomEditions.market, "Network-wide"),
      )
    : eq(newsroomEditions.market, market);

  const [edition] = await getDatabase()
    .select()
    .from(newsroomEditions)
    .where(and(
      marketFilter,
      eq(newsroomEditions.status, "published"),
      lte(newsroomEditions.scheduledAt, now),
      gt(newsroomEditions.expiresAt, now),
    ))
    .orderBy(desc(newsroomEditions.publishedAt), desc(newsroomEditions.updatedAt))
    .limit(1);

  return edition ?? null;
}

export function newsroomItemFromEdition(
  edition: NonNullable<Awaited<ReturnType<typeof latestPublishedNewsroomEdition>>>,
): PlayerItem {
  const stories = edition.stories ?? [];
  const packageData: PlayerNewsroomEdition = {
    id: edition.id,
    label: edition.label,
    updatedAt: edition.updatedAt.toISOString(),
    ticker: edition.ticker ?? stories.map((story) => story.ticker).join("     •     "),
    videoUrl: edition.videoUrl,
    posterUrl: edition.posterUrl,
    revision: edition.revision,
    stories,
  };

  return {
    id: `newsroom-${edition.id}-r${edition.revision}`,
    kind: "news",
    source: "newsroom",
    campaignId: null,
    creativeId: null,
    durationSeconds: boundedDuration(edition.durationSeconds),
    eyebrow: "NeuseCast Newsroom",
    title: edition.headline,
    body: stories[0]?.summary ?? "Your hyperlocal Eastern North Carolina news update.",
    callToAction: "NeuseCast.com",
    mediaUrl: edition.posterUrl ?? stories.find((story) => story.imageUrl)?.imageUrl ?? null,
    theme: "blue",
    sponsor: "NeuseCast Newsroom",
    contentCategory: "newsroom_edition",
    mediaCredit: null,
    visualTemplate: "broadcast",
    locationLabel: edition.market,
    newsroomEdition: packageData,
    expiresAt: edition.expiresAt.toISOString(),
  };
}

export function insertNewsroomAfterCurrent(
  items: PlayerItem[],
  newsroomItem: PlayerItem | null,
  currentItemId: string | null,
) {
  if (!newsroomItem || items.some((item) => item.id === newsroomItem.id)) return items;
  const currentIndex = currentItemId ? items.findIndex((item) => item.id === currentItemId) : -1;
  const insertAt = currentIndex >= 0 ? currentIndex + 1 : Math.min(2, items.length);
  return [...items.slice(0, insertAt), newsroomItem, ...items.slice(insertAt)];
}
