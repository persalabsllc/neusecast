import assert from "node:assert/strict";
import test from "node:test";
import { buildDailySchedule, MAX_PUBLISHED_LOG_ITEMS } from "../lib/broadcast/scheduler.ts";

const assets = [
  { assetId: "a", versionId: "v-a", name: "Program", category: "program", durationMs: 30_000 },
  { assetId: "b", versionId: "v-b", name: "Sponsor", category: "commercial", durationMs: 15_000 },
  { assetId: "c", versionId: "v-c", name: "Weather", category: "weather", durationMs: 20_000 },
];

test("fills the requested window with contiguous deterministic items", () => {
  const startsAt = new Date("2026-08-26T04:00:00.000Z");
  const endsAt = new Date(startsAt.getTime() + 180_000);
  const first = buildDailySchedule(assets, startsAt, endsAt, "2026-08-26");
  const second = buildDailySchedule(assets, startsAt, endsAt, "2026-08-26");

  assert.deepEqual(first, second);
  assert.deepEqual(first[0]?.plannedStartAt, startsAt);
  assert.deepEqual(first.at(-1)?.plannedEndAt, endsAt);
  assert.equal(first.every((item, index) => index === 0 || item.plannedStartAt.getTime() === first[index - 1].plannedEndAt.getTime()), true);
});

test("does not place commercial assets back-to-back when another choice exists", () => {
  const startsAt = new Date("2026-08-26T04:00:00.000Z");
  const planned = buildDailySchedule(assets, startsAt, new Date(startsAt.getTime() + 600_000), "commercial-spacing");
  assert.equal(planned.some((item, index) => item.category === "commercial" && planned[index - 1]?.category === "commercial"), false);
});

test("ignores media without a valid playable duration", () => {
  const startsAt = new Date("2026-08-26T04:00:00.000Z");
  assert.deepEqual(buildDailySchedule([{ ...assets[0], durationMs: 0 }], startsAt, new Date(startsAt.getTime() + 60_000), "empty"), []);
});

test("exposes an unfilled day when the delivery-safe event cap is reached", () => {
  const startsAt = new Date("2026-08-26T04:00:00.000Z");
  const endsAt = new Date(startsAt.getTime() + 86_400_000);
  const planned = buildDailySchedule(
    [{ assetId: "short", versionId: "short-v1", name: "Five-second bumper", category: "bumper", durationMs: 5_000 }],
    startsAt,
    endsAt,
    "bounded-day",
  );

  assert.equal(planned.length, MAX_PUBLISHED_LOG_ITEMS);
  assert.ok(planned.at(-1).plannedEndAt < endsAt);
});
