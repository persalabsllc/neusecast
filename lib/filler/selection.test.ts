import assert from "node:assert/strict";
import test from "node:test";
import {
  FILLER_ROTATION_WINDOW_MS,
  fillerRotationSeed,
  selectCompleteFillerRotation,
} from "./selection";

type TestFiller = {
  id: string;
  category: string;
  title: string;
  artworkUrl: string | null;
  updatedAt: Date;
};

function buildLibrary(count = 60): TestFiller[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `slide-${String(index + 1).padStart(2, "0")}`,
    category: ["fact", "history", "place_spotlight", "community"][index % 4],
    title: `Slide ${index + 1}`,
    artworkUrl: index % 2 === 0 ? `https://example.com/${index}.jpg` : null,
    updatedAt: new Date(Date.UTC(2026, 7, 26) - index * 60 * 60 * 1_000),
  }));
}

test("recent playback never shrinks the complete filler rotation", () => {
  const library = buildLibrary();
  const recentlyPlayedIds = new Set(library.slice(0, 55).map((row) => row.id));
  const rotation = selectCompleteFillerRotation(library, "screen:captain-97:100");
  const rotationIds = new Set(rotation.map((row) => row.id));

  assert.equal(rotation.length, library.length);
  assert.equal(rotationIds.size, library.length);
  assert.deepEqual([...recentlyPlayedIds].filter((id) => !rotationIds.has(id)), []);
  assert.ok(rotationIds.has("slide-60"), "the oldest eligible card remains in rotation");
});

test("hourly seeded shuffles change order without changing membership", () => {
  const library = buildLibrary();
  const firstSeed = fillerRotationSeed("screen:captain-97", Date.UTC(2026, 7, 26, 14, 15));
  const secondSeed = fillerRotationSeed(
    "screen:captain-97",
    Date.UTC(2026, 7, 26, 14, 15) + FILLER_ROTATION_WINDOW_MS,
  );
  const first = selectCompleteFillerRotation(library, firstSeed).map((row) => row.id);
  const second = selectCompleteFillerRotation(library, secondSeed).map((row) => row.id);

  assert.notDeepEqual(first, second);
  assert.deepEqual([...first].sort(), [...second].sort());
});

test("newer cards receive a bounded priority without excluding older cards", () => {
  const rows = buildLibrary(8).map((row, index) => ({
    ...row,
    category: "fact",
    updatedAt: new Date(Date.UTC(2026, 7, 26) - index * 24 * 60 * 60 * 1_000),
  }));
  const rotation = selectCompleteFillerRotation(rows, "screen:captain-97:recency");
  const firstThreeOriginalIds = new Set(rows.slice(0, 3).map((row) => row.id));

  assert.ok(firstThreeOriginalIds.has(rotation[0].id), "the first card comes from the three newest candidates");
  assert.equal(new Set(rotation.map((row) => row.id)).size, rows.length);
  assert.ok(rotation.some((row) => row.id === rows.at(-1)?.id), "the oldest card is retained");
});
