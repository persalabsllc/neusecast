import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { screens, venues } from "@/lib/db/schema";
import { hashPairingToken } from "@/lib/player/pairing";

export const DEVICE_ID_HEADER = "x-neusecast-device-id";
export const DEVICE_CREDENTIAL_HEADER = "x-neusecast-device-credential";
export const PAIRING_TOKEN_HEADER = "x-neusecast-pairing-token";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;

export class PlayerDeviceAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 404,
  ) {
    super(message);
    this.name = "PlayerDeviceAuthError";
  }
}

export type AuthenticatedPlayerDevice = {
  screenId: string;
  venueId: string;
  deviceId: string;
  credential: string;
  timeZone: string;
  enrolled: boolean;
};

type PlayerRecord = {
  id: string;
  venueId: string;
  deviceId: string | null;
  deviceCredentialHash: string | null;
  pairingTokenHash: string | null;
  pairingTokenExpiresAt: Date | null;
  timeZone: string;
};

function credentialHash(credential: string) {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

function hashesMatch(actual: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function cookieMap(header: string | null) {
  const values = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      values.set(name, decodeURIComponent(rawValue));
    } catch {
      values.set(name, rawValue);
    }
  }
  return values;
}

export function playerDeviceCookieNames(playerKey: string) {
  const suffix = createHash("sha256").update(playerKey, "utf8").digest("hex").slice(0, 20);
  return {
    deviceId: `nc_device_id_${suffix}`,
    credential: `nc_device_credential_${suffix}`,
  };
}

function credentialsFromRequest(request: Request, playerKey: string) {
  const names = playerDeviceCookieNames(playerKey);
  const cookies = cookieMap(request.headers.get("cookie"));
  const cookieDeviceId = cookies.get(names.deviceId)?.trim() ?? "";
  const cookieCredential = cookies.get(names.credential)?.trim() ?? "";

  if (DEVICE_ID_PATTERN.test(cookieDeviceId) && DEVICE_CREDENTIAL_PATTERN.test(cookieCredential)) {
    return { deviceId: cookieDeviceId, credential: cookieCredential };
  }

  return {
    deviceId: request.headers.get(DEVICE_ID_HEADER)?.trim() ?? "",
    credential: request.headers.get(DEVICE_CREDENTIAL_HEADER)?.trim() ?? "",
  };
}

async function findPlayer(playerKey: string): Promise<PlayerRecord | null> {
  const [screen] = await getDatabase()
    .select({
      id: screens.id,
      venueId: screens.venueId,
      deviceId: screens.deviceId,
      deviceCredentialHash: screens.deviceCredentialHash,
      pairingTokenHash: screens.pairingTokenHash,
      pairingTokenExpiresAt: screens.pairingTokenExpiresAt,
      timeZone: venues.timeZone,
    })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .where(and(eq(screens.provider, "neusecast"), eq(screens.providerScreenId, playerKey), eq(screens.active, true)))
    .limit(1);

  return screen ?? null;
}

function pairingTokenMatches(screen: PlayerRecord, pairingToken: string, now = new Date()) {
  if (
    !PAIRING_TOKEN_PATTERN.test(pairingToken)
    || !screen.pairingTokenHash
    || !screen.pairingTokenExpiresAt
    || screen.pairingTokenExpiresAt.getTime() < now.getTime()
  ) return false;

  return hashesMatch(screen.pairingTokenHash, hashPairingToken(pairingToken));
}

function credentialsMatch(screen: PlayerRecord, deviceId: string, credential: string) {
  if (
    !DEVICE_ID_PATTERN.test(deviceId)
    || !DEVICE_CREDENTIAL_PATTERN.test(credential)
    || !screen.deviceCredentialHash
  ) return false;

  return screen.deviceId === deviceId && hashesMatch(screen.deviceCredentialHash, credentialHash(credential));
}

export async function authorizePlayerBootstrap(
  playerKey: string,
  input: { deviceId?: string; credential?: string; pairingToken?: string },
) {
  await ensureScreenManagementSchema();
  const screen = await findPlayer(playerKey);
  if (!screen) throw new PlayerDeviceAuthError("Screen not found", 404);

  if (credentialsMatch(screen, input.deviceId ?? "", input.credential ?? "")) return;
  if (!screen.deviceCredentialHash && pairingTokenMatches(screen, input.pairingToken ?? "")) return;
  throw new PlayerDeviceAuthError("This player requires a valid device pairing link", 401);
}

export async function authenticatePlayerDevice(
  request: Request,
  playerKey: string,
  options: { allowEnrollment?: boolean } = {},
): Promise<AuthenticatedPlayerDevice> {
  const { deviceId, credential } = credentialsFromRequest(request, playerKey);

  if (!DEVICE_ID_PATTERN.test(deviceId) || !DEVICE_CREDENTIAL_PATTERN.test(credential)) {
    throw new PlayerDeviceAuthError("Device credentials are required", 401);
  }

  await ensureScreenManagementSchema();
  const database = getDatabase();
  let screen = await findPlayer(playerKey);
  if (!screen) throw new PlayerDeviceAuthError("Screen not found", 404);

  const hash = credentialHash(credential);
  let enrolled = false;

  if (!screen.deviceCredentialHash && options.allowEnrollment) {
    const pairingToken = request.headers.get(PAIRING_TOKEN_HEADER)?.trim() ?? "";
    const now = new Date();
    if (!pairingTokenMatches(screen, pairingToken, now)) {
      throw new PlayerDeviceAuthError("A valid one-time pairing link is required", 401);
    }

    const pairingHash = hashPairingToken(pairingToken);
    const [claim] = await database
      .update(screens)
      .set({
        deviceId,
        deviceCredentialHash: hash,
        deviceClaimedAt: now,
        pairingTokenHash: null,
        pairingTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(and(
        eq(screens.id, screen.id),
        isNull(screens.deviceCredentialHash),
        eq(screens.pairingTokenHash, pairingHash),
        gte(screens.pairingTokenExpiresAt, now),
      ))
      .returning({ id: screens.id });

    if (claim) {
      screen = {
        ...screen,
        deviceId,
        deviceCredentialHash: hash,
        pairingTokenHash: null,
        pairingTokenExpiresAt: null,
      };
      enrolled = true;
    } else {
      screen = await findPlayer(playerKey);
      if (!screen) throw new PlayerDeviceAuthError("Screen not found", 404);
    }
  }

  if (!screen.deviceCredentialHash) {
    throw new PlayerDeviceAuthError("Screen has not completed device pairing", 401);
  }

  if (!credentialsMatch(screen, deviceId, credential)) {
    throw new PlayerDeviceAuthError("This screen is paired with a different device", 401);
  }

  return {
    screenId: screen.id,
    venueId: screen.venueId,
    deviceId,
    credential,
    timeZone: screen.timeZone,
    enrolled,
  };
}

export function playerDeviceCookieHeaders(
  playerKey: string,
  device: Pick<AuthenticatedPlayerDevice, "deviceId" | "credential">,
  secure: boolean,
) {
  const names = playerDeviceCookieNames(playerKey);
  const attributes = `Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  return [
    `${names.deviceId}=${encodeURIComponent(device.deviceId)}; ${attributes}`,
    `${names.credential}=${encodeURIComponent(device.credential)}; ${attributes}`,
  ];
}

export function playerDeviceAuthErrorResponse(error: unknown) {
  if (error instanceof PlayerDeviceAuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
