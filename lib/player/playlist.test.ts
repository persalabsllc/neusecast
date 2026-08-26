import assert from "node:assert/strict";
import test from "node:test";
import { interleaveRotation } from "./interleave";
import { isNeusecastHouseAdId } from "./house-ad";
import { nextRotationIndex } from "./runtime-rotation";
import type { PlayerItem } from "./types";

function filler(id: string): PlayerItem {
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
  };
}

test("a complete manifest rotation advances through every scheduled house bumper", () => {
  const fillers = Array.from({ length: 14 }, (_, index) => filler(`filler-${index + 1}`));
  const rotation = interleaveRotation([], [], fillers);
  const repeatedBuild = interleaveRotation([], [], fillers);
  const visitedIndexes: number[] = [];
  let cursor = 0;

  for (let step = 0; step < rotation.length; step += 1) {
    visitedIndexes.push(cursor);
    cursor = nextRotationIndex(rotation, rotation[cursor].id, {
      completedAt: Date.parse("2026-08-26T14:00:00Z") + step * 12_000,
      lastNewsroomPlayAt: 0,
    });
  }

  assert.equal(new Set(rotation.map((item) => item.id)).size, rotation.length);
  assert.deepEqual(repeatedBuild.map((item) => item.id), rotation.map((item) => item.id));
  assert.deepEqual(visitedIndexes, rotation.map((_, index) => index));
  assert.equal(cursor, 0);

  let previousHouseIndex = -1;
  for (const [index, item] of rotation.entries()) {
    if (!isNeusecastHouseAdId(item.id)) continue;
    assert.ok(index - previousHouseIndex - 1 <= 6);
    previousHouseIndex = index;
  }
  assert.equal(previousHouseIndex, rotation.length - 1);
});
