import { syncBroadcastAutomation } from "@/lib/broadcast/automation";
import { refreshWeatherCenter } from "@/lib/weather-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const startedAt = new Date();
  try {
    const [result, weatherCenter] = await Promise.all([
      syncBroadcastAutomation(startedAt),
      refreshWeatherCenter(startedAt),
    ]);
    const completedAt = new Date();
    if (!result.ok || !weatherCenter.ok) {
      console.error("[broadcast:cron] automation refresh completed with source errors", {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        errors: [...result.errors, ...(!weatherCenter.ok ? [weatherCenter.error] : [])],
      });
    }

    return Response.json({
      ...result,
      weatherCenter,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    }, {
      status: result.ok && weatherCenter.ok ? 200 : 502,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Broadcast automation refresh failed.";
    console.error("[broadcast:cron] automation refresh failed", {
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      error: message,
    });
    return Response.json({
      ok: false,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      error: message,
    }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
