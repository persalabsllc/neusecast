import assert from "node:assert/strict";
import test from "node:test";
import { LiveSourceMonitor, probeNetworkSource, resolveLiveSource } from "../src/live-source.mjs";

class FakeEvents {
  constructor() { this.events = []; }
  add(type, details) { this.events.push({ type, ...details }); }
}

test("live monitor publishes initial readiness for network, test, and DeckLink sources", async () => {
  const events = new FakeEvents();
  const monitor = new LiveSourceMonitor({
    eventBuffer: events,
    probe: async () => ({ probeMethod: "ffprobe", streams: ["video", "audio"] })
  });
  monitor.update([
    { id: "network", protocol: "rtmps", endpointUrl: "rtmps://ingest.example/live" },
    { id: "test", protocol: "test" },
    { id: "deck", protocol: "decklink", endpointUrl: "1" }
  ]);
  await monitor.probeAll();
  assert.equal(monitor.statusFor("network"), "ready");
  assert.equal(monitor.statusFor("test"), "ready");
  assert.equal(monitor.statusFor("deck"), "ready");
  assert.deepEqual(events.events.filter((event) => event.sourceId === "network").map((event) => event.status), ["connecting", "ready"]);
  assert.equal(events.events.find((event) => event.sourceId === "deck").metadata.device, 1);
});

test("production probe errors never repeat a credential-bearing source URL", async () => {
  const resolved = resolveLiveSource(
    { protocol: "rtsp", credentialSecretRef: "env:SECRET_CAMERA" },
    { SECRET_CAMERA: "rtsp://operator:super-secret@camera.invalid/live" }
  );
  await assert.rejects(
    probeNetworkSource(resolved, { ffprobePath: "/bin/false", timeoutMs: 500 }),
    (error) => !error.message.includes("super-secret") && /No playable signal/.test(error.message)
  );
});

test("late probe results cannot mark a replaced endpoint ready", async () => {
  const events = new FakeEvents();
  let releaseFirst;
  let calls = 0;
  const firstProbe = new Promise((resolve) => { releaseFirst = resolve; });
  const urls = [];
  const monitor = new LiveSourceMonitor({
    eventBuffer: events,
    probe: async (resolved) => {
      calls += 1;
      urls.push(resolved.url);
      if (calls === 1) return firstProbe;
      return { probeMethod: "ffprobe", streams: ["video"] };
    }
  });
  monitor.update([{ id: "camera", protocol: "rtsp", endpointUrl: "rtsp://camera-a.example/live" }]);
  const probing = monitor.probeAll();
  while (calls !== 1) await new Promise((resolve) => setImmediate(resolve));
  monitor.update([{ id: "camera", protocol: "rtsp", endpointUrl: "rtsp://camera-b.example/live" }]);
  assert.equal(monitor.statusFor("camera"), null);
  releaseFirst({ probeMethod: "ffprobe", streams: ["video"] });
  await probing;
  assert.deepEqual(urls, ["rtsp://camera-a.example/live", "rtsp://camera-b.example/live"]);
  assert.equal(monitor.statusFor("camera"), "ready");
  assert.equal(events.events.filter((event) => event.sourceId === "camera" && event.status === "ready").length, 1);
});

test("a source taken live during an in-flight probe cannot be downgraded by its late result", async () => {
  const events = new FakeEvents();
  let rejectProbe;
  const deferred = new Promise((_, reject) => { rejectProbe = reject; });
  const monitor = new LiveSourceMonitor({ eventBuffer: events, probe: async () => deferred });
  monitor.update([{ id: "camera", protocol: "rtsp", endpointUrl: "rtsp://camera.example/live" }]);
  const probing = monitor.probeAll();
  while (monitor.statusFor("camera") !== "connecting") await new Promise((resolve) => setImmediate(resolve));
  monitor.setActiveSource("camera");
  rejectProbe(new Error("late signal timeout"));
  await probing;
  assert.equal(monitor.statusFor("camera"), "live");
  assert.equal(events.events.some((event) => event.sourceId === "camera" && event.status === "offline"), false);
});

test("ending a live source forces the next successful probe to emit ready again", async () => {
  const events = new FakeEvents();
  const monitor = new LiveSourceMonitor({
    eventBuffer: events,
    probe: async () => ({ probeMethod: "ffprobe", streams: ["video"] })
  });
  monitor.update([{ id: "camera", protocol: "rtsp", endpointUrl: "rtsp://camera.example/live" }]);
  await monitor.probeAll();
  monitor.setActiveSource("camera");
  monitor.setActiveSource(null);
  events.events.length = 0;
  await monitor.probeAll();
  assert.deepEqual(events.events.filter((event) => event.sourceId === "camera").map((event) => event.status), ["connecting", "ready"]);
  assert.equal(monitor.statusFor("camera"), "ready");
});

test("active watchdog probes report signal loss and recovery", async () => {
  const events = new FakeEvents();
  let signalAvailable = true;
  const monitor = new LiveSourceMonitor({
    eventBuffer: events,
    probe: async () => {
      if (!signalAvailable) throw new Error("signal unavailable");
      return { probeMethod: "ffprobe", streams: ["video"] };
    }
  });
  monitor.update([{
    id: "camera", protocol: "rtmp", endpointUrl: "rtmp://camera.example/live",
    metadata: { activeAutoFailover: true }
  }]);
  await monitor.probeAll();
  monitor.setActiveSource("camera");
  signalAvailable = false;
  await monitor.probeAll({ activeSourceId: "camera" });
  assert.equal(monitor.statusFor("camera"), "offline");
  assert.equal(events.events.at(-1).status, "offline");
  signalAvailable = true;
  await monitor.probeAll({ activeSourceId: "camera" });
  assert.equal(monitor.statusFor("camera"), "live");
  assert.equal(events.events.at(-1).status, "live");
});
