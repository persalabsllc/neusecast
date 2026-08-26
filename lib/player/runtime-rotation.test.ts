import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerItem } from "./types";
import {
  nextRotationIndex,
  playableItemsForRuntime,
  retainedActiveIndex,
  shouldRefreshManifestAfterPlayback,
} from "./runtime-rotation";
import {
  generatedContentMarketsForScreen,
  NETWORK_WIDE_CONTENT_MARKET,
  REGIONAL_CONTENT_MARKET,
} from "./content-markets";

function item(id: string, overrides: Partial<PlayerItem> = {}): PlayerItem {
  return {
    id,
    kind: "trivia",
    source: "generated_content",
    campaignId: null,
    creativeId: null,
    durationSeconds: 12,
    eyebrow: "Did you know?",
    title: id,
    body: id,
    callToAction: null,
    mediaUrl: null,
    theme: "aqua",
    sponsor: null,
    contentCategory: "fact",
    ...overrides,
  };
}

test("evergreen cards continue through the full rotation without a client replay veto", () => {
  const items = [item("fact-one"), item("history-two", { kind: "history" }), item("ident", {
    kind: "ident",
    contentCategory: null,
  })];

  assert.equal(nextRotationIndex(items, "fact-one", {
    completedAt: Date.parse("2026-08-26T14:00:00Z"),
    lastNewsroomPlayAt: 0,
  }), 1);
  assert.equal(nextRotationIndex(items, "history-two", {
    completedAt: Date.parse("2026-08-26T14:00:12Z"),
    lastNewsroomPlayAt: 0,
  }), 2);
  assert.equal(nextRotationIndex(items, "ident", {
    completedAt: Date.parse("2026-08-26T14:00:24Z"),
    lastNewsroomPlayAt: 0,
  }), 0);
});

test("newsroom spacing remains active while routine content advances", () => {
  const completedAt = Date.parse("2026-08-26T14:00:00Z");
  const items = [
    item("ident", { kind: "ident", contentCategory: null }),
    item("newsroom", { kind: "news", source: "newsroom", contentCategory: null }),
    item("fact"),
  ];

  assert.equal(nextRotationIndex(items, "ident", {
    completedAt,
    lastNewsroomPlayAt: completedAt - 10 * 60_000,
  }), 2);
  assert.equal(nextRotationIndex(items, "ident", {
    completedAt,
    lastNewsroomPlayAt: completedAt - 60 * 60_000,
  }), 1);
});

test("only campaign-backed ads request an immediate manifest refresh", () => {
  const houseAd = item("house", { kind: "advertisement", campaignId: null });
  const paidAd = item("paid", { kind: "advertisement", campaignId: "campaign-1" });

  assert.equal(shouldRefreshManifestAfterPlayback(houseAd), false);
  assert.equal(shouldRefreshManifestAfterPlayback(paidAd), true);
  assert.equal(shouldRefreshManifestAfterPlayback(item("fact")), false);
});

test("manifest refresh retains the current item in the filtered playlist domain", () => {
  const now = Date.parse("2026-08-26T14:00:00Z");
  const playable = playableItemsForRuntime([
    item("expired", { expiresAt: "2026-08-26T13:59:59Z" }),
    item("current"),
    item("future", { expiresAt: "2026-08-26T15:00:00Z" }),
  ], {
    manifestVersion: "next",
    playedAdvertisements: { manifestVersion: "previous", ids: new Set() },
    preview: false,
    serverNowMs: now,
  });

  assert.deepEqual(playable.map((entry) => entry.id), ["current", "future"]);
  assert.equal(retainedActiveIndex(playable, "current"), 0);
  assert.equal(retainedActiveIndex(playable, "missing"), 0);
});

test("manifest churn advances to the first surviving successor instead of resetting", () => {
  const previous = [item("prefix"), item("current"), item("next-a"), item("next-b")];
  const next = [item("prefix"), item("next-a"), item("next-b")];

  assert.equal(retainedActiveIndex(next, "current", previous), 1);
  assert.equal(retainedActiveIndex([item("prefix"), item("current")], "next-b", previous), 0);
});

test("venue players receive exact, regional, and network-wide generated content", () => {
  assert.deepEqual(generatedContentMarketsForScreen("New Bern"), [
    "New Bern",
    REGIONAL_CONTENT_MARKET,
    NETWORK_WIDE_CONTENT_MARKET,
  ]);
  assert.deepEqual(generatedContentMarketsForScreen(REGIONAL_CONTENT_MARKET), [
    REGIONAL_CONTENT_MARKET,
    NETWORK_WIDE_CONTENT_MARKET,
  ]);
});
