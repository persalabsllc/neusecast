import { getPlayerManifest } from "@/lib/player/playlist";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerKey: string }> },
) {
  const { playerKey } = await params;
  const manifest = await getPlayerManifest(playerKey);

  if (!manifest) return Response.json({ error: "Screen not found" }, { status: 404 });

  return Response.json(manifest, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
