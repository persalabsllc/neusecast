import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerItem } from "./types";
import {
  nextRotationIndex,
  playableItemsForRuntime,
  retainedActiveIndex,
  shouldReloadForPlayerVersion,
  shouldRefreshManifestAfterPlayback,
} from "./runtime-rotation";
import {
  generatedContentMarketsForScreen,
  NETWORK_WIDE_CONTENT_MARKET,
  REGIONAL_CONTENT_MARKET,
} from "./content-markets";
import { isNeusecastHouseAdId, neusecastHouseAdPlacement } from "./house-ad";

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

test("unique house bumper placements cannot jump a player back into a six-slide loop", () => {
  const items = [
    ...Array.from({ length: 6 }, (_, index) => item(`first-${index + 1}`)),
    neusecastHouseAdPlacement(0),
    ...Array.from({ length: 6 }, (_, index) => item(`second-${index + 1}`)),
    neusecastHouseAdPlacement(1),
    item("tail"),
  ];
  const visitedIds: string[] = [items[0].id];
  let currentId = items[0].id;

  for (let step = 1; step < items.length; step += 1) {
    const nextIndex = nextRotationIndex(items, currentId, {
      completedAt: Date.parse("2026-08-26T14:00:00Z") + step * 12_000,
      lastNewsroomPlayAt: 0,
    });
    currentId = items[nextIndex].id;
    visitedIds.push(currentId);
  }

  assert.equal(new Set(items.map((entry) => entry.id)).size, items.length);
  assert.deepEqual(visitedIds, items.map((entry) => entry.id));
  assert.equal(retainedActiveIndex(items, neusecastHouseAdPlacement(1).id), 13);
  assert.equal(isNeusecastHouseAdId(neusecastHouseAdPlacement(0).id), true);
  assert.equal(isNeusecastHouseAdId(neusecastHouseAdPlacement(1).id), true);
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

test("played-ad filtering removes paid ads but keeps every scheduled house bumper", () => {
  const houseAd = item("house", { kind: "advertisement", campaignId: null });
  const paidAd = item("paid", { kind: "advertisement", campaignId: "campaign-1" });
  const playable = playableItemsForRuntime([
    item("fact-one"),
    houseAd,
    item("fact-two"),
    houseAd,
    paidAd,
  ], {
    manifestVersion: "current",
    playedAdvertisements: {
      manifestVersion: "current",
      ids: new Set(["house", "paid"]),
    },
    preview: false,
    serverNowMs: Date.parse("2026-08-26T14:00:00Z"),
  });

  assert.deepEqual(playable.map((entry) => entry.id), ["fact-one", "house", "fact-two", "house"]);
});

test("player reloads only when two concrete deployment versions differ", () => {
  assert.equal(shouldReloadForPlayerVersion("abc123", "def456"), true);
  assert.equal(shouldReloadForPlayerVersion("abc123", "abc123"), false);
  assert.equal(shouldReloadForPlayerVersion("abc123", undefined), false);
  assert.equal(shouldReloadForPlayerVersion("abc123", "neusecast-web"), false);
  assert.equal(shouldReloadForPlayerVersion("neusecast-web", "def456"), false);
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
