import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerAlert } from "./types";
import {
  createLastKnownAlertStore,
  filterUnexpiredAlerts,
  NwsHttpError,
  retryTransientNwsRequest,
} from "./weather-resilience";

const NOW = Date.parse("2026-08-26T12:00:00.000Z");

function alert(id: string, expiresAt: string | null): PlayerAlert {
  return {
    id,
    event: "Severe Thunderstorm Warning",
    headline: "A severe thunderstorm warning is in effect.",
    area: "Craven County",
    severity: "Severe",
    expiresAt,
  };
}

test("retries a transient socket failure and returns the successful response", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await retryTransientNwsRequest(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return "ok";
  }, {
    delaysMs: [150, 500],
    wait: async (delayMs) => { waits.push(delayMs); },
  });

  assert.equal(result, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(waits, [150]);
});

test("retries transient NWS server responses with bounded backoff", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await retryTransientNwsRequest(async () => {
    calls += 1;
    if (calls < 3) throw new NwsHttpError(503);
    return "recovered";
  }, {
    delaysMs: [150, 500],
    wait: async (delayMs) => { waits.push(delayMs); },
  });

  assert.equal(result, "recovered");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [150, 500]);
});

test("does not retry permanent HTTP failures or timeouts", async () => {
  for (const error of [new NwsHttpError(404), Object.assign(new Error("timed out"), { name: "TimeoutError" })]) {
    let calls = 0;
    await assert.rejects(retryTransientNwsRequest(async () => {
      calls += 1;
      throw error;
    }, { delaysMs: [0, 0], wait: async () => undefined }), error);
    assert.equal(calls, 1);
  }
});

test("filters expired, invalid, and unbounded warnings", () => {
  assert.deepEqual(
    filterUnexpiredAlerts([
      alert("active", "2026-08-26T12:05:00.000Z"),
      alert("expired", "2026-08-26T11:59:59.000Z"),
      alert("invalid", "not-a-date"),
      alert("unbounded", null),
    ], NOW).map((item) => item.id),
    ["active"],
  );
});

test("last-known warning state expires and a successful empty response clears it", () => {
  const store = createLastKnownAlertStore();
  assert.equal(store.current(NOW), null);

  store.remember([alert("active", "2026-08-26T12:05:00.000Z")]);
  assert.deepEqual(store.current(NOW)?.map((item) => item.id), ["active"]);
  assert.deepEqual(store.current(Date.parse("2026-08-26T12:06:00.000Z")), []);

  store.remember([]);
  assert.deepEqual(store.current(NOW), []);
});
