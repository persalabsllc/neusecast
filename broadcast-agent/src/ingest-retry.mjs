import { readFile } from "node:fs/promises";
import { atomicWriteJson } from "./util.mjs";

export class IngestRetryTracker {
  constructor({ filename, maxAttempts = 5, baseDelayMs = 5000, maxDelayMs = 300000, now = () => Date.now() }) {
    this.filename = filename;
    this.maxAttempts = maxAttempts;
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.now = now;
    this.entries = {};
  }

  async initialize() {
    try {
      const parsed = JSON.parse(await readFile(this.filename, "utf8"));
      if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === "object") this.entries = parsed.entries;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  shouldAttempt(asset) {
    const id = mediaVersionId(asset);
    const entry = this.entries[id];
    if (!entry) return true;
    if (entry.terminal) return false;
    return Number(entry.nextAttemptAtMs ?? 0) <= this.now();
  }

  succeeded(id) {
    delete this.entries[String(id)];
  }

  forget(id) {
    delete this.entries[String(id)];
  }

  failed(failure) {
    const id = String(failure.mediaVersionId);
    const previous = this.entries[id];
    const attempt = Number(previous?.attempt ?? 0) + 1;
    const sourceRetryable = failure.error?.retryable === true;
    const retryable = sourceRetryable && (this.maxAttempts === 0 || attempt < this.maxAttempts);
    const delayMs = retryable ? Math.min(this.maxDelayMs, this.baseDelayMs * (2 ** Math.max(0, attempt - 1))) : 0;
    const nextAttemptAtMs = retryable ? this.now() + delayMs : null;
    this.entries[id] = {
      attempt,
      terminal: !retryable,
      nextAttemptAtMs,
      lastError: failure.error instanceof Error ? failure.error.message : String(failure.error),
      updatedAt: new Date(this.now()).toISOString()
    };
    return {
      attempt,
      maxAttempts: this.maxAttempts,
      retryable,
      nextAttemptAt: nextAttemptAtMs === null ? null : new Date(nextAttemptAtMs).toISOString()
    };
  }

  async persist() {
    await atomicWriteJson(this.filename, { version: 1, entries: this.entries });
  }
}

function mediaVersionId(asset) {
  return String(asset?.versionId ?? asset?.mediaVersionId ?? asset?.id ?? asset?.assetId ?? "unknown");
}
