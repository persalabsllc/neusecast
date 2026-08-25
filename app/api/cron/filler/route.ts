import { generateAutomaticFiller } from "@/lib/filler/generator";
import { EVERGREEN_AUTOMATIC_FILLER_CATEGORIES, type FillerCategory } from "@/lib/filler/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dayNumber = Math.floor(Date.now() / (24 * 60 * 60 * 1_000));
  const firstEvergreenIndex = dayNumber % EVERGREEN_AUTOMATIC_FILLER_CATEGORIES.length;
  const categories: FillerCategory[] = [
    "news",
    "event",
    "on_this_day",
    EVERGREEN_AUTOMATIC_FILLER_CATEGORIES[firstEvergreenIndex],
    EVERGREEN_AUTOMATIC_FILLER_CATEGORIES[(firstEvergreenIndex + 1) % EVERGREEN_AUTOMATIC_FILLER_CATEGORIES.length],
  ];
  const result = await generateAutomaticFiller(undefined, categories, 1);
  if (result.errors.length) {
    console.error("Scheduled NeuseCast filler refresh completed with errors", result.errors);
  }
  return Response.json({
    ok: result.errors.length === 0,
    categories,
    ...result,
  }, { status: result.errors.length ? 502 : 200 });
}
