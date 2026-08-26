import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isLiveSourceTakeable,
  isSupportedLiveProtocol,
  SUPPORTED_LIVE_PROTOCOLS,
} from "../lib/broadcast/live-source-safety.ts";

test("supported live protocols match the implemented playout inputs", () => {
  assert.deepEqual(SUPPORTED_LIVE_PROTOCOLS, ["rtmp", "rtmps", "srt", "rtsp", "decklink", "test"]);
  assert.equal(isSupportedLiveProtocol("webrtc"), false);
  assert.equal(isSupportedLiveProtocol("ndi"), false);
});

test("only enabled ready or already-live sources may be taken", () => {
  assert.equal(isLiveSourceTakeable({ protocol: "srt", status: "ready", enabled: true }), true);
  assert.equal(isLiveSourceTakeable({ protocol: "rtmps", status: "live", enabled: true }), true);
  assert.equal(isLiveSourceTakeable({ protocol: "srt", status: "offline", enabled: true }), false);
  assert.equal(isLiveSourceTakeable({ protocol: "srt", status: "connecting", enabled: true }), false);
  assert.equal(isLiveSourceTakeable({ protocol: "srt", status: "error", enabled: true }), false);
  assert.equal(isLiveSourceTakeable({ protocol: "srt", status: "ready", enabled: false }), false);
  assert.equal(isLiveSourceTakeable({ protocol: "webrtc", status: "ready", enabled: true }), false);
});

test("the live-source status update remains valid SQL", async () => {
  const route = await readFile(
    new URL("../app/api/broadcast/agent/events/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /update "broadcast_live_sources"\s+set\s+"status"/);
  assert.doesNotMatch(route, /update "broadcast_live_sources"\s+set\s+set\b/);
});
