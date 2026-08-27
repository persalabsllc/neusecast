import assert from "node:assert/strict";
import test from "node:test";
import { PlayoutScheduler, streamProducerFor } from "../src/scheduler.mjs";

class FakeAmcp {
  constructor() { this.commands = []; }
  async send(command) { this.commands.push(command); return { code: 202, lines: [] }; }
}

class FakeEvents {
  constructor() { this.events = []; }
  add(type, details) { this.events.push({ type, ...details }); }
}

class FakeGraphics {
  setOverlayPolicy(policy) { this.policy = policy; }
  async sync() { this.synced = true; }
  async clear(options = {}) { this.cleared = true; this.clearOptions = options; }
}

class BlockingAmcp {
  constructor() {
    this.commands = [];
    this.started = new Promise((resolve) => { this.markStarted = resolve; });
    this.block = new Promise((resolve) => { this.release = resolve; });
    this.first = true;
  }
  async send(command) {
    this.commands.push(command);
    if (this.first) {
      this.first = false;
      this.markStarted();
      await this.block;
    }
    return { code: 202, lines: [] };
  }
}

class FailNextAmcp extends FakeAmcp {
  async send(command) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("AMCP replacement failed");
    }
    return super.send(command);
  }
}

class FailNextGraphics extends FakeGraphics {
  async sync() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("CG template failed");
    }
    return super.sync();
  }
}

test("scheduler joins a current log item and preloads the next one", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const events = new FakeEvents();
  const graphics = new FakeGraphics();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 8000, eventBuffer: events, graphics });
  scheduler.update({
    serverTimeMs: now,
    receivedAtMs: now,
    log: {
      id: "log",
      items: [
        { id: "one", assetId: "a1", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 3000, overlayPolicy: "all", media: {} },
        { id: "two", assetId: "a2", mediaVersionId: "v2", startMs: now + 3000, endMs: now + 10000, overlayPolicy: "all", media: {} }
      ]
    }
  }, new Map([
    ["v1", { clipName: "neusecast/one", validated: true }],
    ["v2", { clipName: "neusecast/two", validated: true }]
  ]));
  await scheduler.tick();
  assert.match(amcp.commands[0], /^PLAY 1-10 "neusecast\/one" SEEK /);
  assert.match(amcp.commands[1], /^LOADBG 1-10 "neusecast\/two"/);
  assert.equal(events.events.find((event) => event.type === "now_playing").programItemId, "one");
});

test("scheduler plays the allowlisted Weather Center HTML producer", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const events = new FakeEvents();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: events, graphics: new FakeGraphics() });
  await scheduler.update({
    output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [{
      id: "weather", sourceKind: "dynamic", dynamicKey: "weather_center",
      dynamicUrl: "https://www.neusecast.com/weather-center", startMs: now - 100,
      endMs: now + 90_000, durationMs: 90_000, overlayPolicy: "none"
    }] }
  }, new Map());
  await scheduler.tick();
  assert.equal(amcp.commands[0], 'PLAY 1-10 [HTML] "https://www.neusecast.com/weather-center"');
  assert.equal(events.events.find((event) => event.type === "now_playing").dynamicKey, "weather_center");
});

test("a republished item cannot play a preload from its prior media version", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const scheduler = new PlayoutScheduler({
    amcp,
    channel: 1,
    layer: 10,
    fps: 30,
    fallbackClip: "FALLBACK",
    preloadLeadMs: 8000,
    eventBuffer: new FakeEvents(),
    graphics: new FakeGraphics()
  });
  const item = (mediaVersionId) => ({
    id: "same-item",
    assetId: "asset",
    mediaVersionId,
    startMs: now + 5000,
    endMs: now + 15000,
    overlayPolicy: "all",
    media: {}
  });

  await scheduler.update({
    output: { alwaysOn: true },
    serverTimeMs: now,
    receivedAtMs: now,
    log: { id: "log-v1", items: [item("version-1")] }
  }, new Map([["version-1", { mediaVersionId: "version-1", clipName: "neusecast/old", validated: true }]]));
  await scheduler.tick();
  assert.ok(amcp.commands.includes('LOADBG 1-10 "neusecast/old"'));

  await scheduler.update({
    output: { alwaysOn: true },
    serverTimeMs: now + 6000,
    receivedAtMs: Date.now(),
    log: { id: "log-v2", items: [item("version-2")] }
  }, new Map([["version-2", { mediaVersionId: "version-2", clipName: "neusecast/new", validated: true }]]));
  await scheduler.tick();

  assert.equal(amcp.commands.some((command) => command === "PLAY 1-10"), false);
  assert.ok(amcp.commands.some((command) => command.startsWith('PLAY 1-10 "neusecast/new"')));
  assert.equal(scheduler.status().current.mediaVersionId, "version-2");
});

test("a rejected optional preload does not restart or dirty the on-air item", async () => {
  const now = Date.now();
  class PreloadRejectingAmcp extends FakeAmcp {
    async send(command) {
      this.commands.push(command);
      if (command.startsWith("LOADBG ")) throw new Error("AMCP 400 LOADBG ERROR");
      return { code: 202, lines: [] };
    }
  }
  const amcp = new PreloadRejectingAmcp();
  const events = new FakeEvents();
  const scheduler = new PlayoutScheduler({
    amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK",
    preloadLeadMs: 8000, eventBuffer: events, graphics: new FakeGraphics()
  });
  await scheduler.update({
    output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [
      { id: "on-air", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 3000, overlayPolicy: "all" },
      { id: "next", mediaVersionId: "v2", startMs: now + 3000, endMs: now + 9000, overlayPolicy: "all" }
    ] }
  }, new Map([
    ["v1", { mediaVersionId: "v1", clipName: "neusecast/on-air", validated: true }],
    ["v2", { mediaVersionId: "v2", clipName: "neusecast/next", validated: true }]
  ]));
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(scheduler.status().current.itemId, "on-air");
  assert.equal(amcp.commands.filter((command) => command.startsWith("PLAY ")).length, 1);
  assert.equal(amcp.commands.filter((command) => command.startsWith("LOADBG ")).length, 1);
  assert.equal(events.events.filter((event) => event.code === "MEDIA_PRELOAD_FAILED").length, 1);
});

test("live producers are scheme allowlisted", () => {
  assert.equal(streamProducerFor({ input: { type: "stream", url: "srt://ingest.example:9000?streamid=cam" } }), '"srt://ingest.example:9000?streamid=cam"');
  assert.throws(() => streamProducerFor({ input: { type: "stream", url: "file:///etc/passwd" } }), /Unsupported/);
  assert.throws(() => streamProducerFor({ input: { type: "stream", url: "srt://ok\nCLEAR 1" } }), /Invalid URL|control/);
});

test("live sources accept the API shape and env-backed secret URL", () => {
  assert.equal(streamProducerFor({ protocol: "srt", endpointUrl: "srt://public.example:9000" }), '"srt://public.example:9000"');
  assert.equal(
    streamProducerFor({ protocol: "rtsp", endpointUrl: "rtsp://redacted.example/cam", credentialSecretRef: "env:STUDIO_SOURCE" }, { STUDIO_SOURCE: "rtsp://user:secret@camera.example/live" }),
    '"rtsp://user:secret@camera.example/live"'
  );
  assert.throws(() => streamProducerFor({ protocol: "srt", endpointUrl: "srt://example", credentialSecretRef: "vault:key" }), /env:VARIABLE_NAME/);
  assert.throws(() => streamProducerFor({ protocol: "srt", endpointUrl: "srt://example", credentialSecretRef: "env:MISSING" }, {}), /environment variable is missing/);
});

test("test pattern and Studio DeckLink endpoint identifiers map to Caspar producers", () => {
  assert.equal(streamProducerFor({ protocol: "test" }), "#06131D");
  assert.equal(streamProducerFor({ protocol: "decklink", endpointUrl: "2" }), "DECKLINK DEVICE 2");
  assert.equal(streamProducerFor({ protocol: "decklink", endpointUrl: "DeckLink Duo (1)" }), "DECKLINK DEVICE 1");
  assert.throws(() => streamProducerFor({ protocol: "decklink", endpointUrl: "DeckLink Duo" }), /device index/);
  assert.throws(() => streamProducerFor({ protocol: "webrtc", endpointUrl: "https://example.test" }), /Unsupported/);
  assert.throws(() => streamProducerFor({ protocol: "ndi", endpointUrl: "Studio Camera" }), /Unsupported/);
});

test("missing scheduled media falls back once instead of flooding AMCP", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const events = new FakeEvents();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: events, graphics: new FakeGraphics() });
  scheduler.update({ serverTimeMs: now, receivedAtMs: now, log: { id: "log", items: [{ id: "missing", mediaVersionId: "v-missing", startMs: now - 100, endMs: now + 10000, overlayPolicy: "all", media: {} }] } }, new Map());
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(amcp.commands.filter((command) => command.includes("FALLBACK")).length, 1);
  assert.equal(events.events.filter((event) => event.code === "MEDIA_NOT_READY").length, 1);
});

test("skip reports missing target media as failed after putting fallback on air", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const scheduler = new PlayoutScheduler({
    amcp,
    channel: 1,
    layer: 10,
    fps: 30,
    fallbackClip: "FALLBACK",
    preloadLeadMs: 1000,
    eventBuffer: new FakeEvents(),
    graphics: new FakeGraphics()
  });
  await scheduler.update({
    output: { alwaysOn: true },
    serverTimeMs: now,
    receivedAtMs: now,
    log: { id: "log", items: [
      { id: "current", mediaVersionId: "ready", startMs: now - 1000, endMs: now + 1000, overlayPolicy: "all", media: {} },
      { id: "missing", mediaVersionId: "missing", startMs: now + 1000, endMs: now + 5000, overlayPolicy: "all", media: {} }
    ] }
  }, new Map([["ready", { mediaVersionId: "ready", clipName: "neusecast/ready", validated: true }]]));
  await scheduler.tick();

  await assert.rejects(() => scheduler.skip(), /media is not ready: missing; fallback is on air/);
  assert.equal(scheduler.status().mode, "fallback");
  assert.equal(amcp.commands.at(-1), 'PLAY 1-10 "FALLBACK" LOOP');
});

test("an unavailable manual target cannot knock a live source off air", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const scheduler = new PlayoutScheduler({
    amcp,
    channel: 1,
    layer: 10,
    fps: 30,
    fallbackClip: "FALLBACK",
    preloadLeadMs: 1000,
    eventBuffer: new FakeEvents(),
    graphics: new FakeGraphics()
  });
  await scheduler.update({
    output: { alwaysOn: true },
    serverTimeMs: now,
    receivedAtMs: now,
    log: { id: "log", items: [
      { id: "missing", mediaVersionId: "missing", startMs: now, endMs: now + 5000, overlayPolicy: "all", media: {} }
    ] }
  }, new Map());
  await scheduler.takeLive({ id: "camera-a", protocol: "test" });

  await assert.rejects(() => scheduler.takeItem("missing"), /current live source remains on air/);
  assert.equal(scheduler.status().mode, "live");
  assert.equal(scheduler.status().current.sourceId, "camera-a");
  assert.deepEqual(amcp.commands, ["PLAY 1-10 #06131D"]);
});

test("a disabled output clears layers and refuses live takes", async () => {
  const amcp = new FakeAmcp();
  const graphics = new FakeGraphics();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics });
  await scheduler.applyOutputEnabled(false);
  assert.equal(scheduler.status().mode, "disabled");
  assert.deepEqual(amcp.commands, ["CLEAR 1-10"]);
  assert.equal(graphics.cleared, true);
  await assert.rejects(() => scheduler.takeLive({ id: "camera", protocol: "srt", endpointUrl: "srt://example:9000" }), /disabled/);
});

test("a rejected disabled clear is retried by the next authoritative snapshot", async () => {
  class RejectFirstClearAmcp extends FakeAmcp {
    async send(command) {
      this.commands.push(command);
      if (this.commands.length === 1) throw new Error("CLEAR rejected");
      return { code: 202, lines: [] };
    }
  }
  const amcp = new RejectFirstClearAmcp();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics: new FakeGraphics() });
  await assert.rejects(() => scheduler.applyOutputEnabled(false), /CLEAR rejected/);
  assert.equal(scheduler.status().mode, "disabled");
  assert.equal(scheduler.programClearConfirmed, false);
  await scheduler.applyOutputEnabled(false);
  assert.deepEqual(amcp.commands, ["CLEAR 1-10", "CLEAR 1-10"]);
  assert.equal(scheduler.programClearConfirmed, true);
});

test("a rejected graphics clear is retried before disabled output is confirmed", async () => {
  class RejectFirstGraphicsClear extends FakeGraphics {
    async clear() {
      if (!this.rejected) {
        this.rejected = true;
        throw new Error("graphics clear rejected");
      }
      return super.clear();
    }
  }
  const amcp = new FakeAmcp();
  const graphics = new RejectFirstGraphicsClear();
  const events = new FakeEvents();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: events, graphics });
  await assert.rejects(() => scheduler.applyOutputEnabled(false), /graphics clear remains unconfirmed/);
  assert.equal(scheduler.programClearConfirmed, true);
  assert.equal(scheduler.graphicsClearConfirmed, false);
  await scheduler.applyOutputEnabled(false);
  assert.equal(amcp.commands.filter((command) => command === "CLEAR 1-10").length, 2);
  assert.equal(scheduler.graphicsClearConfirmed, true);
  assert.ok(events.events.some((event) => event.code === "GRAPHICS_CLEAR_FAILED"));
});

test("alwaysOn false clears an unscheduled gap instead of filling it", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const graphics = new FakeGraphics();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics });
  scheduler.update({ output: { alwaysOn: false }, serverTimeMs: now, receivedAtMs: now, log: { id: "log", items: [] } }, new Map());
  await scheduler.tick();
  assert.deepEqual(amcp.commands, ["CLEAR 1-10"]);
  assert.equal(graphics.cleared, true);
  assert.equal(scheduler.status().mode, "standby");
  assert.equal(graphics.clearOptions.force, true);
});

test("starting an alwaysOn false gap never flashes graphics before standby", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const graphics = new FakeGraphics();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics });
  scheduler.update({ output: { alwaysOn: false }, serverTimeMs: now, receivedAtMs: now, log: { id: "log", items: [] } }, new Map());
  await scheduler.applyOutputEnabled(false);
  graphics.synced = false;
  graphics.cleared = false;
  amcp.commands.length = 0;
  await scheduler.startOutput();
  assert.equal(graphics.synced, false);
  assert.equal(graphics.cleared, true);
  assert.deepEqual(amcp.commands, ["CLEAR 1-10"]);
});

test("scheduler rejoins the current item after a real Caspar disconnect", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics: new FakeGraphics() });
  scheduler.update({ output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now, log: { id: "log", items: [{ id: "one", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 10000, overlayPolicy: "all", media: {} }] } }, new Map([["v1", { clipName: "neusecast/one", validated: true }]]));
  await scheduler.tick();
  scheduler.handleCasparDisconnect();
  await scheduler.reconcileAfterReconnect();
  assert.equal(amcp.commands.filter((command) => command.startsWith("PLAY 1-10")).length, 2);
});

test("disabled output reasserts program and graphics clear after reconnect", async () => {
  const amcp = new FakeAmcp();
  const graphics = new FakeGraphics();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics });
  await scheduler.applyOutputEnabled(false);
  scheduler.handleCasparDisconnect();
  await scheduler.reconcileAfterReconnect();
  assert.deepEqual(amcp.commands, ["CLEAR 1-10", "CLEAR 1-10"]);
  assert.equal(graphics.cleared, true);
});

test("live take serializes ahead of a concurrent automation tick", async () => {
  const now = Date.now();
  const amcp = new BlockingAmcp();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics: new FakeGraphics() });
  scheduler.update({ output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now, log: { id: "log", items: [{ id: "one", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 10000, overlayPolicy: "all", media: {} }] } }, new Map([["v1", { mediaVersionId: "v1", clipName: "neusecast/one", validated: true }]]));
  const live = scheduler.takeLive({ id: "test", protocol: "test" });
  await amcp.started;
  const tick = scheduler.tick();
  amcp.release();
  await Promise.all([live, tick]);
  assert.deepEqual(amcp.commands, ["PLAY 1-10 #06131D"]);
  assert.equal(scheduler.status().mode, "live");
});

test("stop serializes ahead of a concurrent tick and leaves program clear", async () => {
  const now = Date.now();
  const amcp = new BlockingAmcp();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics: new FakeGraphics() });
  scheduler.update({ output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now, log: { id: "log", items: [{ id: "one", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 10000, overlayPolicy: "all", media: {} }] } }, new Map([["v1", { mediaVersionId: "v1", clipName: "neusecast/one", validated: true }]]));
  const stop = scheduler.stopOutput();
  await amcp.started;
  const tick = scheduler.tick();
  amcp.release();
  await Promise.all([stop, tick]);
  assert.deepEqual(amcp.commands, ["CLEAR 1-10"]);
  assert.equal(scheduler.status().mode, "disabled");
});

test("a new media version never falls back to the asset alias for an old version", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const stale = { mediaVersionId: "v1", assetId: "asset", clipName: "neusecast/old", validated: true };
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics: new FakeGraphics() });
  scheduler.update({ output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now, log: { id: "log", items: [{ id: "new", assetId: "asset", mediaVersionId: "v2", startMs: now - 1000, endMs: now + 10000, overlayPolicy: "all", media: {} }] } }, new Map([["asset", stale], ["v1", stale]]));
  await scheduler.tick();
  assert.equal(amcp.commands[0], 'PLAY 1-10 "FALLBACK" LOOP');
});

test("skip from live completes the handoff and resumes automation state", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const events = new FakeEvents();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: events, graphics: new FakeGraphics() });
  scheduler.update({
    output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [
      { id: "due", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 1000, overlayPolicy: "all", media: {} },
      { id: "next", mediaVersionId: "v2", startMs: now + 1000, endMs: now + 5000, durationMs: 4000, overlayPolicy: "all", media: {} }
    ] }
  }, new Map([
    ["v1", { mediaVersionId: "v1", clipName: "neusecast/due", validated: true }],
    ["v2", { mediaVersionId: "v2", clipName: "neusecast/next", validated: true }]
  ]));
  await scheduler.takeLive({ id: "camera-a", protocol: "test" });
  await scheduler.skip();
  assert.equal(scheduler.status().mode, "automation");
  assert.equal(scheduler.status().current.itemId, "next");
  assert.ok(events.events.some((event) => event.type === "live_source_status" && event.sourceId === "camera-a" && event.status === "ready"));
});

test("failed live-to-automation replacements preserve truthful live state", async () => {
  const now = Date.now();
  const amcp = new FailNextAmcp();
  const events = new FakeEvents();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: events, graphics: new FakeGraphics() });
  scheduler.update({
    output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [{ id: "due", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 5000, overlayPolicy: "all", media: {} }] }
  }, new Map([["v1", { mediaVersionId: "v1", clipName: "neusecast/due", validated: true }]]));
  await scheduler.takeLive({ id: "camera-a", protocol: "test" });
  amcp.failNext = true;
  await assert.rejects(() => scheduler.returnToAutomation(), /replacement failed/);
  assert.equal(scheduler.status().mode, "live");
  assert.equal(scheduler.status().current.sourceId, "camera-a");
  assert.equal(events.events.some((event) => event.type === "live_source_status" && event.sourceId === "camera-a" && event.status === "ready"), false);
  amcp.failNext = true;
  await assert.rejects(() => scheduler.takeItem("due"), /replacement failed/);
  assert.equal(scheduler.status().mode, "live");
});

test("switching live sources reports the replaced source ended only after success", async () => {
  const amcp = new FakeAmcp();
  const events = new FakeEvents();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: events, graphics: new FakeGraphics() });
  await scheduler.takeLive({ id: "camera-a", protocol: "test" });
  await scheduler.takeLive({ id: "camera-b", protocol: "test" });
  assert.equal(scheduler.status().current.sourceId, "camera-b");
  assert.ok(events.events.some((event) => event.type === "live_source_status" && event.sourceId === "camera-a" && event.status === "ready" && event.reason === "replaced_by_live_source"));
});

test("graphics failure after a successful program replacement cannot leave live state latched", async () => {
  const now = Date.now();
  const amcp = new FakeAmcp();
  const events = new FakeEvents();
  const graphics = new FailNextGraphics();
  const scheduler = new PlayoutScheduler({ amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK", preloadLeadMs: 1000, eventBuffer: events, graphics });
  scheduler.update({
    output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [{ id: "due", mediaVersionId: "v1", startMs: now - 1000, endMs: now + 5000, overlayPolicy: "all", media: {} }] }
  }, new Map([["v1", { mediaVersionId: "v1", clipName: "neusecast/due", validated: true }]]));
  await scheduler.takeLive({ id: "camera-a", protocol: "test" });
  graphics.failNext = true;
  await scheduler.returnToAutomation();
  assert.equal(scheduler.status().mode, "automation");
  assert.equal(scheduler.status().current.itemId, "due");
  assert.ok(events.events.some((event) => event.type === "now_playing" && event.programItemId === "due"));
  assert.ok(events.events.some((event) => event.code === "GRAPHICS_SYNC_FAILED"));
  assert.ok(events.events.some((event) => event.type === "live_source_status" && event.sourceId === "camera-a" && event.status === "ready"));
});

test("a watchdog for an old source cannot remove a newer live source", async () => {
  const now = Date.now();
  const scheduler = new PlayoutScheduler({
    amcp: new FakeAmcp(), channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK",
    preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics: new FakeGraphics()
  });
  await scheduler.update({
    output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [] }
  }, new Map());
  await scheduler.takeLive({ id: "camera-a", protocol: "test" });
  const takeNewSource = scheduler.takeLive({ id: "camera-b", protocol: "test" });
  const staleWatchdog = scheduler.returnLiveSourceToAutomation("camera-a", "live_signal_timeout");
  await Promise.all([takeNewSource, staleWatchdog]);
  assert.equal(await staleWatchdog, false);
  assert.equal(scheduler.status().mode, "live");
  assert.equal(scheduler.status().current.sourceId, "camera-b");
});

test("an already-correct graphics no-op still confirms the desired state", async () => {
  const now = Date.now();
  const graphics = new FakeGraphics();
  graphics.sync = async () => false;
  const scheduler = new PlayoutScheduler({
    amcp: new FakeAmcp(), channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK",
    preloadLeadMs: 1000, eventBuffer: new FakeEvents(), graphics
  });
  await scheduler.update({
    output: { alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [] }
  }, new Map());
  await scheduler.takeLive({ id: "camera", protocol: "test" });
  assert.equal(scheduler.graphicsOperationConfirmed, true);
});
