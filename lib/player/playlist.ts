import { createHash } from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNull, lte, max, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDatabase } from "@/lib/db";
import {
  campaigns,
  campaignScreens,
  advertiserAccounts,
  creatives,
  generatedContent,
  hostContent,
  playbackEvents,
  screenAdvertiserBlocks,
  screens,
  venues,
} from "@/lib/db/schema";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { fillerRotationSeed, selectCompleteFillerRotation } from "@/lib/filler/selection";
import { resolveGeneratedArtwork, safeFillerVisualTemplate } from "@/lib/filler/artwork-policy";
import type { PlayerItem, PlayerItemKind, PlayerManifest, PlayerTheme } from "./types";
import { broadcastDayWindow } from "@/lib/time-zone";
import { getRegionalAlerts, getRegionalForecast, regionalWeatherItem } from "./weather";
import { insertNetworkIdents } from "./idents";
import { interleaveRotation } from "./interleave";
import { generatedContentMarketsForScreen } from "./content-markets";
import {
  insertNewsroomAfterCurrent,
  latestPublishedNewsroomEdition,
  newsroomItemFromEdition,
  newsroomMinimumGapMinutes,
} from "@/lib/newsroom/scheduling";

const THEMES = new Set<PlayerTheme>(["aqua", "navy", "coral", "gold", "blue", "green"]);
const KINDS = new Set<PlayerItemKind>(["advertisement", "host", "weather", "news", "event", "history", "trivia", "community", "ident"]);
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
  return KINDS.has(category as PlayerItemKind) ? (category as PlayerItemKind) : "community";
}

function activeWindow(startsAt: AnyPgColumn, endsAt: AnyPgColumn, now: Date) {
  return and(or(isNull(startsAt), lte(startsAt, now)), or(isNull(endsAt), gte(endsAt, now)));
}

function boundedDuration(value: unknown, fallback = 12) {
  const duration = typeof value === "number" ? value : Number(value);
  return Number.isFinite(duration) ? Math.max(3, Math.min(Math.round(duration), 3_600)) : fallback;
}

export async function getPlayerManifest(
  playerKey: string,
  options: { includeInactive?: boolean } = {},
): Promise<PlayerManifest | null> {
  await ensureScreenManagementSchema();
  const database = getDatabase();
  const now = new Date();
  const regionalForecastPromise = getRegionalForecast().catch((error) => {
    console.error("NeuseCast could not refresh the regional NWS forecast", error);
    return null;
  });
  const regionalAlertsPromise = getRegionalAlerts().catch((error) => {
    console.error("NeuseCast could not refresh regional NWS alerts", error);
    return [];
  });

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
      currentItemId: screens.currentItemId,
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

  const broadcastDay = broadcastDayWindow(now, screen.timeZone);

  const newsroomGapMinutes = newsroomMinimumGapMinutes();
  const [creativeRows, hostRows, generatedRows, blockedRows, playbackRows, recentPlaybackRows, regionalForecast, regionalAlerts, newsroomEdition] = await Promise.all([
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
        scheduledPlaysPerDay: campaignScreens.scheduledPlaysPerDay,
      })
      .from(creatives)
      .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
      .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
      .innerJoin(campaignScreens, and(
        eq(campaignScreens.campaignId, campaigns.id),
        eq(campaignScreens.screenId, screen.id),
      ))
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
        updatedAt: generatedContent.updatedAt,
      })
      .from(generatedContent)
      .where(
        and(
          eq(generatedContent.approved, true),
          or(
            isNull(generatedContent.market),
            inArray(generatedContent.market, generatedContentMarketsForScreen(screen.market)),
          ),
          activeWindow(generatedContent.startsAt, generatedContent.expiresAt, now),
        ),
      )
      .orderBy(desc(generatedContent.updatedAt))
      .limit(200),
    database
      .select({ advertiserAccountId: screenAdvertiserBlocks.advertiserAccountId })
      .from(screenAdvertiserBlocks)
      .where(eq(screenAdvertiserBlocks.screenId, screen.id)),
    database
      .select({
        campaignId: playbackEvents.campaignId,
        plays: count(playbackEvents.id),
        lastPlayedAt: max(playbackEvents.playedAt),
      })
      .from(playbackEvents)
      .where(and(
        eq(playbackEvents.screenId, screen.id),
        gte(playbackEvents.playedAt, broadcastDay.start),
        lte(playbackEvents.playedAt, now),
      ))
      .groupBy(playbackEvents.campaignId),
    database
      .select({ metadata: playbackEvents.metadata })
      .from(playbackEvents)
      .where(and(
        eq(playbackEvents.screenId, screen.id),
        gte(playbackEvents.playedAt, new Date(now.getTime() - newsroomGapMinutes * 60 * 1_000)),
        lte(playbackEvents.playedAt, now),
      )),
    regionalForecastPromise,
    regionalAlertsPromise,
    latestPublishedNewsroomEdition(screen.market, now, { networkFallback: true }),
  ]);

  const blockedAdvertisers = new Set(blockedRows.map((row) => row.advertiserAccountId));
  const playbackByCampaign = new Map(playbackRows.map((row) => [row.campaignId, row]));
  const broadcastDayLengthMs = broadcastDay.end.getTime() - broadcastDay.start.getTime();
  const dueCreativeRows = creativeRows.filter((row) => {
    if (blockedAdvertisers.has(row.advertiserAccountId)) return false;
    const target = Math.max(1, row.scheduledPlaysPerDay ?? 12);
    const delivery = playbackByCampaign.get(row.campaignId);
    const delivered = delivery?.plays ?? 0;
    if (delivered >= target) return false;

    const intervalMs = broadcastDayLengthMs / target;
    const nextScheduledAt = broadcastDay.start.getTime() + (delivered * intervalMs);
    const minimumRecoveryGapMs = Math.max(15 * 60_000, intervalMs / 2);
    const lastPlayedAt = delivery?.lastPlayedAt?.getTime() ?? 0;
    return now.getTime() >= nextScheduledAt
      && (!lastPlayedAt || now.getTime() - lastPlayedAt >= minimumRecoveryGapMs);
  }).sort((left, right) => {
    const leftDelivery = playbackByCampaign.get(left.campaignId);
    const rightDelivery = playbackByCampaign.get(right.campaignId);
    return (leftDelivery?.lastPlayedAt?.getTime() ?? 0) - (rightDelivery?.lastPlayedAt?.getTime() ?? 0);
  });
  const advertisements: PlayerItem[] = dueCreativeRows.map((row) => ({
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
    contentCategory: null,
    mediaCredit: metadataString(row.metadata, "mediaCredit"),
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
    contentCategory: row.template,
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
  const rotationSeed = fillerRotationSeed(`screen:${screen.id}`, now.getTime());
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

  const baseItems = insertNetworkIdents(
    interleaveRotation(advertisements, hostItems, fillerItems),
    `screen:${screen.id}`,
  );
  const newsroomPlayedRecently = recentPlaybackRows.some((row) => (
    row.metadata?.source === "newsroom"
    && typeof row.metadata.receivedAt === "string"
    && now.getTime() - Date.parse(row.metadata.receivedAt) < newsroomGapMinutes * 60 * 1_000
  ));
  const items = insertNewsroomAfterCurrent(
    baseItems,
    newsroomEdition && !newsroomPlayedRecently ? newsroomItemFromEdition(newsroomEdition) : null,
    screen.currentItemId,
  );
  const version = createHash("sha256")
    .update(JSON.stringify({
      screen: { id: screen.id, orientation: screen.orientation },
      venue: { id: screen.venueId, timeZone: screen.timeZone },
      alerts: regionalAlerts,
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
    alerts: regionalAlerts,
    items,
  };
}
