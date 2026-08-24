import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or, gte } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDatabase } from "@/lib/db";
import {
  campaigns,
  advertiserAccounts,
  creatives,
  generatedContent,
  hostContent,
  screenAdvertiserBlocks,
  screens,
  venues,
} from "@/lib/db/schema";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { selectBalancedFiller } from "@/lib/filler/selection";
import type { PlayerItem, PlayerItemKind, PlayerManifest, PlayerTheme } from "./types";
import { NEUSECAST_HOUSE_AD } from "./house-ad";

const THEMES = new Set<PlayerTheme>(["aqua", "navy", "coral", "gold", "blue", "green"]);
const KINDS = new Set<PlayerItemKind>(["advertisement", "host", "weather", "event", "history", "trivia", "community"]);
const HOST_THEMES: Record<string, PlayerTheme> = { special: "coral", event: "aqua", announcement: "blue", menu: "gold" };

function metadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function resolveTheme(metadata: Record<string, unknown> | null, fallback: PlayerTheme): PlayerTheme {
  const value = metadataString(metadata, "theme");
  return value && THEMES.has(value as PlayerTheme) ? (value as PlayerTheme) : fallback;
}

function resolveKind(category: string): PlayerItemKind {
  if (category === "did_you_know" || category === "fact") return "trivia";
  if (category === "on_this_day") return "history";
  if (category === "news") return "community";
  return KINDS.has(category as PlayerItemKind) ? (category as PlayerItemKind) : "community";
}

function activeWindow(startsAt: AnyPgColumn, endsAt: AnyPgColumn, now: Date) {
  return and(or(isNull(startsAt), lte(startsAt, now)), or(isNull(endsAt), gte(endsAt, now)));
}

function boundedDuration(value: unknown, fallback = 12) {
  const duration = typeof value === "number" ? value : Number(value);
  return Number.isFinite(duration) ? Math.max(3, Math.min(Math.round(duration), 3_600)) : fallback;
}

function interleaveSupport(hostItems: PlayerItem[], fillerItems: PlayerItem[]) {
  const support: PlayerItem[] = [];
  const max = Math.max(hostItems.length, fillerItems.length);
  for (let index = 0; index < max; index += 1) {
    if (hostItems[index]) support.push(hostItems[index]);
    if (fillerItems[index]) support.push(fillerItems[index]);
  }
  return support;
}

function interleaveRotation(advertisements: PlayerItem[], hostItems: PlayerItem[], fillerItems: PlayerItem[]) {
  const support = interleaveSupport(hostItems, fillerItems);
  const paidSlots = advertisements.length
    ? Math.max(advertisements.length, Math.ceil(support.length / 3))
    : 0;
  const baseLength = paidSlots + support.length;
  const base: PlayerItem[] = [];
  let paidIndex = 0;
  let supportIndex = 0;

  for (let position = 0; position < baseLength; position += 1) {
    const expectedPaid = Math.floor(((position + 1) * paidSlots) / Math.max(baseLength, 1));
    if (paidIndex < expectedPaid && advertisements.length) {
      base.push(advertisements[paidIndex % advertisements.length]);
      paidIndex += 1;
    } else if (support[supportIndex]) {
      base.push(support[supportIndex]);
      supportIndex += 1;
    } else if (advertisements.length) {
      base.push(advertisements[paidIndex % advertisements.length]);
      paidIndex += 1;
    }
  }

  const rotation: PlayerItem[] = [];
  for (const item of base) {
    rotation.push(item);
    if (rotation.length % 7 === 6) rotation.push(NEUSECAST_HOUSE_AD);
  }
  if (!rotation.some((item) => item.id === NEUSECAST_HOUSE_AD.id)) rotation.push(NEUSECAST_HOUSE_AD);
  return rotation;
}

export async function getPlayerManifest(
  playerKey: string,
  options: { includeInactive?: boolean } = {},
): Promise<PlayerManifest | null> {
  await ensureScreenManagementSchema();
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
      timeZone: venues.timeZone,
    })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .where(and(
      eq(screens.provider, "neusecast"),
      eq(screens.providerScreenId, playerKey),
      options.includeInactive ? undefined : eq(screens.active, true),
    ))
    .limit(1);

  if (!screen) return null;

  const [creativeRows, hostRows, generatedRows, blockedRows] = await Promise.all([
    database
      .selectDistinct({
        id: creatives.id,
        advertiserAccountId: campaigns.advertiserAccountId,
        campaignId: campaigns.id,
        name: creatives.name,
        headline: creatives.headline,
        body: creatives.body,
        callToAction: creatives.callToAction,
        mediaUrl: creatives.mediaUrl,
        durationSeconds: creatives.durationSeconds,
        metadata: creatives.metadata,
        expiresAt: campaigns.endsAt,
      })
      .from(creatives)
      .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
      .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
      .where(
        and(
          eq(advertiserAccounts.active, true),
          eq(advertiserAccounts.subscriptionStatus, "active"),
          eq(campaigns.billingPaused, false),
          eq(creatives.status, "approved"),
          inArray(campaigns.status, ["approved", "scheduled", "active"]),
          activeWindow(campaigns.startsAt, campaigns.endsAt, now),
        ),
      )
      .orderBy(creatives.id),
    database
      .select({
        id: hostContent.id,
        headline: hostContent.headline,
        body: hostContent.body,
        callToAction: hostContent.callToAction,
        mediaUrl: hostContent.mediaUrl,
        template: hostContent.template,
        expiresAt: hostContent.endsAt,
      })
      .from(hostContent)
      .where(
        and(
          or(
            eq(hostContent.screenId, screen.id),
            and(isNull(hostContent.screenId), eq(hostContent.venueId, screen.venueId)),
          ),
          inArray(hostContent.status, ["approved", "scheduled"]),
          activeWindow(hostContent.startsAt, hostContent.endsAt, now),
        ),
      )
      .orderBy(hostContent.id),
    database
      .select({
        id: generatedContent.id,
        category: generatedContent.category,
        title: generatedContent.title,
        body: generatedContent.body,
        sourceName: generatedContent.sourceName,
        artworkUrl: generatedContent.artworkUrl,
        metadata: generatedContent.metadata,
        expiresAt: generatedContent.expiresAt,
      })
      .from(generatedContent)
      .where(
        and(
          eq(generatedContent.approved, true),
          or(isNull(generatedContent.market), eq(generatedContent.market, screen.market)),
          activeWindow(generatedContent.startsAt, generatedContent.expiresAt, now),
        ),
      )
      .orderBy(desc(generatedContent.updatedAt))
      .limit(200),
    database
      .select({ advertiserAccountId: screenAdvertiserBlocks.advertiserAccountId })
      .from(screenAdvertiserBlocks)
      .where(eq(screenAdvertiserBlocks.screenId, screen.id)),
  ]);

  const blockedAdvertisers = new Set(blockedRows.map((row) => row.advertiserAccountId));
  const advertisements: PlayerItem[] = creativeRows.filter((row) => !blockedAdvertisers.has(row.advertiserAccountId)).map((row) => ({
    id: row.id,
    kind: "advertisement",
    source: "creative",
    campaignId: row.campaignId,
    creativeId: row.id,
    durationSeconds: boundedDuration(row.durationSeconds, 15),
    eyebrow: metadataString(row.metadata, "eyebrow") ?? "Local business",
    title: row.headline ?? row.name,
    body: row.body ?? "Proudly serving Eastern Carolina.",
    callToAction: row.callToAction,
    mediaUrl: row.mediaUrl,
    theme: resolveTheme(row.metadata, "coral"),
    sponsor: metadataString(row.metadata, "sponsor"),
    expiresAt: row.expiresAt?.toISOString() ?? null,
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
    theme: THEMES.has(row.template as PlayerTheme) ? (row.template as PlayerTheme) : HOST_THEMES[row.template] ?? "aqua",
    sponsor: screen.venueName,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }));

  const fillerItems: PlayerItem[] = selectBalancedFiller(generatedRows).map((row) => ({
    id: row.id,
    kind: resolveKind(row.category),
    source: "generated_content",
    campaignId: null,
    creativeId: null,
    durationSeconds: boundedDuration(row.metadata?.durationSeconds),
    eyebrow: metadataString(row.metadata, "eyebrow") ?? row.category,
    title: row.title,
    body: row.body,
    callToAction: metadataString(row.metadata, "callToAction"),
    mediaUrl: row.artworkUrl,
    theme: resolveTheme(row.metadata, "navy"),
    sponsor: row.sourceName,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }));

  const items = interleaveRotation(advertisements, hostItems, fillerItems);
  const version = createHash("sha256")
    .update(JSON.stringify({
      screen: { id: screen.id, orientation: screen.orientation },
      venue: { id: screen.venueId, timeZone: screen.timeZone },
      items,
    }))
    .digest("hex")
    .slice(0, 24);

  return {
    generatedAt: now.toISOString(),
    serverTime: now.toISOString(),
    version,
    refreshAfterSeconds: 180,
    screen: { id: screen.id, name: screen.name, orientation: screen.orientation },
    venue: {
      name: screen.venueName,
      city: screen.city,
      state: screen.state,
      market: screen.market,
      timeZone: screen.timeZone,
    },
    items,
  };
}
