"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireBroadcastOperator } from "@/lib/broadcast/control-auth";
import { getDatabase } from "@/lib/db";
import { broadcastWeatherCenters, broadcastWeatherRuns } from "@/lib/db/schema";
import { ensureWeatherCenter, refreshWeatherCenter } from "@/lib/weather-center/service";

function revalidateWeather() {
  revalidatePath("/studio/weather");
  revalidatePath("/weather-center");
  revalidatePath("/weather-center/teleprompter");
}

export async function refreshWeatherCenterAction() {
  await requireBroadcastOperator();
  const result = await refreshWeatherCenter(new Date(), { force: true });
  revalidateWeather();
  if (!result.ok) throw new Error(result.error);
}

export async function updateWeatherCenterAction(formData: FormData) {
  await requireBroadcastOperator();
  const { center } = await ensureWeatherCenter();
  const sponsorLabel = String(formData.get("sponsorLabel") ?? "").trim().slice(0, 180);
  const primaryLocation = String(formData.get("primaryLocation") ?? "").trim().slice(0, 120);
  const duration = Number(formData.get("reportDurationSeconds"));
  if (!sponsorLabel || !primaryLocation || !Number.isInteger(duration) || duration < 30 || duration > 600) {
    throw new Error("Enter valid Weather Center settings.");
  }
  await getDatabase().update(broadcastWeatherCenters).set({
    sponsorLabel,
    primaryLocation,
    reportDurationSeconds: duration,
    autoRefresh: formData.get("autoRefresh") === "on",
    graphicsOnlyFallback: formData.get("graphicsOnlyFallback") === "on",
    presenterMode: formData.get("presenterMode") === "on",
    updatedAt: new Date(),
  }).where(eq(broadcastWeatherCenters.id, center.id));
  revalidateWeather();
}

export async function markSevereWeatherReviewedAction(formData: FormData) {
  const { user } = await requireBroadcastOperator();
  const { center } = await ensureWeatherCenter();
  const runId = String(formData.get("runId") ?? "");
  await getDatabase().update(broadcastWeatherRuns).set({
    severeWeatherReviewed: true,
    metadata: { severeWeatherReviewedByClerkUserId: user.id, severeWeatherReviewedAt: new Date().toISOString() },
    updatedAt: new Date(),
  }).where(and(eq(broadcastWeatherRuns.id, runId), eq(broadcastWeatherRuns.centerId, center.id)));
  revalidateWeather();
}
