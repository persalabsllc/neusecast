import assert from "node:assert/strict";
import test from "node:test";
import { compactAgentProgramItem } from "../lib/broadcast/agent-snapshot.ts";
import {
  MAX_AGENT_SNAPSHOT_TEST_BYTES,
} from "../lib/broadcast/limits.ts";
import { MAX_PUBLISHED_LOG_ITEMS } from "../lib/broadcast/scheduler.ts";

function uuid(index) {
  return `${index.toString(16).padStart(8, "0")}-1234-4123-8123-123456789012`;
}

test("a maximum dense published day stays below the safe snapshot payload budget", () => {
  const items = Array.from({ length: MAX_PUBLISHED_LOG_ITEMS }, (_, index) => {
    const itemId = uuid(index);
    const assetId = uuid(index + MAX_PUBLISHED_LOG_ITEMS);
    const versionId = uuid(index + MAX_PUBLISHED_LOG_ITEMS * 2);
    return compactAgentProgramItem({
      id: itemId,
      label: "L".repeat(240),
      plannedStartAt: "2026-08-26T00:00:00.000Z",
      plannedEndAt: "2026-08-26T00:00:30.000Z",
      durationMs: 30_000,
      transition: { type: "MIX", frames: 12 },
      overlayPolicy: { ticker: false },
      media: { versionId, assetId },
      liveSource: null,
    });
  });
  const assets = Array.from({ length: MAX_PUBLISHED_LOG_ITEMS }, (_, index) => ({
    versionId: uuid(index + MAX_PUBLISHED_LOG_ITEMS * 2),
    assetId: uuid(index + MAX_PUBLISHED_LOG_ITEMS),
    playbackUrl: `https://blob.example/${index}/${"a".repeat(455)}.mp4`,
    mimeType: "video/mp4",
    sha256: "a".repeat(64),
  }));
  const response = {
    ok: true,
    schemaVersion: 1,
    serverTime: "2026-08-26T00:00:00.000Z",
    pollAfterMs: 5_000,
    agent: { id: uuid(10_000), key: "neusecast-playout-01", name: "NeuseCast Playout 01" },
    output: { id: uuid(10_001), key: "main", enabled: true, alwaysOn: true, controlRevision: 9 },
    log: {
      id: uuid(10_002),
      serviceDate: "2026-08-26",
      name: "N".repeat(180),
      status: "published",
      revision: 4,
      timeZone: "America/New_York",
      startsAt: "2026-08-26T00:00:00.000Z",
      endsAt: "2026-08-27T00:00:00.000Z",
      items,
    },
    assets,
    ingestQueue: [],
    graphics: Array.from({ length: 20 }, (_, index) => ({ id: uuid(11_000 + index), kind: "ticker", data: {} })),
    ticker: Array.from({ length: 100 }, (_, index) => ({ id: uuid(12_000 + index), message: "T".repeat(300) })),
    liveSources: Array.from({ length: 20 }, (_, index) => ({
      id: uuid(13_000 + index),
      name: "Camera",
      protocol: "srt",
      endpointUrl: `srt://camera.example/${"s".repeat(455)}`,
    })),
  };

  const bytes = Buffer.byteLength(JSON.stringify(response));
  assert.ok(bytes < MAX_AGENT_SNAPSHOT_TEST_BYTES, `${bytes.toLocaleString()} bytes exceeds the safe payload budget`);
});
