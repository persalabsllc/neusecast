import { and, desc, eq, isNull } from "drizzle-orm";
import { requireBroadcastOperator } from "@/lib/broadcast/control-auth";
import { getDatabase } from "@/lib/db";
import { broadcastMediaAssets, broadcastMediaVersions } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  // Prevent operator-supplied names/tags from becoming spreadsheet formulas
  // when the catalog is opened in Excel or similar software.
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    await requireBroadcastOperator();
  } catch {
    return Response.json({ error: "Broadcast Studio authorization required." }, { status: 401 });
  }

  const rows = await getDatabase()
    .select({
      assetId: broadcastMediaAssets.id,
      name: broadcastMediaAssets.name,
      category: broadcastMediaAssets.category,
      segment: broadcastMediaAssets.segment,
      kind: broadcastMediaAssets.kind,
      status: broadcastMediaAssets.status,
      durationMs: broadcastMediaAssets.durationMs,
      tags: broadcastMediaAssets.tags,
      rightsOwner: broadcastMediaAssets.rightsOwner,
      rightsExpiresAt: broadcastMediaAssets.rightsExpiresAt,
      versionId: broadcastMediaVersions.id,
      revision: broadcastMediaVersions.revision,
      originalFileName: broadcastMediaVersions.originalFileName,
      mimeType: broadcastMediaVersions.mimeType,
      fileSizeBytes: broadcastMediaVersions.fileSizeBytes,
      playbackUrl: broadcastMediaVersions.playbackUrl,
      width: broadcastMediaVersions.width,
      height: broadcastMediaVersions.height,
      createdAt: broadcastMediaAssets.createdAt,
    })
    .from(broadcastMediaAssets)
    .leftJoin(
      broadcastMediaVersions,
      and(eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id), eq(broadcastMediaVersions.isCurrent, true)),
    )
    .where(isNull(broadcastMediaAssets.archivedAt))
    .orderBy(desc(broadcastMediaAssets.createdAt));

  const url = new URL(request.url);
  const stamp = new Date().toISOString().slice(0, 10);
  if (url.searchParams.get("format") === "json") {
    return Response.json({ exportedAt: new Date().toISOString(), assets: rows }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="neusecast-broadcast-library-${stamp}.json"`,
      },
    });
  }

  const headings = [
    "asset_id", "name", "category", "segment", "kind", "status", "duration_ms", "tags", "rights_owner",
    "rights_expires_at", "version_id", "revision", "original_file_name", "mime_type", "file_size_bytes",
    "width", "height", "playback_url", "created_at",
  ];
  const lines = [headings.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([
      row.assetId,
      row.name,
      row.category,
      row.segment,
      row.kind,
      row.status,
      row.durationMs,
      row.tags.join(" | "),
      row.rightsOwner,
      row.rightsExpiresAt?.toISOString(),
      row.versionId,
      row.revision,
      row.originalFileName,
      row.mimeType,
      row.fileSizeBytes,
      row.width,
      row.height,
      row.playbackUrl,
      row.createdAt.toISOString(),
    ].map(csvCell).join(","));
  }

  return new Response(lines.join("\r\n"), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="neusecast-broadcast-library-${stamp}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
