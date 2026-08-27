import { currentWeatherCenterRun } from "@/lib/weather-center/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
  "Access-Control-Allow-Origin": "*",
};

export async function GET() {
  try {
    const { center, run } = await currentWeatherCenterRun();
    if (!center || !run) {
      return Response.json({ ok: false, error: "No current Weather Center update is available." }, { status: 503, headers: HEADERS });
    }
    return Response.json({
      ok: true,
      center: { name: center.name, sponsorLabel: center.sponsorLabel, market: center.market },
      run,
    }, { headers: HEADERS });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Weather Center is unavailable.",
    }, { status: 503, headers: HEADERS });
  }
}
