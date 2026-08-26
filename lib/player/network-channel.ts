import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, gte, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import {
  advertiserAccounts,
  campaigns,
  campaignScreens,
  creatives,
  generatedContent,
} from "@/lib/db/schema";
import { fillerRotationSeed, selectCompleteFillerRotation } from "@/lib/filler/selection";
import { resolveGeneratedArtwork, safeFillerVisualTemplate } from "@/lib/filler/artwork-policy";
import { interleaveRotation } from "./playlist";
import { getRegionalAlerts, getRegionalForecast, regionalWeatherItem } from "./weather";
import { insertNetworkIdents } from "./idents";
import type { PlayerItem, PlayerItemKind, PlayerManifest, PlayerTheme } from "./types";
import { latestPublishedNewsroomEdition, newsroomItemFromEdition } from "@/lib/newsroom/scheduling";

const THEMES = new Set<PlayerTheme>(["aqua", "navy", "coral", "gold", "blue", "green"]);
const KINDS = new Set<PlayerItemKind>(["advertisement", "host", "weather", "news", "event", "history", "trivia", "community", "ident"]);

function metadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function resolveTheme(metadata: Record<string, unknown> | null, fallback: PlayerTheme): PlayerTheme {
  const value = metadataString(metadata, "theme");
  return value && THEMES.has(value as PlayerTheme) ? value as PlayerTheme : fallback;
}

function resolveKind(category: string): PlayerItemKind {
  if (category === "did_you_know" || category === "fact") return "trivia";
  if (category === "on_this_day") return "history";
  return KINDS.has(category as PlayerItemKind) ? category as PlayerItemKind : "community";
}

function activeWindow(startsAt: AnyPgColumn, endsAt: AnyPgColumn, now: Date) {
  return and(or(isNull(startsAt), lte(startsAt, now)), or(isNull(endsAt), gte(endsAt, now)));
}

function boundedDuration(value: unknown, fallback = 12) {
  const duration = typeof value === "number" ? value : Number(value);
  return Number.isFinite(duration) ? Math.max(3, Math.min(Math.round(duration), 3_600)) : fallback;
}

export async function getNetworkChannelManifest(): Promise<PlayerManifest> {
  await ensureScreenManagementSchema();
  const database = getDatabase();
  const now = new Date();

  const [creativeRows, generatedRows, regionalForecast, regionalAlerts, newsroomEdition] = await Promise.all([
    database
      .selectDistinct({
        id: creatives.id,
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
      .innerJoin(campaignScreens, eq(campaignScreens.campaignId, campaigns.id))
      .where(and(
        eq(advertiserAccounts.active, true),
        eq(advertiserAccounts.subscriptionStatus, "active"),
        eq(campaigns.billingPaused, false),
        eq(creatives.status, "approved"),
        inArray(campaigns.status, ["approved", "scheduled", "active"]),
        activeWindow(campaigns.startsAt, campaigns.endsAt, now),
      ))
      .orderBy(creatives.id),
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
        updatedAt: generatedContent.updatedAt,
      })
      .from(generatedContent)
      .where(and(
        eq(generatedContent.approved, true),
        activeWindow(generatedContent.startsAt, generatedContent.expiresAt, now),
      ))
      .orderBy(desc(generatedContent.updatedAt))
      .limit(200),
    getRegionalForecast().catch((error) => {
      console.error("NeuseCast Watch could not refresh the regional NWS forecast", error);
      return null;
    }),
    getRegionalAlerts().catch((error) => {
      console.error("NeuseCast Watch could not refresh regional NWS alerts", error);
      return [];
    }),
    latestPublishedNewsroomEdition("Eastern North Carolina", now, { networkFallback: true }),
  ]);

  const advertisements: PlayerItem[] = creativeRows.map((row) => ({
    id: `network-ad-${createHash("sha256").update(row.id).digest("hex").slice(0, 18)}`,
    kind: "advertisement",
    source: "creative",
    campaignId: null,
    creativeId: null,
    durationSeconds: boundedDuration(row.durationSeconds, 15),
    eyebrow: metadataString(row.metadata, "eyebrow") ?? "Local business",
    title: row.headline ?? row.name,
    body: row.body ?? "Proudly serving Eastern Carolina.",
    callToAction: row.callToAction,
    mediaUrl: row.mediaUrl,
    theme: resolveTheme(row.metadata, "coral"),
    sponsor: metadataString(row.metadata, "sponsor"),
    contentCategory: null,
    mediaCredit: metadataString(row.metadata, "mediaCredit"),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }));

  const eligibleGeneratedRows = (regionalForecast
    ? generatedRows.filter((row) => row.category !== "weather")
    : generatedRows).map((row) => {
      const artwork = resolveGeneratedArtwork(row.artworkUrl, row.metadata);
      return {
        ...row,
        artworkUrl: artwork?.url ?? null,
        artworkCredit: artwork?.credit ?? null,
        visualTemplate: safeFillerVisualTemplate(
          row.category,
          metadataString(row.metadata, "visualTemplate"),
          Boolean(artwork),
        ),
      };
    });
  const rotationSeed = fillerRotationSeed("network", now.getTime());
  const fillerItems: PlayerItem[] = selectCompleteFillerRotation(eligibleGeneratedRows, rotationSeed).map((row) => ({
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
    contentCategory: row.category,
    mediaCredit: row.artworkCredit,
    visualTemplate: row.visualTemplate,
    locationLabel: metadataString(row.metadata, "locationLabel"),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  }));
  if (regionalForecast) fillerItems.unshift(regionalWeatherItem(regionalForecast));

  // Venue-specific host posts are deliberately excluded from the public channel.
  const baseItems = insertNetworkIdents(
    interleaveRotation(advertisements, [], fillerItems),
    "network-live",
  );
  const items = newsroomEdition
    ? [...baseItems.slice(0, Math.min(2, baseItems.length)), newsroomItemFromEdition(newsroomEdition), ...baseItems.slice(Math.min(2, baseItems.length))]
    : baseItems;
  const version = createHash("sha256")
    .update(JSON.stringify({ alerts: regionalAlerts, items }))
    .digest("hex")
    .slice(0, 24);

  return {
    generatedAt: now.toISOString(),
    serverTime: now.toISOString(),
    version,
    refreshAfterSeconds: 60,
    screen: { id: "network-live", name: "NeuseCast Network", orientation: "landscape" },
    venue: {
      name: "NeuseCast Network",
      city: "Eastern North Carolina",
      state: "",
      market: "Network-wide",
      timeZone: "America/New_York",
    },
    alerts: regionalAlerts,
    items,
  };
}
