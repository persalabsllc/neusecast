import { createHash, randomUUID } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getDatabase } from "@/lib/db";
import { broadcastMediaAssets, broadcastMediaVersions } from "@/lib/db/schema";
import { requireBroadcastOperator } from "@/lib/broadcast/control-auth";
import {
  mediaClassification,
  type BroadcastMediaCategory,
  type BroadcastSegment,
} from "@/lib/broadcast/media-taxonomy";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 2_000_000_000;
const MAX_PAYLOAD_LENGTH = 4_000;
const ALLOWED_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/vtt",
  "application/x-subrip",
  "application/ttml+xml",
] as const;

type UploadMetadata = {
  name: string;
  category: BroadcastMediaCategory;
  segment: BroadcastSegment | null;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  initiatedByClerkUserId: string;
};

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function boundedPositiveInteger(value: unknown, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(Math.round(parsed), maximum);
}

function mediaKind(mimeType: string): "video" | "audio" | "image" | "caption" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  return "caption";
}

function slugify(value: string) {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
  return `${base || "media"}-${randomUUID().slice(0, 8)}`;
}

function stableUuid(namespace: string, value: string) {
  const hex = createHash("sha256").update(`${namespace}:${value}`, "utf8").digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function parseClientPayload(raw: string | null, userId: string): UploadMetadata {
  if (!raw || raw.length > MAX_PAYLOAD_LENGTH) throw new Error("Upload metadata is missing or too large.");

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    payload = parsed as Record<string, unknown>;
  } catch {
    throw new Error("Upload metadata is invalid.");
  }

  const name = boundedText(payload.name, 240);
  const originalFileName = boundedText(payload.originalFileName, 255);
  const mimeType = boundedText(payload.mimeType, 160).toLowerCase();
  const category = boundedText(payload.category, 40);
  const segment = boundedText(payload.segment, 40) || null;
  const classification = mediaClassification(category, segment);

  if (!name || !originalFileName || !ALLOWED_CONTENT_TYPES.includes(mimeType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
    throw new Error("The selected media type is not supported.");
  }
  if (!classification) {
    throw new Error("Choose a valid library category and segment.");
  }

  return {
    name,
    category: classification.category,
    segment: classification.segment,
    originalFileName,
    mimeType,
    fileSizeBytes: boundedPositiveInteger(payload.fileSizeBytes, MAX_UPLOAD_BYTES),
    durationMs: boundedPositiveInteger(payload.durationMs, 86_400_000),
    width: boundedPositiveInteger(payload.width, 16_384),
    height: boundedPositiveInteger(payload.height, 16_384),
    initiatedByClerkUserId: userId.slice(0, 255),
  };
}

function parseTokenPayload(raw: string | null | undefined): UploadMetadata {
  if (!raw || raw.length > MAX_PAYLOAD_LENGTH) throw new Error("Signed upload metadata is missing.");
  const parsed = JSON.parse(raw) as UploadMetadata;
  if (!parsed || typeof parsed !== "object" || !parsed.name || !parsed.mimeType || !parsed.category
    || !mediaClassification(parsed.category, parsed.segment)) {
    throw new Error("Signed upload metadata is invalid.");
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { user } = await requireBroadcastOperator();
        if (!/^broadcast\/[a-zA-Z0-9][a-zA-Z0-9._/-]{1,500}$/.test(pathname) || pathname.includes("..")) {
          throw new Error("The upload path is invalid.");
        }
        const metadata = parseClientPayload(clientPayload, user.id);

        return {
          allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 31_536_000,
          tokenPayload: JSON.stringify(metadata),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const metadata = parseTokenPayload(tokenPayload);
        const kind = mediaKind(metadata.mimeType);
        // Every playable format must be downloaded and ffprobed by the local
        // agent before it can enter a log. Captions are metadata-only for now.
        const needsIngest = kind !== "caption";
        const now = new Date();
        // Vercel Blob may retry this callback. Stable primary keys make the
        // callback idempotent without exposing the upload token in the data.
        const assetId = stableUuid("broadcast-asset", blob.pathname);
        const versionId = stableUuid("broadcast-version", blob.pathname);
        const database = getDatabase();

        await database.batch([
          database.insert(broadcastMediaAssets).values({
            id: assetId,
            slug: slugify(metadata.name),
            name: metadata.name,
            kind,
            category: metadata.category,
            segment: metadata.segment,
            status: needsIngest ? "processing" : "ready",
            durationMs: metadata.durationMs ?? (kind === "image" ? 10_000 : null),
            metadata: {
              uploadSource: "vercel_blob_client",
              initiatedByClerkUserId: metadata.initiatedByClerkUserId,
            },
            updatedAt: now,
          }).onConflictDoNothing({ target: broadcastMediaAssets.id }),
          database.insert(broadcastMediaVersions).values({
            id: versionId,
            assetId,
            revision: 1,
            status: needsIngest ? "processing" : "ready",
            isCurrent: true,
            originalFileName: metadata.originalFileName,
            mimeType: blob.contentType || metadata.mimeType,
            fileSizeBytes: metadata.fileSizeBytes,
            storageProvider: "vercel_blob",
            storageKey: blob.pathname,
            sourceUrl: blob.url,
            playbackUrl: blob.url,
            durationMs: metadata.durationMs ?? (kind === "image" ? 10_000 : null),
            width: metadata.width,
            height: metadata.height,
            technicalMetadata: { uploadedAt: now.toISOString() },
            processedAt: needsIngest ? null : now,
          }).onConflictDoNothing({ target: broadcastMediaVersions.id }),
        ]);
      },
    });

    return Response.json(response, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Broadcast library upload failed", error);
    const message = error instanceof Error ? error.message : "Upload could not be authorized.";
    return Response.json({ error: message }, { status: 400 });
  }
}
