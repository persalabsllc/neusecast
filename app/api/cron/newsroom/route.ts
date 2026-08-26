import { generateNewsroomForActiveMarkets } from "@/lib/newsroom/generator";
import { newsroomCronOutcome } from "@/lib/newsroom/cron-status";
import { automaticNewsroomSlot } from "@/lib/newsroom/windows";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date();
  const slot = automaticNewsroomSlot(startedAt);

  try {
    const results = await generateNewsroomForActiveMarkets(slot);
    const outcome = newsroomCronOutcome(results);
    const completedAt = new Date();
    if (!outcome.ok) {
      console.error("[newsroom:cron] one or more markets have no published edition", {
        slot,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        failures: outcome.failures,
      });
    }

    return Response.json({
      ok: outcome.ok,
      slot,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      generated: results.filter((result) => result.editionId && !result.skipped).length,
      published: results.filter((result) => result.published).length,
      skipped: results.filter((result) => result.skipped).length,
      failures: outcome.failures,
      results,
    }, {
      status: outcome.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Newsroom cron failed.";
    console.error("[newsroom:cron] generation failed before market results were available", {
      slot,
      startedAt: startedAt.toISOString(),
      error: message,
    });
    return Response.json({
      ok: false,
      slot,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      error: message,
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
