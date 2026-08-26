import assert from "node:assert/strict";
import test from "node:test";
import { itemAfter, itemAt, normalizeCommands, normalizeSnapshot } from "../src/contracts.mjs";

test("normalizes the broadcast API snapshot including nested media", () => {
  const snapshot = normalizeSnapshot({
    schemaVersion: 1,
    serverTime: "2026-08-26T16:00:05.000Z",
    output: { key: "main", overlayConfig: { showLogo: true } },
    log: {
      id: "log-1",
      startsAt: "2026-08-26T16:00:00.000Z",
      items: [
        {
          id: "item-1",
          plannedStartAt: "2026-08-26T16:00:00.000Z",
          plannedEndAt: "2026-08-26T16:01:00.000Z",
          allowTicker: false,
          media: { assetId: "asset-1", versionId: "version-1", playbackUrl: "https://media.example/one.mp4", mimeType: "video/mp4" }
        },
        { id: "item-2", durationMs: 30000, media: { assetId: "asset-2", versionId: "version-2", playbackUrl: "https://media.example/two.mp4" } }
      ]
    },
    graphics: [{ type: "weather", payload: { temperature: "72°" } }],
    ticker: [{ text: "Welcome to NeuseCast" }]
  });
  assert.equal(snapshot.log.items[0].mediaVersionId, "version-1");
  assert.deepEqual(snapshot.log.items[0].overlayPolicy, { ticker: false });
  assert.equal(snapshot.log.items[1].startMs, Date.parse("2026-08-26T16:01:00.000Z"));
  assert.deepEqual(snapshot.assets.map((asset) => asset.versionId), ["version-1", "version-2"]);
  assert.equal(itemAt(snapshot.log.items, Date.parse("2026-08-26T16:00:30.000Z")).id, "item-1");
  assert.equal(itemAfter(snapshot.log.items, Date.parse("2026-08-26T16:00:30.000Z")).id, "item-2");
});

test("normalizes additive command envelopes", () => {
  const result = normalizeCommands({ commands: [{ id: "c1", type: "take_live", payload: { sourceId: "cam" }, futureField: true }] });
  assert.equal(result.commands[0].payload.sourceId, "cam");
  assert.equal(result.commands[0].futureField, true);
  assert.equal(result.nextCursor, "c1");
});

test("compact snapshots join log references to top-level media assets", () => {
  const snapshot = normalizeSnapshot({
    serverTime: "2026-08-26T16:00:00.000Z",
    output: { key: "main", enabled: true, alwaysOn: true, controlRevision: 4 },
    log: {
      id: "log-compact",
      items: [{
        id: "item-compact",
        plannedStartAt: "2026-08-26T16:00:00.000Z",
        plannedEndAt: "2026-08-26T16:00:30.000Z",
        assetId: "asset-compact",
        mediaVersionId: "version-compact",
        transition: { type: "CUT" },
        overlayPolicy: { ticker: false }
      }]
    },
    assets: [{
      assetId: "asset-compact",
      versionId: "version-compact",
      playbackUrl: "https://media.example/compact.mp4",
      mimeType: "video/mp4"
    }],
    liveSources: [{
      id: "camera",
      protocol: "rtmp",
      metadata: { activeAutoFailover: true },
      activeAutoFailover: true
    }]
  });
  assert.equal(snapshot.log.items[0].mediaVersionId, "version-compact");
  assert.equal(snapshot.log.items[0].assetId, "asset-compact");
  assert.deepEqual(snapshot.log.items[0].overlayPolicy, { ticker: false });
  assert.equal(snapshot.assets.length, 1);
  assert.equal(snapshot.assets[0].downloadUrl, "https://media.example/compact.mp4");
  assert.equal(snapshot.assets[0].versionId, "version-compact");
  assert.equal(snapshot.liveSources[0].activeAutoFailover, true);
  assert.equal(snapshot.liveSources[0].metadata.activeAutoFailover, true);
});
