import { createHash } from "node:crypto";

// One-way hashes keep owner addresses out of public source while preserving
// CONTROL_ROOM_EMAILS as the extensible production configuration.
const builtInControlRoomEmailHashes = new Set([
  "12fe5491138708f1d9892f92587fa4dedd2e964d0d3d9b616d034f07b3a7c693",
  "3e04e9b39f7ccf41e7c87cbde649b922627efdc847f2182417c8b7978fe6b588",
]);

const configuredControlRoomEmails = new Set(
  (process.env.CONTROL_ROOM_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function isControlRoomEmail(email: string | null | undefined) {
  if (!email) return false;
  const normalizedEmail = email.trim().toLowerCase();
  if (configuredControlRoomEmails.has(normalizedEmail)) return true;

  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex");
  return builtInControlRoomEmailHashes.has(emailHash);
}
