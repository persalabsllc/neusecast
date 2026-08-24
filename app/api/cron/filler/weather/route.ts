import { generateAutomaticFiller } from "@/lib/filler/generator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateAutomaticFiller(undefined, ["weather"]);
  if (result.errors.length) {
    console.error("Scheduled NeuseCast weather refresh completed with errors", result.errors);
  }
  return Response.json({
    ok: result.errors.length === 0,
    ...result,
  }, { status: result.errors.length ? 502 : 200 });
}
