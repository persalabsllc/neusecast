import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BroadcastAgent } from "../src/agent.mjs";
import { loadConfig } from "../src/config.mjs";
import { IngestRetryTracker } from "../src/ingest-retry.mjs";
import { PlayoutScheduler } from "../src/scheduler.mjs";

async function until(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Condition was not reached");
}

test("snapshot applies output and live-source state before slow background ingest finishes", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-snapshot-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const calls = [];
  let finishIngest;
  const ingest = new Promise((resolve) => { finishIngest = resolve; });
  const mediaCache = {
    async resolveAll(_eligible, _concurrency, protectedAssets) {
      calls.push(`ingest:${protectedAssets.length}`);
      return ingest;
    },
    stats: () => ({ assets: 0, bytes: 0 })
  };
  const liveSources = {
    update(sources) { calls.push(`sources:${sources.length}`); },
    async probeAll() { calls.push("probe"); },
    statusFor() { return "ready"; }
  };
  const scheduler = {
    disabled: false,
    update(snapshot) { calls.push(`schedule:${snapshot.log.id}`); },
    async applyOutputEnabled(enabled) { calls.push(`enabled:${enabled}`); },
    async tick() { calls.push("tick"); },
    status() { return { mode: "automation", current: null }; }
  };
  const graphics = {
    setSnapshot() { calls.push("graphics"); },
    async sync() { calls.push("graphics-sync"); }
  };
  const events = { add() {}, async persist() {}, async flush() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => true, succeeded() {}, failed() {}, async persist() {} };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshot: async () => ({
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: true, alwaysOn: true },
      log: { id: "published", items: [] },
      mediaVersions: [{ versionId: "version-1", playbackUrl: "https://media.example/slow.mp4" }],
      liveSources: [{ id: "camera", protocol: "test" }]
    }) },
    amcp, mediaCache, liveSources, scheduler, graphics, events, ingestRetries
  });
  await agent.pollSnapshot();
  assert.ok(calls.indexOf("sources:1") < calls.indexOf("ingest:1"));
  assert.ok(calls.indexOf("ingest:1") < calls.indexOf("enabled:true"));
  assert.ok(calls.includes("sources:1"));
  await agent.probeLiveSources();
  assert.ok(calls.includes("probe"));
  finishIngest({ resolved: new Map(), failures: [] });
  await new Promise((resolve) => setImmediate(resolve));
});

test("agent wires separate per-file and aggregate cache limits", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-cache-config-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media"),
    MEDIA_MAX_FILE_BYTES: "2048",
    MEDIA_CACHE_MAX_BYTES: "8192"
  });
  const amcp = new EventEmitter();
  const agent = new BroadcastAgent(config, { amcp });
  assert.equal(agent.mediaCache.maxFileBytes, 2048);
  assert.equal(agent.mediaCache.maxCacheBytes, 8192);
});

test("first snapshot is cached and ingest starts even when AMCP application fails", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-amcp-down-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const body = {
    serverTime: new Date().toISOString(),
    output: { key: "main", enabled: true, alwaysOn: true },
    log: { id: "published", items: [] },
    mediaVersions: [{ versionId: "version-1", playbackUrl: "https://media.example/clip.mp4" }]
  };
  let requests = 0;
  const api = {
    snapshotEtag: null,
    async snapshot() {
      requests += 1;
      if (this.snapshotEtag) return null;
      this.snapshotEtag = "fresh-etag";
      return body;
    }
  };
  let ingestCalls = 0;
  const mediaCache = {
    setProtectedAssets() {},
    async resolveAll() { ingestCalls += 1; return { resolved: new Map(), failures: [] }; },
    stats: () => ({})
  };
  let failApply = true;
  const scheduler = {
    disabled: false,
    update() {},
    async applyOutputEnabled() { if (failApply) throw new Error("Caspar unavailable"); },
    async tick() {},
    status() { return { mode: "starting", current: null }; }
  };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => true, succeeded() {}, async persist() {} };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, { api, amcp, mediaCache, scheduler, graphics, liveSources, events, ingestRetries });
  await assert.rejects(() => agent.pollSnapshot(), /Caspar unavailable/);
  await until(() => ingestCalls === 1);
  assert.equal(api.snapshotEtag, null);
  const cached = JSON.parse(await readFile(path.join(stateDir, "last-good-snapshot.json"), "utf8"));
  assert.equal(cached.body.log.id, "published");
  failApply = false;
  await agent.pollSnapshot();
  assert.equal(requests, 2);
});

test("due ingest retry wakes after stable 304 snapshot and reports ready", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-retry-wake-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let now = 1000;
  const ingestRetries = new IngestRetryTracker({
    filename: path.join(stateDir, "retries.json"),
    maxAttempts: 0,
    baseDelayMs: 100,
    maxDelayMs: 100,
    now: () => now
  });
  await ingestRetries.initialize();
  let resolveCalls = 0;
  const ready = {
    mediaVersionId: "version-1",
    assetId: "asset-1",
    clipName: "neusecast/clip",
    validated: true,
    sha256: "a".repeat(64),
    probe: { durationMs: 1000, width: 1920, height: 1080, mimeType: "video/mp4" }
  };
  const mediaCache = {
    setProtectedAssets() {},
    async resolveAll() {
      resolveCalls += 1;
      if (resolveCalls === 1) {
        const error = Object.assign(new Error("Blob unavailable"), { retryable: true });
        return { resolved: new Map(), failures: [{ mediaVersionId: "version-1", assetId: "asset-1", error }] };
      }
      return { resolved: new Map([["version-1", ready]]), failures: [] };
    },
    stats: () => ({})
  };
  const body = {
    serverTime: new Date().toISOString(),
    output: { key: "main", enabled: false, alwaysOn: false },
    log: { id: "published", items: [] },
    ingestQueue: [{ id: "version-1", assetId: "asset-1", playbackUrl: "https://media.example/clip.mp4" }]
  };
  let first = true;
  const api = { snapshotEtag: null, async snapshot() { if (first) { first = false; this.snapshotEtag = "same"; return body; } return null; } };
  const emitted = [];
  const events = { add(type, details) { emitted.push({ type, ...details }); }, async persist() {}, get size() { return emitted.length; } };
  const scheduler = { disabled: false, update() {}, async applyOutputEnabled() {}, async tick() {}, status() { return { mode: "disabled", current: null }; } };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, { api, amcp, mediaCache, scheduler, graphics, liveSources, events, ingestRetries });
  await agent.pollSnapshot();
  await until(() => resolveCalls === 1 && emitted.some((event) => event.type === "media_failed"));
  await agent.pollSnapshot();
  assert.equal(resolveCalls, 1);
  now = 1100;
  assert.equal(agent.retryMediaIngest(), true);
  await until(() => resolveCalls === 2 && emitted.some((event) => event.type === "media_ready"));
  await agent.ingestRunning;
  assert.equal(emitted.find((event) => event.type === "media_failed").retryable, true);
});

test("standby output suppresses snapshot, ingest, and periodic graphics sync", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-standby-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let graphicsSyncs = 0;
  let mode = "starting";
  const scheduler = {
    disabled: false,
    update() {},
    async applyOutputEnabled() {},
    async tick() { mode = "standby"; },
    status() { return { mode, current: null }; }
  };
  const graphics = {
    setSnapshot() {},
    async sync() { graphicsSyncs += 1; }
  };
  const mediaCache = {
    setProtectedAssets() {},
    async resolveAll() { return { resolved: new Map(), failures: [] }; },
    stats: () => ({})
  };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshot: async () => ({
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: true, alwaysOn: false },
      log: { id: "published", items: [] }
    }) },
    amcp, mediaCache, scheduler, graphics, events, ingestRetries, liveSources
  });
  await agent.pollSnapshot();
  await until(() => mode === "standby");
  assert.equal(agent.syncGraphicsClock(), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(graphicsSyncs, 0);
});

test("a completed ingest from a superseded snapshot cannot report media ready", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-superseded-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let releaseFirst;
  let resolveCalls = 0;
  const firstResult = new Promise((resolve) => { releaseFirst = resolve; });
  const stale = {
    mediaVersionId: "version-1",
    assetId: "asset-1",
    clipName: "neusecast/version-1",
    validated: true,
    sha256: "a".repeat(64),
    probe: { durationMs: 1000, width: 1920, height: 1080, mimeType: "video/mp4" }
  };
  const mediaCache = {
    setProtectedAssets() {},
    async resolveAll() {
      resolveCalls += 1;
      if (resolveCalls === 1) return firstResult;
      return { resolved: new Map(), failures: [] };
    },
    stats: () => ({})
  };
  const snapshots = [
    {
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: false, alwaysOn: false },
      log: { id: "log-a", items: [] },
      mediaVersions: [{ versionId: "version-1", assetId: "asset-1", playbackUrl: "https://media.example/v1.mp4" }]
    },
    {
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: false, alwaysOn: false },
      log: { id: "log-b", items: [] },
      mediaVersions: []
    }
  ];
  const emitted = [];
  const events = { add(type, details) { emitted.push({ type, ...details }); }, async persist() {}, get size() { return emitted.length; } };
  const scheduler = { disabled: true, update() {}, async applyOutputEnabled() {}, async tick() {}, status() { return { mode: "disabled", current: null }; } };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const ingestRetries = { shouldAttempt: () => true, succeeded() {}, forget() {}, async persist() {} };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshot: async () => snapshots.shift() },
    amcp, mediaCache, scheduler, graphics, liveSources, events, ingestRetries
  });
  await agent.pollSnapshot();
  await until(() => resolveCalls === 1);
  await agent.pollSnapshot();
  releaseFirst({ resolved: new Map([["version-1", stale]]), failures: [] });
  await until(() => resolveCalls === 2);
  assert.equal(emitted.some((event) => event.type === "media_ready" && event.mediaVersionId === "version-1"), false);
  assert.equal(agent.resolvedMedia.has("version-1"), false);
});

test("first successful Caspar connection reasserts a disabled clear after startup failure", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-disabled-recovery-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  class RecoveringAmcp extends EventEmitter {
    constructor() {
      super();
      this.fail = true;
      this.connected = false;
      this.commands = [];
    }
    async send(command) {
      if (this.fail) throw new Error("Caspar unavailable");
      this.commands.push(command);
      return { code: 202, lines: [] };
    }
  }
  const amcp = new RecoveringAmcp();
  const graphics = {
    clears: 0,
    setSnapshot() {},
    setOverlayPolicy() {},
    async sync() {},
    async clear() { this.clears += 1; }
  };
  const mediaCache = {
    setProtectedAssets() {},
    async resolveAll() { return { resolved: new Map(), failures: [] }; },
    stats: () => ({})
  };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshotEtag: null, snapshot: async () => ({
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: false, alwaysOn: false },
      log: { id: "published", items: [] }
    }) },
    amcp, mediaCache, graphics, events, ingestRetries, liveSources
  });
  await assert.rejects(() => agent.pollSnapshot(), /Caspar unavailable/);
  amcp.fail = false;
  amcp.connected = true;
  amcp.emit("connect");
  await until(() => amcp.commands.includes("CLEAR 1-10") && graphics.clears === 1);
  assert.equal(agent.scheduler.status().mode, "disabled");
});

test("overlapping snapshot requests serialize so an older response cannot roll back newer state", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-snapshot-order-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let releaseOlder;
  let requests = 0;
  const older = new Promise((resolve) => { releaseOlder = resolve; });
  const snapshot = (id) => ({
    serverTime: new Date().toISOString(),
    output: { key: "main", enabled: false, alwaysOn: false },
    log: { id, items: [] }
  });
  const api = {
    snapshotEtag: null,
    async snapshot() {
      requests += 1;
      return requests === 1 ? older : snapshot("newer-log");
    }
  };
  const mediaCache = {
    setProtectedAssets() {},
    async resolveAll() { return { resolved: new Map(), failures: [] }; },
    stats: () => ({})
  };
  const scheduler = { disabled: true, update() {}, async applyOutputEnabled() {}, async tick() {}, status() { return { mode: "disabled", current: null }; } };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, { api, amcp, mediaCache, scheduler, graphics, liveSources, events, ingestRetries });
  const first = agent.pollSnapshot();
  const second = agent.pollSnapshot({ force: true });
  await until(() => requests === 1);
  assert.equal(requests, 1);
  releaseOlder(snapshot("older-log"));
  await Promise.all([first, second]);
  assert.equal(requests, 2);
  assert.equal(agent.snapshot.log.id, "newer-log");
});

test("a clean first AMCP connection during snapshot apply does not duplicate playout", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-first-connect-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  class ConnectingAmcp extends EventEmitter {
    constructor() { super(); this.connected = false; this.commands = []; }
    async send(command) {
      this.commands.push(command);
      if (!this.connected) {
        this.connected = true;
        this.emit("connect");
      }
      return { code: 202, lines: [] };
    }
  }
  const amcp = new ConnectingAmcp();
  const graphics = { setSnapshot() {}, setOverlayPolicy() {}, activate() {}, async sync() {}, async clear() {} };
  const mediaCache = { setProtectedAssets() {}, async resolveAll() { return { resolved: new Map(), failures: [] }; }, stats: () => ({}) };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshotEtag: null, snapshot: async () => ({
      serverTime: new Date().toISOString(), output: { key: "main", enabled: true, alwaysOn: true }, log: { id: "published", items: [] }
    }) },
    amcp, graphics, mediaCache, events, ingestRetries, liveSources
  });
  await agent.pollSnapshot();
  await agent.ingestRunning;
  assert.equal(amcp.commands.filter((command) => command === 'PLAY 1-10 "NEUSECAST_FALLBACK" LOOP').length, 1);
});

test("a disconnect during the last apply step remains dirty and clears again after reconnect", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-disconnect-generation-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  class DisconnectingAmcp extends EventEmitter {
    constructor() { super(); this.connected = true; this.commands = []; }
    async send(command) { this.commands.push(command); return { code: 202, lines: [] }; }
  }
  const amcp = new DisconnectingAmcp();
  const graphics = {
    clears: 0,
    setSnapshot() {}, setOverlayPolicy() {}, suppress() {}, activate() {}, async sync() {},
    async clear() {
      this.clears += 1;
      if (this.clears === 1) {
        amcp.connected = false;
        amcp.emit("disconnect");
      }
    }
  };
  const mediaCache = { setProtectedAssets() {}, async resolveAll() { return { resolved: new Map(), failures: [] }; }, stats: () => ({}) };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshotEtag: null, snapshot: async () => ({
      serverTime: new Date().toISOString(), output: { key: "main", enabled: false, alwaysOn: false }, log: { id: "published", items: [] }
    }) },
    amcp, graphics, mediaCache, events, ingestRetries, liveSources
  });
  await agent.pollSnapshot();
  assert.equal(agent.casparStateDirty, true);
  amcp.connected = true;
  amcp.emit("connect");
  await until(() => amcp.commands.filter((command) => command === "CLEAR 1-10").length === 2);
  assert.equal(agent.casparStateDirty, false);
});

test("a stale in-flight snapshot cannot undo a completed stop command", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-output-override-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let releaseSnapshot;
  let snapshotRequested = false;
  const deferredSnapshot = new Promise((resolve) => { releaseSnapshot = resolve; });
  const applied = [];
  let mode = "automation";
  let schedulerSnapshot = null;
  let startedAlwaysOn = null;
  const scheduler = {
    disabled: false,
    update(snapshot) { schedulerSnapshot = snapshot; },
    async applyOutputEnabled(enabled) { applied.push(enabled); mode = enabled ? "automation" : "disabled"; },
    async tick() {},
    async stopOutput() { mode = "disabled"; },
    async startOutput() { mode = "automation"; startedAlwaysOn = schedulerSnapshot?.output.alwaysOn; },
    status() { return { mode, current: null }; }
  };
  let commandPolls = 0;
  const api = {
    snapshotEtag: null,
    async snapshot() { snapshotRequested = true; return deferredSnapshot; },
    async commands() {
      commandPolls += 1;
      return {
        commands: commandPolls === 1
          ? [{
              id: "stop-1",
              type: "stop_output",
              payload: { desiredEnabled: false, desiredAlwaysOn: false, desiredControlRevision: 2 }
            }]
          : [{
              id: "start-1",
              type: "start_output",
              payload: { desiredEnabled: true, desiredAlwaysOn: false, desiredControlRevision: 3 }
            }]
      };
    }
  };
  const mediaCache = { setProtectedAssets() {}, async resolveAll() { return { resolved: new Map(), failures: [] }; }, stats: () => ({}) };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, setActiveSource() {}, async probeAll() {}, statusFor() { return null; } };
  const events = { queued: [], add(type, details) { this.queued.push({ type, ...details }); }, async persist() {}, get size() { return this.queued.length; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, { api, amcp, scheduler, mediaCache, graphics, liveSources, events, ingestRetries });
  const polling = agent.pollSnapshot();
  await until(() => snapshotRequested);
  await agent.pollCommands();
  assert.equal(mode, "disabled");
  releaseSnapshot({
    serverTime: new Date().toISOString(),
    output: { key: "main", enabled: true, alwaysOn: true, controlRevision: 1 },
    log: { id: "stale-log", items: [] }
  });
  await polling;
  assert.equal(agent.snapshot.output.enabled, false);
  assert.equal(agent.snapshot.output.alwaysOn, false);
  assert.deepEqual(applied, [false]);
  assert.equal(mode, "disabled");
  assert.equal(agent.outputOverride.enabled, false);
  await agent.pollCommands();
  assert.equal(mode, "automation");
  assert.equal(startedAlwaysOn, false);
  assert.equal(agent.outputOverride.enabled, true);
  assert.equal(agent.outputOverride.alwaysOn, false);
});

test("an immediate Start command uses its desired always-on state without waiting for a snapshot", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-output-immediate-start-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let schedulerSnapshot;
  let startedAlwaysOn;
  const scheduler = {
    disabled: true,
    update(snapshot) { schedulerSnapshot = snapshot; },
    async startOutput() { startedAlwaysOn = schedulerSnapshot.output.alwaysOn; },
    status() { return { mode: "disabled", current: null }; }
  };
  const events = { queued: [], add(type, details) { this.queued.push({ type, ...details }); }, async persist() {}, get size() { return this.queued.length; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { commands: async () => ({ commands: [{
      id: "start-rev-8",
      type: "start_output",
      payload: { desiredEnabled: true, desiredAlwaysOn: false, desiredControlRevision: 8 }
    }] }) },
    amcp: new EventEmitter(), scheduler, graphics: {}, events,
    mediaCache: { stats: () => ({}) }
  });
  agent.snapshot = {
    output: { enabled: false, alwaysOn: true, controlRevision: 7 },
    log: { id: "log", items: [] }, liveSources: [], assets: [], graphics: {},
    serverTimeMs: Date.now(), receivedAtMs: Date.now()
  };
  await agent.pollCommands();
  assert.equal(startedAlwaysOn, false);
  assert.equal(agent.snapshot.output.alwaysOn, false);
});

test("the first fresh response after a persisted override restores later authoritative server state", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-output-authority-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const overrideFile = path.join(stateDir, "output-override.json");
  const override = {
    enabled: false,
    alwaysOn: false,
    commandId: "old-stop",
    desiredControlRevision: 2,
    setAt: new Date().toISOString()
  };
  await writeFile(overrideFile, JSON.stringify({ version: 1, ...override }));
  const applied = [];
  const scheduler = {
    disabled: false, update() {}, async applyOutputEnabled(enabled) { applied.push(enabled); }, async tick() {},
    status() { return { mode: "automation", current: null }; }
  };
  const mediaCache = { setProtectedAssets() {}, async resolveAll() { return { resolved: new Map(), failures: [] }; }, stats: () => ({}) };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshotEtag: null, snapshot: async () => ({
      serverTime: new Date().toISOString(), output: { key: "main", enabled: true, alwaysOn: true, controlRevision: 3 }, log: { id: "current", items: [] }
    }) },
    amcp, scheduler, mediaCache, graphics, liveSources, events, ingestRetries
  });
  agent.outputOverride = override;
  await agent.pollSnapshot();
  assert.equal(agent.outputOverride, null);
  assert.equal(agent.snapshot.output.enabled, true);
  assert.deepEqual(applied, [true]);
  await assert.rejects(() => readFile(overrideFile), (error) => error.code === "ENOENT");
});

test("a durably cached confirming revision clears a resurrected older override on restart", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-cached-override-confirmation-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const override = {
    enabled: false, alwaysOn: false, commandId: "stop-rev-2",
    desiredControlRevision: 2, setAt: new Date().toISOString()
  };
  await writeFile(path.join(stateDir, "output-override.json"), JSON.stringify({ version: 1, ...override }));
  await writeFile(path.join(stateDir, "last-good-snapshot.json"), JSON.stringify({
    version: 1,
    savedAt: new Date().toISOString(),
    body: {
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: true, alwaysOn: true, controlRevision: 3 },
      log: { id: "authoritative", items: [] }
    }
  }));
  const scheduler = {
    disabled: false, update() {}, async applyOutputEnabled() {}, async tick() {},
    status() { return { mode: "automation", current: null }; }
  };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    amcp: new EventEmitter(), scheduler,
    mediaCache: { setProtectedAssets() {}, async resolveAll() { return { resolved: new Map(), failures: [] }; }, stats: () => ({}) },
    graphics: { setSnapshot() {}, async sync() {} }, liveSources: { update() {} },
    events: { add() {}, get size() { return 0; } },
    ingestRetries: { shouldAttempt: () => false, async persist() {} }
  });
  agent.outputOverride = override;
  await agent.restoreCachedSnapshot();
  assert.equal(agent.outputOverride, null);
  assert.equal(agent.snapshot.output.enabled, true);
  assert.equal(agent.latestOutputControlRevision, 3);
  await assert.rejects(() => readFile(path.join(stateDir, "output-override.json")), (error) => error.code === "ENOENT");
});

test("an older output control revision cannot roll back accepted output settings", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-control-revision-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const bodies = [
    {
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: true, alwaysOn: false, controlRevision: 5, overlayConfig: { showClock: false } },
      log: { id: "new-control", items: [] }
    },
    {
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: false, alwaysOn: true, controlRevision: 4, overlayConfig: { showClock: true } },
      log: { id: "newer-log", items: [] }
    }
  ];
  const scheduler = { disabled: false, update() {}, async applyOutputEnabled() {}, async tick() {}, status() { return { mode: "automation", current: null }; } };
  const mediaCache = { setProtectedAssets() {}, async resolveAll() { return { resolved: new Map(), failures: [] }; }, stats: () => ({}) };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const events = { add() {}, async persist() {}, get size() { return 0; } };
  const ingestRetries = { shouldAttempt: () => false, async persist() {} };
  const amcp = new EventEmitter();
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshot: async () => bodies.shift() }, amcp, scheduler, mediaCache, graphics, liveSources, events, ingestRetries
  });
  await agent.pollSnapshot();
  await agent.pollSnapshot();
  assert.equal(agent.snapshot.log.id, "newer-log");
  assert.deepEqual(agent.snapshot.output, {
    key: "main", enabled: true, alwaysOn: false, controlRevision: 5, overlayConfig: { showClock: false }
  });
  const cached = JSON.parse(await readFile(path.join(stateDir, "last-good-snapshot.json"), "utf8"));
  assert.equal(cached.body.output.controlRevision, 5);
  assert.equal(cached.body.output.enabled, true);
  assert.equal(cached.body.output.alwaysOn, false);

  const restoredApplied = [];
  const restoredScheduler = {
    disabled: false,
    update() {},
    async applyOutputEnabled(enabled) { restoredApplied.push(enabled); },
    async tick() {},
    status() { return { mode: "automation", current: null }; }
  };
  const restored = new BroadcastAgent(config, {
    api: { snapshotEtag: null, snapshot: async () => ({
      serverTime: new Date().toISOString(),
      output: { key: "main", enabled: false, alwaysOn: true, controlRevision: 4 },
      log: { id: "delayed-after-restart", items: [] }
    }) },
    amcp: new EventEmitter(), scheduler: restoredScheduler, mediaCache, graphics, liveSources, events, ingestRetries
  });
  await restored.restoreCachedSnapshot();
  assert.equal(restored.latestOutputControlRevision, 5);
  await restored.pollSnapshot();
  assert.equal(restored.snapshot.output.controlRevision, 5);
  assert.equal(restored.snapshot.output.enabled, true);
  assert.equal(restored.snapshot.output.alwaysOn, false);
  assert.deepEqual(restoredApplied, [true, true]);
});

test("health stays degraded while desired playout or disabled clears are unconfirmed", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-health-dirty-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let mode = "fallback";
  const scheduler = {
    programClearConfirmed: true,
    graphicsClearConfirmed: true,
    status() { return { mode, current: null }; }
  };
  const amcp = new EventEmitter();
  amcp.connected = true;
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, { amcp, scheduler, graphics: {}, mediaCache: { stats: () => ({}) } });
  agent.snapshot = { output: { enabled: true }, log: { id: "log", items: [] } };
  agent.lastSnapshotAtMs = Date.now();
  agent.casparStateDirty = true;
  assert.equal(agent.health().status, "degraded");
  assert.equal(agent.health().desiredStateApplied, false);
  agent.casparStateDirty = false;
  assert.equal(agent.health().status, "healthy");
  mode = "disabled";
  scheduler.graphicsClearConfirmed = false;
  assert.equal(agent.health().status, "degraded");
  scheduler.graphicsClearConfirmed = true;
  assert.equal(agent.health().status, "healthy");
});

test("dirty Caspar state retries locally while the control plane is unavailable", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-local-reconcile-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let reconcileAttempts = 0;
  const scheduler = {
    async reconcileAfterReconnect() {
      reconcileAttempts += 1;
      if (reconcileAttempts === 1) throw new Error("graphics clear rejected");
      return true;
    },
    status() { return { mode: "disabled", current: null }; }
  };
  const amcp = new EventEmitter();
  amcp.connected = true;
  const events = { queued: [], add(type, details) { this.queued.push({ type, ...details }); }, get size() { return this.queued.length; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshot: async () => { throw new Error("control plane offline"); } },
    amcp, scheduler, events, graphics: {}, mediaCache: { stats: () => ({}) },
    casparReconcileRetryMs: 1
  });
  agent.snapshot = { output: { enabled: false }, log: { id: "log", items: [] } };
  agent.lastSnapshotAtMs = Date.now();
  agent.casparStateDirty = true;
  amcp.emit("connect");
  await assert.rejects(() => agent.pollSnapshot(), /control plane offline/);
  await until(() => reconcileAttempts >= 2);
  assert.equal(agent.casparStateDirty, false);
  assert.equal(agent.casparNeedsReconcile, false);
});

test("an active source that misses its reconnect deadline returns safely to automation", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-live-watchdog-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let mode = "live";
  let returns = 0;
  let activeSource = "camera";
  const scheduler = {
    status() { return { mode, current: mode === "live" ? { sourceId: "camera" } : null }; },
    async returnToAutomation(reason) {
      assert.equal(reason, "live_signal_timeout");
      returns += 1;
      mode = "automation";
      return true;
    }
  };
  const liveSources = {
    async probeAll() {},
    statusFor() { return "offline"; },
    setActiveSource(sourceId) { activeSource = sourceId; }
  };
  const events = { queued: [], add(type, details) { this.queued.push({ type, ...details }); }, get size() { return this.queued.length; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    amcp: new EventEmitter(), scheduler, liveSources, events, graphics: {}, mediaCache: { stats: () => ({}) }
  });
  agent.snapshot = {
    output: { enabled: true },
    liveSources: [{
      id: "camera", label: "Field Camera", reconnectTimeoutSeconds: 0.001,
      activeAutoFailover: true
    }],
    log: { id: "log", items: [] }
  };
  await agent.probeLiveSources();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(returns, 1);
  assert.equal(mode, "automation");
  assert.equal(activeSource, null);
  const error = events.queued.find((event) => event.code === "LIVE_SOURCE_SIGNAL_LOST");
  assert.ok(error);
  assert.match(error.message, /automation resumed/);
});

test("a rejected schedule tick marks playout dirty and degrades readiness", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-schedule-dirty-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const scheduler = {
    async tick() { throw new Error("AMCP 400 PLAY ERROR"); },
    status() { return { mode: "fallback", current: null }; }
  };
  const amcp = new EventEmitter();
  amcp.connected = true;
  amcp.send = async () => ({ code: 201, lines: ["2.5.0"] });
  const events = { queued: [], add(type, details) { this.queued.push({ type, ...details }); }, get size() { return this.queued.length; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, { amcp, scheduler, events, graphics: {}, mediaCache: { stats: () => ({}) } });
  agent.snapshot = { output: { enabled: true }, log: { id: "log", items: [] }, versions: {}, raw: {} };
  agent.lastSnapshotAtMs = Date.now();
  await agent.tickSchedule();
  assert.equal(agent.casparStateDirty, true);
  assert.equal(agent.health().status, "degraded");
  assert.equal(events.queued.filter((event) => event.code === "SCHEDULE_PLAYOUT_FAILED").length, 1);
  await agent.heartbeat();
  const heartbeat = events.queued.findLast((event) => event.type === "heartbeat");
  assert.equal(heartbeat.outputStatus, "degraded");
  assert.match(heartbeat.errorMessage, /not yet confirmed/);
  await agent.tickSchedule();
  assert.equal(events.queued.filter((event) => event.code === "SCHEDULE_PLAYOUT_FAILED").length, 1);
});

test("a scheduled program take survives graphics failure and retries only its overlay", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-schedule-graphics-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const amcp = new EventEmitter();
  amcp.connected = true;
  amcp.commands = [];
  amcp.send = async (command) => {
    amcp.commands.push(command);
    return { code: 202, lines: [] };
  };
  amcp.close = () => {};
  const events = {
    queued: [],
    add(type, details) { this.queued.push({ type, ...details }); },
    async persist() {},
    async flush() {},
    get size() { return this.queued.length; }
  };
  let failures = 1;
  const graphics = {
    activate() {},
    suppress() {},
    setOverlayPolicy() {},
    async sync() {
      if (failures > 0) {
        failures -= 1;
        throw new Error("CG UPDATE rejected");
      }
    },
    async clear() {}
  };
  const scheduler = new PlayoutScheduler({
    amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK",
    preloadLeadMs: 1000, eventBuffer: events, graphics
  });
  const now = Date.now();
  const snapshot = {
    output: { enabled: true, alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [{
      id: "due", assetId: "asset-1", mediaVersionId: "version-1",
      startMs: now - 1000, endMs: now + 30_000, durationMs: 30_000, overlayPolicy: "all"
    }] },
    liveSources: []
  };
  await scheduler.update(snapshot, new Map([["version-1", {
    mediaVersionId: "version-1", clipName: "neusecast/due", validated: true
  }]]));
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    amcp, scheduler, events, graphics, graphicsRetryMs: 50,
    mediaCache: { stats: () => ({}) }
  });
  agent.snapshot = snapshot;
  agent.lastSnapshotAtMs = Date.now();

  await agent.tickSchedule();
  assert.equal(scheduler.status().mode, "automation");
  assert.equal(scheduler.status().current.itemId, "due");
  assert.equal(agent.casparStateDirty, false);
  assert.equal(agent.graphicsStateDirty, true);
  assert.equal(agent.health().status, "degraded");
  await until(() => agent.graphicsStateDirty === false);
  assert.equal(scheduler.status().current.itemId, "due");
  assert.equal(amcp.commands.filter((command) => command.startsWith("PLAY 1-10")).length, 1);
  assert.equal(agent.health().status, "healthy");
  await agent.stop("TEST");
});

test("shutdown waits out a deferred snapshot without allowing later playout mutation", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-shutdown-race-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let releaseSnapshot;
  let requested = false;
  const deferred = new Promise((resolve) => { releaseSnapshot = resolve; });
  const calls = [];
  const scheduler = {
    update() { calls.push("update"); }, async applyOutputEnabled() { calls.push("apply"); }, async tick() { calls.push("tick"); },
    close() { calls.push("close"); }, status() { return { mode: "starting", current: null }; }
  };
  const amcp = new EventEmitter();
  amcp.close = () => { calls.push("amcp-close"); };
  const mediaCache = { close() {}, stats: () => ({}) };
  const events = { add() {}, async flush() {}, get size() { return 0; } };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { async snapshot() { requested = true; return deferred; } }, amcp, scheduler, mediaCache, events
  });
  const polling = agent.pollSnapshot();
  await until(() => requested);
  const stopping = agent.stop();
  releaseSnapshot({
    serverTime: new Date().toISOString(), output: { key: "main", enabled: true, alwaysOn: true }, log: { id: "late", items: [] }
  });
  await Promise.all([polling, stopping]);
  assert.deepEqual(calls, ["close", "amcp-close"]);
});

test("shutdown discards a deferred ingest result before events or scheduler mutation", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-shutdown-ingest-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let releaseIngest;
  let ingestStarted = false;
  const deferred = new Promise((resolve) => { releaseIngest = resolve; });
  const calls = [];
  const ready = { mediaVersionId: "version-1", assetId: "asset-1", clipName: "neusecast/v1", validated: true };
  const mediaCache = {
    close() {}, setProtectedAssets() {}, stats: () => ({}),
    async resolveAll() { ingestStarted = true; return deferred; }
  };
  const scheduler = {
    update() { calls.push("update"); }, async applyOutputEnabled() { calls.push("apply"); }, async tick() {},
    close() { calls.push("close"); }, status() { return { mode: "disabled", current: null }; }
  };
  const emitted = [];
  const events = { add(type, details) { emitted.push({ type, ...details }); }, async flush() {}, get size() { return emitted.length; } };
  const ingestRetries = { shouldAttempt: () => true, succeeded() { calls.push("ingest-succeeded"); }, async persist() {} };
  const graphics = { setSnapshot() {}, async sync() {} };
  const liveSources = { update() {}, async probeAll() {}, statusFor() { return null; } };
  const amcp = new EventEmitter();
  amcp.close = () => { calls.push("amcp-close"); };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { snapshot: async () => ({
      serverTime: new Date().toISOString(), output: { key: "main", enabled: false, alwaysOn: false },
      log: { id: "published", items: [] }, mediaVersions: [{ versionId: "version-1", assetId: "asset-1", playbackUrl: "https://media.example/v1.mp4" }]
    }) },
    amcp, scheduler, mediaCache, events, ingestRetries, graphics, liveSources
  });
  await agent.pollSnapshot();
  await until(() => ingestStarted);
  const baselineUpdates = calls.filter((call) => call === "update").length;
  const stopping = agent.stop();
  releaseIngest({ resolved: new Map([["version-1", ready]]), failures: [] });
  await stopping;
  assert.equal(calls.filter((call) => call === "update").length, baselineUpdates);
  assert.equal(calls.includes("ingest-succeeded"), false);
  assert.equal(emitted.some((event) => event.type === "media_ready"), false);
});

test("repeated shutdown waits for durable local events even when remote flush fails", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-shutdown-durable-events-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let releasePersist;
  const firstPersist = new Promise((resolve) => { releasePersist = resolve; });
  let persistCalls = 0;
  let flushCalls = 0;
  let amcpClosed = false;
  const events = {
    add() {},
    persist() {
      persistCalls += 1;
      return persistCalls === 1 ? firstPersist : Promise.resolve();
    },
    async flush() { flushCalls += 1; throw new Error("control plane offline"); },
    get size() { return 1; }
  };
  const scheduler = { async close() {}, status() { return { mode: "automation", current: null }; } };
  const amcp = new EventEmitter();
  amcp.close = () => { amcpClosed = true; };
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    amcp, scheduler, events, graphics: {}, mediaCache: { close() {}, stats: () => ({}) }
  });
  const firstStop = agent.stop("SIGTERM");
  const secondStop = agent.stop("SIGINT");
  assert.equal(firstStop, secondStop);
  await until(() => persistCalls === 1);
  assert.equal(amcpClosed, false);
  releasePersist();
  await Promise.all([firstStop, secondStop]);
  assert.equal(flushCalls, 1);
  assert.equal(persistCalls, 2);
  assert.equal(amcpClosed, true);
});
