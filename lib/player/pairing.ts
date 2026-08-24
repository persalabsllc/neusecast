import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const PAIRING_TOKEN_TTL_MS = 24 * 60 * 60 * 1_000;

export function hashPairingToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createPlayerPairingToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashPairingToken(token),
    expiresAt: new Date(now.getTime() + PAIRING_TOKEN_TTL_MS),
  };
}

export function pairingCookieName(screenId: string) {
  return `neusecast_pair_${screenId.replaceAll("-", "")}`;
}
