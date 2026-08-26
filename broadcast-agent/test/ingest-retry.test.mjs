import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { IngestRetryTracker } from "../src/ingest-retry.mjs";

test("retry tracker backs off transient failures and becomes terminal at the bound", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "neusecast-retry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let now = 1000;
  const tracker = new IngestRetryTracker({ filename: path.join(directory, "retries.json"), maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 500, now: () => now });
  await tracker.initialize();
  const failure = { mediaVersionId: "version-1", error: Object.assign(new Error("network"), { retryable: true }) };
  assert.deepEqual(tracker.failed(failure), { attempt: 1, maxAttempts: 3, retryable: true, nextAttemptAt: new Date(1100).toISOString() });
  assert.equal(tracker.shouldAttempt({ versionId: "version-1" }), false);
  now = 1100;
  assert.equal(tracker.shouldAttempt({ versionId: "version-1" }), true);
  assert.equal(tracker.failed(failure).retryable, true);
  now = 1300;
  assert.equal(tracker.failed(failure).retryable, false);
  assert.equal(tracker.shouldAttempt({ versionId: "version-1" }), false);
  await tracker.persist();
  const restored = new IngestRetryTracker({ filename: path.join(directory, "retries.json"), maxAttempts: 3, now: () => now });
  await restored.initialize();
  assert.equal(restored.shouldAttempt({ versionId: "version-1" }), false);
});

test("deterministic validation failures are terminal immediately", () => {
  const tracker = new IngestRetryTracker({ filename: "/unused", maxAttempts: 5 });
  const result = tracker.failed({ mediaVersionId: "bad", error: new Error("invalid media") });
  assert.equal(result.retryable, false);
  assert.equal(result.attempt, 1);
});

test("zero max attempts keeps transport failures retryable indefinitely", () => {
  let now = 0;
  const tracker = new IngestRetryTracker({ filename: "/unused", maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100, now: () => now });
  const failure = { mediaVersionId: "offline", error: Object.assign(new Error("offline"), { retryable: true }) };
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const result = tracker.failed(failure);
    assert.equal(result.retryable, true);
    assert.equal(result.attempt, attempt);
    now += 100;
  }
});
