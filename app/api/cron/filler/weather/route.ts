import { getRegionalAlerts, getRegionalForecast } from "@/lib/player/weather";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [forecast, alerts] = await Promise.all([
      getRegionalForecast(),
      getRegionalAlerts(),
    ]);
    return Response.json({
      ok: true,
      provider: "National Weather Service",
      forecastPeriods: forecast.periods.length,
      activeWarnings: alerts.length,
      updatedAt: forecast.updatedAt,
    });
  } catch (error) {
    console.error("Scheduled NeuseCast NWS refresh failed", error);
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Weather refresh failed.",
    }, { status: 502 });
  }
}
