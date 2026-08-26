import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function parseDateMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function newEventId() {
  return randomUUID();
}

export function withoutControlCharacters(value, label = "value") {
  const text = String(value ?? "");
  if (/\r|\n|\0/.test(text)) throw new Error(`${label} contains a forbidden control character`);
  return text;
}

export function safeIdentifier(value, label = "identifier") {
  const text = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(text)) {
    throw new Error(`${label} must contain only letters, numbers, dots, colons, underscores, and hyphens`);
  }
  return text;
}

export async function atomicWriteJson(filename, value) {
  const directory = path.dirname(filename);
  await mkdir(directory, { recursive: true });
  const temporary = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, filename);
    renamed = true;

    // Persist the rename itself as well as the file contents. This makes the
    // command journal resilient to a host power loss, not only a process exit.
    const parent = await open(directory, "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } finally {
    if (!renamed) await unlink(temporary).catch(() => {});
  }
}

export async function durableUnlink(filename) {
  const directory = path.dirname(filename);
  try {
    await unlink(filename);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return false;
  }
  const parent = await open(directory, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  return true;
}

export function sleep(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    }, { once: true });
  });
}

export function errorDetails(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, code: error.code };
  }
  return { name: "Error", message: String(error) };
}
