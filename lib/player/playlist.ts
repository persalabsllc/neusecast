import { and, eq, inArray, isNull, lte, or, gte } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDatabase } from "@/lib/db";
import {
  campaigns,
  campaignScreens,
  creatives,
  generatedContent,
  hostContent,
  screens,
  venues,
} from "@/lib/db/schema";
import type { PlayerItem, PlayerItemKind, PlayerManifest, PlayerTheme } from "./types";
import { NEUSECAST_PLAN } from "@/lib/pricing";

const THEMES = new Set<PlayerTheme>(["aqua", "navy", "coral", "gold", "blue", "green"]);
const KINDS = new Set<PlayerItemKind>(["advertisement", "host", "weather", "event", "history", "trivia", "community"]);

function metadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function resolveTheme(metadata: Record<string, unknown> | null, fallback: PlayerTheme): PlayerTheme {
  const value = metadataString(metadata, "theme");
  return value && THEMES.has(value as PlayerTheme) ? (value as PlayerTheme) : fallback;
}

function resolveKind(category: string): PlayerItemKind {
  return KINDS.has(category as PlayerItemKind) ? (category as PlayerItemKind) : "community";
}

function activeWindow(startsAt: AnyPgColumn, endsAt: AnyPgColumn, now: Date) {
  return and(or(isNull(startsAt), lte(startsAt, now)), or(isNull(endsAt), gte(endsAt, now)));
}

function interleaveRotation(advertisements: PlayerItem[], hostItems: PlayerItem[], fillerItems: PlayerItem[]) {
  const rotation: PlayerItem[] = [];
  const support = [...hostItems, ...fillerItems];
  const max = Math.max(advertisements.length, support.length);

  for (let index = 0; index < max; index += 1) {
    const advertisement = advertisements[index % Math.max(advertisements.length, 1)];
    const supportingItem = support[index % Math.max(support.length, 1)];

    if (advertisements.length > 0 && !rotation.some((item) => item.id === advertisement.id)) rotation.push(advertisement);
    if (support.length > 0 && !rotation.some((item) => item.id === supportingItem.id)) rotation.push(supportingItem);
  }

  return rotation;
}

export async function getPlayerManifest(playerKey: string): Promise<PlayerManifest | null> {
  const database = getDatabase();
  const now = new Date();

  const [screen] = await database
    .select({
      id: screens.id,
      name: screens.name,
      orientation: screens.orientation,
      venueId: venues.id,
      venueName: venues.name,
      city: venues.city,
      state: venues.state,
      market: venues.market,
    })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .where(and(eq(screens.provider, "neusecast"), eq(screens.providerScreenId, playerKey), eq(screens.active, true)))
    .limit(1);

  if (!screen) return null;

  const [creativeRows, hostRows, generatedRows] = await Promise.all([
    database
      .selectDistinct({
        id: creatives.id,
        campaignId: campaigns.id,
        name: creatives.name,
        headline: creatives.headline,
        body: creatives.body,
        callToAction: creatives.callToAction,
        mediaUrl: creatives.mediaUrl,
        durationSeconds: creatives.durationSeconds,
        metadata: creatives.metadata,
      })
      .from(creatives)
      .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
      .leftJoin(campaignScreens, eq(campaignScreens.campaignId, campaigns.id))
      .where(
        and(
          or(eq(campaignScreens.screenId, screen.id), eq(campaigns.totalCents, NEUSECAST_PLAN.amountCents)),
          eq(creatives.status, "approved"),
          inArray(campaigns.status, ["approved", "scheduled", "active"]),
          activeWindow(campaigns.startsAt, campaigns.endsAt, now),
        ),
      ),
    database
      .select({
        id: hostContent.id,
        headline: hostContent.headline,
        body: hostContent.body,
        callToAction: hostContent.callToAction,
        mediaUrl: hostContent.mediaUrl,
        template: hostContent.template,
      })
      .from(hostContent)
      .where(
        and(
          eq(hostContent.venueId, screen.venueId),
          inArray(hostContent.status, ["approved", "scheduled"]),
          activeWindow(hostContent.startsAt, hostContent.endsAt, now),
        ),
      ),
    database
      .select({
        id: generatedContent.id,
        category: generatedContent.category,
        title: generatedContent.title,
        body: generatedContent.body,
        sourceName: generatedContent.sourceName,
        artworkUrl: generatedContent.artworkUrl,
        metadata: generatedContent.metadata,
      })
      .from(generatedContent)
      .where(
        and(
          eq(generatedContent.approved, true),
          or(isNull(generatedContent.market), eq(generatedContent.market, screen.market)),
          activeWindow(generatedContent.startsAt, generatedContent.expiresAt, now),
        ),
      ),
  ]);

  const advertisements: PlayerItem[] = creativeRows.map((row) => ({
    id: row.id,
    kind: "advertisement",
    source: "creative",
    campaignId: row.campaignId,
    creativeId: row.id,
    durationSeconds: row.durationSeconds,
    eyebrow: metadataString(row.metadata, "eyebrow") ?? "Local business",
    title: row.headline ?? row.name,
    body: row.body ?? "Proudly serving Eastern Carolina.",
    callToAction: row.callToAction,
    mediaUrl: row.mediaUrl,
    theme: resolveTheme(row.metadata, "coral"),
    sponsor: metadataString(row.metadata, "sponsor"),
  }));

  const hostItems: PlayerItem[] = hostRows.map((row) => ({
    id: row.id,
    kind: "host",
    source: "host_content",
    campaignId: null,
    creativeId: null,
    durationSeconds: 12,
    eyebrow: "From your host",
    title: row.headline,
    body: row.body ?? `Now at ${screen.venueName}.`,
    callToAction: row.callToAction,
    mediaUrl: row.mediaUrl,
    theme: THEMES.has(row.template as PlayerTheme) ? (row.template as PlayerTheme) : "aqua",
    sponsor: screen.venueName,
  }));

  const fillerItems: PlayerItem[] = generatedRows.map((row) => ({
    id: row.id,
    kind: resolveKind(row.category),
    source: "generated_content",
    campaignId: null,
    creativeId: null,
    durationSeconds: Number(row.metadata?.durationSeconds) || 12,
    eyebrow: metadataString(row.metadata, "eyebrow") ?? row.category,
    title: row.title,
    body: row.body,
    callToAction: metadataString(row.metadata, "callToAction"),
    mediaUrl: row.artworkUrl,
    theme: resolveTheme(row.metadata, "navy"),
    sponsor: row.sourceName,
  }));

  return {
    generatedAt: now.toISOString(),
    refreshAfterSeconds: 180,
    screen: { id: screen.id, name: screen.name, orientation: screen.orientation },
    venue: {
      name: screen.venueName,
      city: screen.city,
      state: screen.state,
      market: screen.market,
    },
    items: interleaveRotation(advertisements, hostItems, fillerItems),
  };
}
