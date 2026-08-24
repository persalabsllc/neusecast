import { eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { screens } from "@/lib/db/schema";
import {
  authenticatePlayerDevice,
  playerDeviceAuthErrorResponse,
  playerDeviceCookieHeaders,
} from "@/lib/player/device-auth";

type HeartbeatPayload = {
  sessionId?: string;
  playerVersion?: string;
  currentItemId?: string | null;
  manifestVersion?: string | null;
  viewport?: { width?: number; height?: number };
  error?: string | { message?: string } | null;
};

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

function boundedDimension(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(Math.round(value), 32_768));
}

function errorMessage(error: HeartbeatPayload["error"]) {
  if (typeof error === "string") return boundedText(error, 2_000);
  if (error && typeof error === "object") return boundedText(error.message, 2_000);
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerKey: string }> },
) {
  const { playerKey } = await params;

  try {
    const device = await authenticatePlayerDevice(request, playerKey, { allowEnrollment: true });
    const rawPayload = await request.json().catch(() => ({})) as unknown;
    const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as HeartbeatPayload
      : {};
    const now = new Date();
    const reportedError = errorMessage(payload.error);
    const includesError = Object.prototype.hasOwnProperty.call(payload, "error");
    const includesCurrentItem = Object.prototype.hasOwnProperty.call(payload, "currentItemId");
    const includesManifestVersion = Object.prototype.hasOwnProperty.call(payload, "manifestVersion");

    await getDatabase()
      .update(screens)
      .set({
        lastSeenAt: now,
        lastHeartbeatAt: now,
        sessionId: boundedText(payload.sessionId, 128),
        playerVersion: boundedText(payload.playerVersion, 80),
        viewportWidth: boundedDimension(payload.viewport?.width),
        viewportHeight: boundedDimension(payload.viewport?.height),
        ...(includesCurrentItem ? { currentItemId: boundedText(payload.currentItemId, 255) } : {}),
        ...(includesManifestVersion
          ? {
              currentManifestVersion: boundedText(payload.manifestVersion, 64),
            }
          : {}),
        ...(includesError
          ? { lastError: reportedError, lastErrorAt: reportedError ? now : null }
          : {}),
        updatedAt: now,
      })
      .where(eq(screens.id, device.screenId));

    const response = Response.json({
      ok: true,
      enrolled: device.enrolled,
      health: "online",
      serverTime: now.toISOString(),
      timeZone: device.timeZone,
      heartbeatAfterSeconds: 30,
    });
    const secure = new URL(request.url).protocol === "https:";
    for (const cookie of playerDeviceCookieHeaders(playerKey, device, secure)) {
      response.headers.append("Set-Cookie", cookie);
    }
    return response;
  } catch (error) {
    return playerDeviceAuthErrorResponse(error);
  }
}
