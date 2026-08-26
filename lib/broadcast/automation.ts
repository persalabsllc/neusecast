import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import {
  broadcastAgentHeartbeats,
  broadcastOutputs,
  broadcastTickerItems,
  newsroomStories,
} from "@/lib/db/schema";
import { latestPublishedNewsroomEdition } from "@/lib/newsroom/scheduling";
import { effectiveNewsroomExpiry } from "@/lib/newsroom/windows";
import { getRegionalAlerts, getRegionalForecast } from "@/lib/player/weather";

const MAIN_OUTPUT_SLUG = "main";
const MAX_NEWSROOM_TICKERS = 5;
const MAX_ALERT_TICKERS = 4;
const MAX_TICKER_MESSAGE_LENGTH = 300;
const WEATHER_SOURCE_NAME = "National Weather Service · Newport/Morehead City";
const WEATHER_SOURCE_URL = "https://www.weather.gov/mhx/";

const AUTOMATION_PREFIXES = {
  forecast: "studio:auto:nws:forecast:",
  alerts: "studio:auto:nws:alert:",
  newsroom: "studio:auto:newsroom:",
} as const;

type AutomationSource = keyof typeof AUTOMATION_PREFIXES;
type TickerPriority = "routine" | "important" | "urgent" | "emergency";

type AutomatedTicker = {
  automationKey: string;
  message: string;
  priority: TickerPriority;
  sourceName: string;
  sourceUrl: string;
  startsAt: Date;
  expiresAt: Date;
  minimumIntervalSeconds: number;
  metadata: Record<string, unknown>;
};

type WeatherOverlay = {
  temperature: string;
  temperatureText: string;
  condition: string;
  shortForecast: string;
  location: string;
  updatedAt: string;
  expiresAt: string;
};

type SourceSummary = {
  refreshed: boolean;
  itemCount: number;
  detail: string | null;
};

export type BroadcastAutomationResult = {
  ok: boolean;
  outputId: string;
  outputSlug: string;
  activeAutomatedItems: number;
  upsertedItems: number;
  expiredItems: number;
  prunedHeartbeats: number;
  sources: Record<AutomationSource, SourceSummary>;
  errors: string[];
};

function singleLine(value: unknown, maximum = MAX_TICKER_MESSAGE_LENGTH) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

function stableSuffix(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function excluded(column: { name: string }) {
  return sql.raw(`excluded.${column.name}`);
}

function parsedDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function futureExpiry(
  value: string | null | undefined,
  now: Date,
  fallbackMilliseconds: number,
  maximumMilliseconds: number,
) {
  const parsed = parsedDate(value);
  const fallback = new Date(now.getTime() + fallbackMilliseconds);
  if (!parsed || parsed <= now) return fallback;
  return new Date(Math.min(parsed.getTime(), now.getTime() + maximumMilliseconds));
}

function currentForecastPeriod(
  forecast: Awaited<ReturnType<typeof getRegionalForecast>>,
  now: Date,
) {
  const nowMilliseconds = now.getTime();
  return forecast.periods.find((period) => {
    const startsAt = parsedDate(period.startsAt)?.getTime();
    const endsAt = parsedDate(period.endsAt)?.getTime();
    return startsAt !== undefined && startsAt !== null
      && endsAt !== undefined && endsAt !== null
      && startsAt <= nowMilliseconds
      && endsAt > nowMilliseconds;
  }) ?? forecast.periods.find((period) => (
    (parsedDate(period.endsAt)?.getTime() ?? 0) > nowMilliseconds
  )) ?? forecast.periods[0];
}

function forecastTicker(
  forecast: Awaited<ReturnType<typeof getRegionalForecast>>,
  now: Date,
): { ticker: AutomatedTicker; overlay: WeatherOverlay } {
  const period = currentForecastPeriod(forecast, now);
  if (!period) throw new Error("The regional forecast has no usable periods.");

  const startsAtCandidate = parsedDate(period.startsAt);
  const startsAt = startsAtCandidate && startsAtCandidate <= now ? startsAtCandidate : now;
  const expiresAt = futureExpiry(period.endsAt, now, 30 * 60_000, 18 * 60 * 60_000);
  const rain = period.precipitationChance === null
    ? ""
    : `, ${period.precipitationChance}% chance of rain`;
  const wind = [period.windDirection, period.windSpeed].filter(Boolean).join(" ");
  const windText = wind ? `, wind ${wind}` : "";
  const temperature = `${period.temperature}°${period.temperatureUnit}`;
  const observation = forecast.locations.find((location) => (
    location.name === "New Bern" && typeof location.temperature === "number"
  )) ?? forecast.locations.find((location) => typeof location.temperature === "number");
  const observedTemperature = observation
    ? `${observation.temperature}°${observation.temperatureUnit}`
    : temperature;
  const message = singleLine(
    `Eastern North Carolina weather — ${period.name}: ${temperature}, ${period.shortForecast}${rain}${windText}.`,
  );

  return {
    ticker: {
      automationKey: `${AUTOMATION_PREFIXES.forecast}regional`,
      message,
      priority: "routine",
      sourceName: WEATHER_SOURCE_NAME,
      sourceUrl: WEATHER_SOURCE_URL,
      startsAt,
      expiresAt,
      minimumIntervalSeconds: 180,
      metadata: {
        automationSource: "nws_forecast",
        forecastUpdatedAt: forecast.updatedAt,
        periodName: period.name,
        locations: forecast.locations.slice(0, 6),
      },
    },
    overlay: {
      temperature: observedTemperature,
      temperatureText: observedTemperature,
      condition: singleLine(period.shortForecast, 90),
      shortForecast: singleLine(period.shortForecast, 90),
      location: observation?.name ?? "Eastern North Carolina",
      updatedAt: observation?.observedAt ?? forecast.updatedAt,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

function alertTickers(
  alerts: Awaited<ReturnType<typeof getRegionalAlerts>>,
  now: Date,
): { tickers: AutomatedTicker[]; totalActive: number } {
  const ranked = alerts.flatMap((alert) => {
    const officialExpiry = parsedDate(alert.expiresAt);
    if (!officialExpiry || officialExpiry <= now) return [];
    return [{
      alert,
      expiresAt: new Date(Math.min(officialExpiry.getTime(), now.getTime() + 24 * 60 * 60_000)),
    }];
  }).sort((left, right) => {
    const severity = Number(right.alert.severity === "Extreme") - Number(left.alert.severity === "Extreme");
    if (severity) return severity;
    const eventRank = (event: string) => {
      if (/tornado|hurricane|storm surge|flash flood/iu.test(event)) return 0;
      if (/severe thunderstorm/iu.test(event)) return 1;
      return 2;
    };
    const event = eventRank(left.alert.event) - eventRank(right.alert.event);
    if (event) return event;
    return left.expiresAt.getTime() - right.expiresAt.getTime()
      || left.alert.id.localeCompare(right.alert.id);
  });

  const selected = ranked.length <= MAX_ALERT_TICKERS
    ? ranked
    : ranked.slice(0, MAX_ALERT_TICKERS - 1);
  const tickers: AutomatedTicker[] = selected.map(({ alert, expiresAt }) => {
    const area = singleLine(alert.area, 140);
    const directSourceUrl = /^https:\/\/api\.weather\.gov\/alerts\//iu.test(alert.id)
      ? alert.id
      : WEATHER_SOURCE_URL;
    return {
      automationKey: `${AUTOMATION_PREFIXES.alerts}${stableSuffix(alert.id)}`,
      message: singleLine(`${alert.headline}${area ? ` — ${area}` : ""}`),
      priority: alert.severity === "Extreme" ? "emergency" : "urgent",
      sourceName: WEATHER_SOURCE_NAME,
      sourceUrl: directSourceUrl,
      startsAt: now,
      expiresAt,
      minimumIntervalSeconds: 0,
      metadata: {
        automationSource: "nws_alert",
        nwsAlertId: alert.id,
        event: alert.event,
        severity: alert.severity,
        area: alert.area,
      },
    };
  });

  if (ranked.length > MAX_ALERT_TICKERS) {
    const overflow = ranked.slice(MAX_ALERT_TICKERS - 1);
    const events = [...new Set(overflow.map(({ alert }) => singleLine(alert.event, 90)))].filter(Boolean);
    tickers.push({
      automationKey: `${AUTOMATION_PREFIXES.alerts}additional-active-warnings`,
      message: singleLine(
        `${overflow.length} additional active National Weather Service ${overflow.length === 1 ? "warning" : "warnings"}: ${events.slice(0, 3).join(", ")}.`,
      ),
      priority: overflow.some(({ alert }) => alert.severity === "Extreme") ? "emergency" : "urgent",
      sourceName: WEATHER_SOURCE_NAME,
      sourceUrl: WEATHER_SOURCE_URL,
      startsAt: now,
      expiresAt: new Date(Math.min(...overflow.map(({ expiresAt }) => expiresAt.getTime()))),
      minimumIntervalSeconds: 0,
      metadata: {
        automationSource: "nws_alert_summary",
        activeWarningCount: overflow.length,
        nwsAlertIds: overflow.map(({ alert }) => alert.id).slice(0, 20),
      },
    });
  }

  return { tickers, totalActive: ranked.length };
}

async function newsroomTickers(now: Date) {
  const edition = await latestPublishedNewsroomEdition(
    "Eastern North Carolina",
    now,
    { networkFallback: true },
  );
  if (!edition) return { tickers: [] as AutomatedTicker[], detail: "No airable published edition." };

  const database = getDatabase();
  const storyRows = await database
    .select({
      id: newsroomStories.id,
      ticker: newsroomStories.ticker,
      sourceName: newsroomStories.sourceName,
      sourceUrl: newsroomStories.sourceUrl,
      fingerprint: newsroomStories.fingerprint,
      category: newsroomStories.category,
    })
    .from(newsroomStories)
    .where(and(
      eq(newsroomStories.editionId, edition.id),
      eq(newsroomStories.status, "approved"),
      like(newsroomStories.sourceUrl, "https://%"),
      sql`char_length(btrim(${newsroomStories.ticker})) > 0`,
      sql`char_length(btrim(${newsroomStories.sourceName})) > 0`,
    ))
    .orderBy(asc(newsroomStories.createdAt))
    .limit(MAX_NEWSROOM_TICKERS);

  const expiresAt = effectiveNewsroomExpiry(edition);
  const startsAt = edition.scheduledAt <= now ? edition.scheduledAt : now;

  const tickers = storyRows.flatMap((story) => {
    const message = singleLine(story.ticker);
    const sourceName = singleLine(story.sourceName, 180);
    const sourceUrl = singleLine(story.sourceUrl, 2_000);
    if (!message || !sourceName || !/^https:\/\//iu.test(sourceUrl)) return [];
    return [{
      automationKey: `${AUTOMATION_PREFIXES.newsroom}${stableSuffix(story.fingerprint)}`,
      message,
      priority: "routine" as const,
      sourceName,
      sourceUrl,
      startsAt,
      expiresAt,
      minimumIntervalSeconds: 120,
      metadata: {
        automationSource: "published_newsroom",
        newsroomEditionId: edition.id,
        newsroomStoryId: story.id,
        editionRevision: edition.revision,
        market: edition.market,
        category: story.category,
      },
    }];
  }).slice(0, MAX_NEWSROOM_TICKERS);

  return {
    // Read the current normalized rows rather than the edition's JSON snapshot
    // so a story that was killed after publication cannot re-enter the ticker.
    tickers,
    detail: `${edition.label} · revision ${edition.revision}`,
  };
}

function sourceError(source: AutomationSource, reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);
  return `${source}: ${singleLine(message, 500) || "Refresh failed."}`;
}

/**
 * Reconciles the safe, already-published newsroom and NWS feeds into the main
 * broadcast ticker. It never changes manual ticker rows or program logs.
 */
export async function syncBroadcastAutomation(now = new Date()): Promise<BroadcastAutomationResult> {
  const database = getDatabase();
  const [output] = await database
    .select({
      id: broadcastOutputs.id,
      slug: broadcastOutputs.slug,
    })
    .from(broadcastOutputs)
    .where(and(
      eq(broadcastOutputs.slug, MAIN_OUTPUT_SLUG),
      isNull(broadcastOutputs.archivedAt),
    ))
    .limit(1);

  if (!output) {
    throw new Error("The main broadcast output is missing. Apply the broadcast-control database migration first.");
  }

  const [forecastResult, alertsResult, newsroomResult] = await Promise.allSettled([
    getRegionalForecast(),
    getRegionalAlerts(),
    newsroomTickers(now),
  ]);

  const desired = new Map<string, AutomatedTicker>();
  const refreshedSources = new Set<AutomationSource>();
  const errors: string[] = [];
  const sources: Record<AutomationSource, SourceSummary> = {
    forecast: { refreshed: false, itemCount: 0, detail: null },
    alerts: { refreshed: false, itemCount: 0, detail: null },
    newsroom: { refreshed: false, itemCount: 0, detail: null },
  };
  let weatherOverlay: WeatherOverlay | null = null;

  if (forecastResult.status === "fulfilled") {
    try {
      const prepared = forecastTicker(forecastResult.value, now);
      desired.set(prepared.ticker.automationKey, prepared.ticker);
      weatherOverlay = prepared.overlay;
      refreshedSources.add("forecast");
      sources.forecast = {
        refreshed: true,
        itemCount: 1,
        detail: forecastResult.value.updatedAt,
      };
    } catch (error) {
      errors.push(sourceError("forecast", error));
    }
  } else {
    errors.push(sourceError("forecast", forecastResult.reason));
  }

  if (alertsResult.status === "fulfilled") {
    const prepared = alertTickers(alertsResult.value, now);
    for (const ticker of prepared.tickers) desired.set(ticker.automationKey, ticker);
    refreshedSources.add("alerts");
    sources.alerts = {
      refreshed: true,
      itemCount: prepared.tickers.length,
      detail: prepared.totalActive
        ? `${prepared.totalActive} active severe or extreme ${prepared.totalActive === 1 ? "warning" : "warnings"}.`
        : "No active severe or extreme warnings.",
    };
  } else {
    errors.push(sourceError("alerts", alertsResult.reason));
  }

  if (newsroomResult.status === "fulfilled") {
    for (const ticker of newsroomResult.value.tickers) desired.set(ticker.automationKey, ticker);
    refreshedSources.add("newsroom");
    sources.newsroom = {
      refreshed: true,
      itemCount: newsroomResult.value.tickers.length,
      detail: newsroomResult.value.detail,
    };
  } else {
    errors.push(sourceError("newsroom", newsroomResult.reason));
  }

  const existing = await database
    .select({
      id: broadcastTickerItems.id,
      automationKey: broadcastTickerItems.automationKey,
      expiresAt: broadcastTickerItems.expiresAt,
    })
    .from(broadcastTickerItems)
    .where(and(
      eq(broadcastTickerItems.outputId, output.id),
      or(
        like(broadcastTickerItems.automationKey, `${AUTOMATION_PREFIXES.forecast}%`),
        like(broadcastTickerItems.automationKey, `${AUTOMATION_PREFIXES.alerts}%`),
        like(broadcastTickerItems.automationKey, `${AUTOMATION_PREFIXES.newsroom}%`),
      ),
      inArray(broadcastTickerItems.status, ["approved", "scheduled", "active"]),
      isNull(broadcastTickerItems.archivedAt),
    ));

  const staleIds = existing.flatMap((item) => {
    const key = item.automationKey;
    if (!key || desired.has(key)) return [];
    const expiredByTime = !item.expiresAt || item.expiresAt <= now;
    const supersededByRefresh = (["forecast", "alerts", "newsroom"] as const).some((source) => (
      refreshedSources.has(source) && key.startsWith(AUTOMATION_PREFIXES[source])
    ));
    return expiredByTime || supersededByRefresh ? [item.id] : [];
  });
  const staleIdSet = new Set(staleIds);
  const preservedItemCount = existing.filter((item) => (
    !staleIdSet.has(item.id)
    && Boolean(item.automationKey)
    && !desired.has(item.automationKey ?? "")
  )).length;

  const desiredRows = [...desired.values()];
  // The Neon HTTP driver does not support interactive transactions. These
  // writes therefore use stable conflict keys and repeatable stale-id updates;
  // a partial failure is safely reconciled by the next cron invocation.
  const upserted = desiredRows.length
    ? await database
        .insert(broadcastTickerItems)
        .values(desiredRows.map((ticker) => ({
          outputId: output.id,
          message: ticker.message,
          priority: ticker.priority,
          status: "active" as const,
          sourceName: ticker.sourceName,
          sourceUrl: ticker.sourceUrl,
          automationKey: ticker.automationKey,
          startsAt: ticker.startsAt,
          expiresAt: ticker.expiresAt,
          minimumIntervalSeconds: ticker.minimumIntervalSeconds,
          maximumPlays: null,
          approvedAt: now,
          metadata: ticker.metadata,
          archivedAt: null,
          updatedAt: now,
        })))
        .onConflictDoUpdate({
          target: broadcastTickerItems.automationKey,
          // A deliberate operator cancellation is a hold, not a transient
          // state. A future source item gets a new key, while this exact item
          // stays off air until an operator activates it again.
          setWhere: sql`${broadcastTickerItems.status} not in ('cancelled', 'archived')
            and ${broadcastTickerItems.archivedAt} is null`,
          set: {
            outputId: output.id,
            message: excluded(broadcastTickerItems.message),
            priority: excluded(broadcastTickerItems.priority),
            status: "active",
            sourceName: excluded(broadcastTickerItems.sourceName),
            sourceUrl: excluded(broadcastTickerItems.sourceUrl),
            startsAt: excluded(broadcastTickerItems.startsAt),
            expiresAt: excluded(broadcastTickerItems.expiresAt),
            minimumIntervalSeconds: excluded(broadcastTickerItems.minimumIntervalSeconds),
            maximumPlays: null,
            approvedAt: now,
            metadata: excluded(broadcastTickerItems.metadata),
            archivedAt: null,
            updatedAt: now,
          },
        })
        .returning({ id: broadcastTickerItems.id })
    : [];

  const expired = staleIds.length
    ? await database
        .update(broadcastTickerItems)
        .set({ status: "expired", updatedAt: now })
        .where(inArray(broadcastTickerItems.id, staleIds))
        .returning({ id: broadcastTickerItems.id })
    : [];

  if (weatherOverlay) {
    const weatherJson = JSON.stringify(weatherOverlay);
    await database
      .update(broadcastOutputs)
      .set({
        overlayConfig: sql`jsonb_set(
          coalesce(${broadcastOutputs.overlayConfig}, '{}'::jsonb),
          '{weather}',
          coalesce(${broadcastOutputs.overlayConfig}->'weather', '{}'::jsonb) || ${weatherJson}::jsonb,
          true
        )`,
        updatedAt: now,
      })
      .where(eq(broadcastOutputs.id, output.id));
  }

  // The on-air monitor needs recent health, not an unbounded 10-second time
  // series. As-run records remain untouched for billing and audit purposes.
  const heartbeatRetentionCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  const prunedHeartbeatResult = await database.execute(sql<{ count: number }>`
    with deleted as (
      delete from ${broadcastAgentHeartbeats}
      where ${broadcastAgentHeartbeats.receivedAt} < ${heartbeatRetentionCutoff}
      returning 1
    )
    select count(*)::int as count from deleted
  `);
  const prunedHeartbeats = Number(prunedHeartbeatResult.rows[0]?.count ?? 0);

  return {
    ok: errors.length === 0,
    outputId: output.id,
    outputSlug: output.slug,
    activeAutomatedItems: upserted.length + preservedItemCount,
    upsertedItems: upserted.length,
    expiredItems: expired.length,
    prunedHeartbeats,
    sources,
    errors,
  };
}
