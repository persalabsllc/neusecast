import { getNetworkChannelManifest } from "@/lib/player/network-channel";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const manifest = await getNetworkChannelManifest();
    return Response.json(manifest, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        ETag: `"${manifest.version}"`,
      },
    });
  } catch (error) {
    console.error("NeuseCast Watch manifest failed", error);
    return Response.json({ error: "The network feed is temporarily unavailable." }, { status: 503 });
  }
}
