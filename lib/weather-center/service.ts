import "server-only";

import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import {
  broadcastGraphicLayers,
  broadcastOutputs,
  broadcastWeatherCenters,
  broadcastWeatherRuns,
} from "@/lib/db/schema";
import { fetchWeatherCenterSnapshot, generatePresenterScript } from "./data";
import type { WeatherCenterRunView, WeatherCenterSnapshot } from "./types";

export async function ensureWeatherCenter(createdByClerkUserId?: string | null) {
  const db = getDatabase();
  const [output] = await db.select().from(broadcastOutputs)
    .where(and(eq(broadcastOutputs.slug, "main"), isNull(broadcastOutputs.archivedAt)))
    .limit(1);
  if (!output) throw new Error("The main broadcast output is not configured.");
  const [existing] = await db.select().from(broadcastWeatherCenters)
    .where(eq(broadcastWeatherCenters.outputId, output.id)).limit(1);
  if (existing) return { center: existing, output };
  const [center] = await db.insert(broadcastWeatherCenters).values({
    outputId: output.id,
    createdByClerkUserId: createdByClerkUserId ?? null,
    configuration: {
      locations: ["Greenville", "Washington", "Kinston", "New Bern", "Jacksonville", "Morehead City"],
      tideStationId: "8655133",
      marineZone: "AMZ137",
      radarRefreshMinutes: 5,
      forecastRefreshMinutes: 15,
    },
  }).returning();
  return { center, output };
}

function runView(row: typeof broadcastWeatherRuns.$inferSelect): WeatherCenterRunView {
  return {
    id: row.id,
    status: row.status,
    issuedAt: row.issuedAt.toISOString(),
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil.toISOString(),
    severeWeatherReviewed: row.severeWeatherReviewed,
    presenterScript: row.presenterScript,
    errorMessage: row.errorMessage,
    data: row.data as unknown as WeatherCenterSnapshot,
  };
}

export async function currentWeatherCenterRun(now = new Date()) {
  const db = getDatabase();
  const [row] = await db.select({ center: broadcastWeatherCenters }).from(broadcastWeatherCenters)
    .innerJoin(broadcastOutputs, eq(broadcastOutputs.id, broadcastWeatherCenters.outputId))
    .where(and(eq(broadcastOutputs.slug, "main"), isNull(broadcastOutputs.archivedAt)))
    .limit(1);
  const center = row?.center ?? null;
  if (!center) return { center: null, run: null };
  const [run] = await getDatabase().select().from(broadcastWeatherRuns)
    .where(and(
      eq(broadcastWeatherRuns.centerId, center.id),
      eq(broadcastWeatherRuns.status, "ready"),
      gt(broadcastWeatherRuns.validUntil, now),
    ))
    .orderBy(desc(broadcastWeatherRuns.issuedAt))
    .limit(1);
  return { center, run: run ? runView(run) : null };
}

export async function loadWeatherCenterDashboard() {
  const { center, output } = await ensureWeatherCenter();
  const rows = await getDatabase().select().from(broadcastWeatherRuns)
    .where(eq(broadcastWeatherRuns.centerId, center.id))
    .orderBy(desc(broadcastWeatherRuns.issuedAt))
    .limit(12);
  return {
    center: {
      id: center.id,
      name: center.name,
      sponsorLabel: center.sponsorLabel,
      market: center.market,
      primaryLocation: center.primaryLocation,
      autoRefresh: center.autoRefresh,
      graphicsOnlyFallback: center.graphicsOnlyFallback,
      presenterMode: center.presenterMode,
      reportDurationSeconds: center.reportDurationSeconds,
    },
    output: { id: output.id, name: output.name, assignedAgentId: output.assignedAgentId },
    currentRun: rows.find((run) => run.status === "ready" && run.validUntil > new Date()) ? runView(rows.find((run) => run.status === "ready" && run.validUntil > new Date())!) : null,
    recentRuns: rows.map(runView),
  };
}

export async function refreshWeatherCenter(now = new Date(), options: { force?: boolean } = {}) {
  const db = getDatabase();
  const { center, output } = await ensureWeatherCenter();
  if (!center.autoRefresh && options.force !== true) {
    return { ok: true as const, skipped: true as const, reason: "Automatic Weather Center refresh is disabled." };
  }
  const [pending] = await db.insert(broadcastWeatherRuns).values({
    centerId: center.id,
    status: "generating",
    issuedAt: now,
    validFrom: now,
    validUntil: new Date(now.getTime() + 15 * 60_000),
    presenterScript: "Weather Center update is being generated.",
    data: {},
    sourceSummary: {},
  }).returning();
  try {
    const snapshot = await fetchWeatherCenterSnapshot({
      market: center.market,
      primaryLocation: center.primaryLocation,
      sponsorLabel: center.sponsorLabel,
      now,
    });
    const script = generatePresenterScript(snapshot);
    const forecastUpdatedAt = snapshot.sources[0]?.updatedAt ? new Date(snapshot.sources[0].updatedAt) : null;
    await db.batch([
      db.update(broadcastWeatherRuns).set({
        status: "ready",
        validUntil: new Date(snapshot.validUntil),
        forecastUpdatedAt: forecastUpdatedAt && Number.isFinite(forecastUpdatedAt.getTime()) ? forecastUpdatedAt : null,
        data: snapshot as unknown as Record<string, unknown>,
        presenterScript: script,
        sourceSummary: { sources: snapshot.sources, activeAlerts: snapshot.alerts.length },
        metadata: { generatedBy: "neusecast-weather-center-v1", graphicsOnlyFallback: center.graphicsOnlyFallback },
        updatedAt: new Date(),
      }).where(eq(broadcastWeatherRuns.id, pending.id)),
      db.update(broadcastWeatherRuns).set({ status: "expired", updatedAt: new Date() })
        .where(and(
          eq(broadcastWeatherRuns.centerId, center.id),
          eq(broadcastWeatherRuns.status, "ready"),
          ne(broadcastWeatherRuns.id, pending.id),
        )),
      db.update(broadcastGraphicLayers).set({
        data: {
          source: "neusecast_weather_center",
          runId: pending.id,
          temperature: snapshot.current.temperature === null ? "--°" : `${snapshot.current.temperature}°`,
          condition: snapshot.current.condition,
          location: snapshot.primaryLocation,
          updatedAt: snapshot.issuedAt,
          expiresAt: snapshot.validUntil,
        },
        updatedAt: new Date(),
      }).where(and(
        eq(broadcastGraphicLayers.outputId, output.id),
        eq(broadcastGraphicLayers.kind, "weather"),
        isNull(broadcastGraphicLayers.archivedAt),
      )),
    ]);
    return { ok: true as const, runId: pending.id, validUntil: snapshot.validUntil, alerts: snapshot.alerts.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather Center refresh failed.";
    await db.update(broadcastWeatherRuns).set({
      status: "failed",
      errorMessage: message.slice(0, 2_000),
      updatedAt: new Date(),
    }).where(eq(broadcastWeatherRuns.id, pending.id));
    return { ok: false as const, runId: pending.id, error: message };
  }
}
