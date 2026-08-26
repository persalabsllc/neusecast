import assert from "node:assert/strict";
import test from "node:test";
import { newsroomCronOutcome } from "./cron-status";
import {
  automaticNewsroomSlot,
  effectiveNewsroomExpiry,
  isNewsroomEditionAirable,
  newsroomEditionHardExpiry,
  newsroomRetryCutoff,
  newsroomSlotWindow,
} from "./windows";

test("automatic newsroom slots retry throughout each Eastern daypart", () => {
  assert.equal(automaticNewsroomSlot(new Date("2026-08-26T09:05:00Z")), "afternoon");
  assert.equal(automaticNewsroomSlot(new Date("2026-08-26T10:05:00Z")), "morning");
  assert.equal(automaticNewsroomSlot(new Date("2026-08-26T18:05:00Z")), "morning");
  assert.equal(automaticNewsroomSlot(new Date("2026-08-26T19:05:00Z")), "afternoon");
  assert.equal(automaticNewsroomSlot(new Date("2026-08-27T03:05:00Z")), "afternoon");
  assert.equal(automaticNewsroomSlot(new Date("2026-08-27T04:05:00Z")), "afternoon");
  assert.equal(automaticNewsroomSlot(new Date("2026-08-27T09:05:00Z")), "afternoon");
});

test("morning editions end at 3:30 p.m. Eastern", () => {
  const scheduledAt = new Date("2026-08-26T10:05:00Z");
  assert.equal(newsroomEditionHardExpiry("morning", scheduledAt)?.toISOString(), "2026-08-26T19:30:00.000Z");
  assert.equal(newsroomSlotWindow("morning", scheduledAt).start.toISOString(), "2026-08-26T10:00:00.000Z");
});

test("afternoon editions end at 6:30 a.m. Eastern the next day", () => {
  const scheduledAt = new Date("2026-08-25T19:05:00Z");
  const edition = {
    slot: "afternoon",
    scheduledAt,
    expiresAt: new Date("2026-08-26T15:05:00Z"),
  };

  assert.equal(effectiveNewsroomExpiry(edition).toISOString(), "2026-08-26T10:30:00.000Z");
  assert.equal(isNewsroomEditionAirable(edition, new Date("2026-08-26T10:29:59Z")), true);
  assert.equal(isNewsroomEditionAirable(edition, new Date("2026-08-26T10:30:00Z")), false);
});

test("overnight afternoon catch-up remains anchored to the prior calendar day", () => {
  const overnightRetry = new Date("2026-08-27T06:05:00Z");
  const window = newsroomSlotWindow("afternoon", overnightRetry);
  assert.equal(window.start.toISOString(), "2026-08-26T19:00:00.000Z");
  assert.equal(window.end.toISOString(), "2026-08-27T10:30:00.000Z");
});

test("newsroom windows retain their Eastern wall-clock cutoff across DST", () => {
  const scheduledAt = new Date("2026-10-31T19:05:00Z");
  assert.equal(newsroomEditionHardExpiry("afternoon", scheduledAt)?.toISOString(), "2026-11-01T11:30:00.000Z");
});

test("failed or review editions are not retried inside the 45-minute cost guard", () => {
  assert.equal(
    newsroomRetryCutoff(new Date("2026-08-26T11:05:00Z")).toISOString(),
    "2026-08-26T10:20:00.000Z",
  );
});

test("an unpublished cron result is a non-2xx failure even without an exception", () => {
  const outcome = newsroomCronOutcome([{ published: false, error: null, skipped: true }]);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, 502);
  assert.equal(outcome.failures.length, 1);
});

test("only an entirely published cron run reports success", () => {
  assert.deepEqual(newsroomCronOutcome([{ published: true, error: null }]), {
    ok: true,
    failures: [],
    status: 200,
  });
});
