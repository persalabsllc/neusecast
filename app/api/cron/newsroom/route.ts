import { generateNewsroomForActiveMarkets } from "@/lib/newsroom/generator";
import type { NewsroomSlot } from "@/lib/newsroom/types";

export const maxDuration = 300;

function easternHour(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  return Number(parts.find((part) => part.type === "hour")?.value);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date();
  const hour = easternHour(startedAt);
  const slot: NewsroomSlot | null = hour === 6 ? "morning" : hour === 15 ? "afternoon" : null;
  if (!slot) {
    return Response.json({ ok: true, skipped: true, reason: "Outside the 6 a.m. and 3 p.m. Eastern newsroom windows." });
  }
  const results = await generateNewsroomForActiveMarkets(slot);
  const failures = results.filter((result) => result.error);
  return Response.json({
    ok: failures.length === 0,
    slot,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    generated: results.filter((result) => result.editionId && !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    failures,
    results,
  }, { status: failures.length ? 207 : 200 });
}
