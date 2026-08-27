import assert from "node:assert/strict";
import test from "node:test";
import {
  BROADCAST_MEDIA_CATEGORIES,
  BROADCAST_SEGMENTS,
  mediaClassification,
} from "../lib/broadcast/media-taxonomy.ts";

test("the broadcast taxonomy exposes segment-specific categories", () => {
  assert.ok(BROADCAST_MEDIA_CATEGORIES.includes("segment_intro"));
  assert.ok(BROADCAST_MEDIA_CATEGORIES.includes("segment_tease"));
  assert.ok(BROADCAST_MEDIA_CATEGORIES.includes("segment_outro"));
  assert.ok(BROADCAST_MEDIA_CATEGORIES.includes("station_id"));
  assert.deepEqual(BROADCAST_SEGMENTS, [
    "weather",
    "local_news",
    "community_calendar",
    "sports",
    "special_programming",
  ]);
});

test("segment media requires a valid segment and other media clears it", () => {
  assert.deepEqual(mediaClassification("segment_intro", "weather"), {
    category: "segment_intro",
    segment: "weather",
  });
  assert.equal(mediaClassification("segment_tease", null), null);
  assert.equal(mediaClassification("segment_outro", "traffic"), null);
  assert.deepEqual(mediaClassification("promo", "weather"), {
    category: "promo",
    segment: null,
  });
  assert.equal(mediaClassification("not_real", null), null);
});
