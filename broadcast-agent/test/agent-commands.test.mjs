import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BroadcastAgent } from "../src/agent.mjs";
import { CommandJournal } from "../src/command-journal.mjs";
import { loadConfig } from "../src/config.mjs";
import { PlayoutScheduler } from "../src/scheduler.mjs";

async function until(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Condition was not reached");
}

test("broadcast agent handles every Studio operator command", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-command-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const calls = [];
  const commands = [
    { id: "c1", type: "take_item", programItemId: "item-1", payload: {} },
    { id: "c2", type: "skip", payload: {} },
    { id: "c3", type: "resume_automation", payload: {} },
    { id: "c4", type: "start_output", payload: { desiredEnabled: true, desiredAlwaysOn: true, desiredControlRevision: 2 } },
    { id: "c5", type: "refresh_graphics", payload: {} },
    { id: "c6", type: "stop_output", payload: { desiredEnabled: false, desiredAlwaysOn: false, desiredControlRevision: 3 } },
    { id: "c7", type: "take_live", payload: { liveSourceId: "source-1" } },
    { id: "c8", type: "remove_live", payload: { liveSourceId: "source-1" } }
  ];
  const api = { commands: async () => ({ commands }), events: async () => ({ accepted: 0 }) };
  const amcp = new EventEmitter();
  amcp.connected = true;
  const events = {
    queued: [],
    add(type, value) { this.queued.push({ type, ...value }); },
    async persist() {},
    get size() { return this.queued.length; }
  };
  const graphics = { loaded: true, async sync() { calls.push("refresh_graphics"); } };
  let playout = { mode: "automation", current: null };
  const scheduler = {
    disabled: false,
    async takeItem(id) { calls.push(`take_item:${id}`); },
    async skip() { calls.push("skip"); return "item-2"; },
    async returnToAutomation() { calls.push("resume"); playout = { mode: "automation", current: null }; return true; },
    async startOutput() { calls.push("start_output"); },
    async stopOutput() { calls.push("stop_output"); },
    async takeLive(source) { calls.push(`take_live:${source.id}`); playout = { mode: "live", current: { sourceId: source.id } }; },
    status() { return playout; }
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
    api,
    amcp,
    events,
    graphics,
    scheduler,
    liveSources: { statusFor() { return "ready"; }, setActiveSource() {}, update() {}, probeAll() {} },
    mediaCache: { stats: () => ({ assets: 0, bytes: 0, inflight: 0 }) }
  });
  agent.snapshot = { output: { enabled: true, controlRevision: 1 }, liveSources: [{ id: "source-1", status: "ready" }] };
  await agent.pollCommands();
  assert.deepEqual(calls, [
    "take_item:item-1", "skip", "resume", "start_output", "refresh_graphics", "stop_output", "take_live:source-1", "resume"
  ]);
  assert.equal(events.queued.filter((event) => event.type === "command_ack" && event.status === "completed").length, commands.length);
});

test("remove_live cannot take a different live source off program", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-remove-live-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let returns = 0;
  const events = { queued: [], add(type, value) { this.queued.push({ type, ...value }); }, async persist() {}, get size() { return this.queued.length; } };
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
  const agent = new BroadcastAgent(config, {
    api: { commands: async () => ({ commands: [{ id: "remove-b", type: "remove_live", payload: { liveSourceId: "camera-b" } }] }) },
    amcp, events, graphics: {}, mediaCache: { stats: () => ({}) },
    scheduler: {
      disabled: false,
      status() { return { mode: "live", current: { sourceId: "camera-a" } }; },
      async returnToAutomation() { returns += 1; return true; }
    }
  });
  await agent.pollCommands();
  assert.equal(returns, 0);
  assert.equal(agent.casparStateDirty, false);
  const ack = events.queued.find((event) => event.type === "command_ack");
  assert.equal(ack.status, "failed");
  assert.match(ack.message, /not currently on program/);
});

test("a reconnecting Take Live is not overwritten by queued reconciliation", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-live-reconnect-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const calls = [];
  let playout = { mode: "automation", current: null };
  const amcp = new EventEmitter();
  amcp.connected = false;
  const scheduler = {
    disabled: false,
    status() { return playout; },
    async takeLive(source) {
      calls.push(`take:${source.id}`);
      amcp.connected = true;
      amcp.emit("connect");
      playout = { mode: "live", current: { sourceId: source.id } };
    }
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
    api: { commands: async () => ({ commands: [{ id: "take-camera", type: "take_live", payload: { liveSourceId: "camera" } }] }) },
    amcp, scheduler, events, graphics: {}, mediaCache: { stats: () => ({}) },
    liveSources: { statusFor() { return "ready"; }, setActiveSource() {} }
  });
  agent.snapshot = { output: { enabled: true }, liveSources: [{ id: "camera", status: "ready" }] };
  agent.casparStateDirty = true;
  agent.casparNeedsReconcile = true;
  await agent.pollCommands();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["take:camera"]);
  assert.equal(playout.mode, "live");
  assert.equal(playout.current.sourceId, "camera");
  assert.equal(agent.casparStateDirty, false);
});

test("a live take survives a graphics failure while graphics retry independently", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-live-graphics-"));
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
    add(type, value) { this.queued.push({ type, ...value }); },
    async persist() {},
    async flush() {},
    get size() { return this.queued.length; }
  };
  let graphicsFailures = 1;
  const graphics = {
    activate() {},
    suppress() {},
    setOverlayPolicy() {},
    async sync() {
      if (graphicsFailures > 0) {
        graphicsFailures -= 1;
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
  await scheduler.update({
    output: { enabled: true, alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [] }
  }, new Map());
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const source = { id: "camera", label: "Camera", protocol: "test", status: "ready" };
  const agent = new BroadcastAgent(config, {
    api: { commands: async () => ({ commands: [{ id: "take-camera", type: "take_live", payload: { liveSourceId: "camera" } }] }) },
    amcp, scheduler, events, graphics, graphicsRetryMs: 50,
    liveSources: { statusFor() { return "ready"; }, setActiveSource() {} },
    mediaCache: { stats: () => ({}) }
  });
  agent.snapshot = { output: { enabled: true }, liveSources: [source], log: { id: "log", items: [] } };
  agent.lastSnapshotAtMs = Date.now();

  await agent.pollCommands();
  assert.equal(scheduler.status().mode, "live");
  assert.equal(scheduler.status().current.sourceId, "camera");
  assert.equal(agent.casparStateDirty, false);
  assert.equal(agent.graphicsStateDirty, true);
  assert.equal(agent.health().status, "degraded");
  assert.equal(events.queued.find((event) => event.type === "command_ack").status, "completed");
  await until(() => agent.graphicsStateDirty === false);
  assert.equal(scheduler.status().mode, "live");
  assert.equal(amcp.commands.filter((command) => command.startsWith("PLAY 1-10")).length, 1);
  assert.equal(agent.casparStateDirty, false);
  assert.equal(agent.health().status, "healthy");
  await agent.stop("TEST");
});

test("a manual item take is not undone when its overlay update fails", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-manual-graphics-"));
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
    add(type, value) { this.queued.push({ type, ...value }); },
    async persist() {},
    async flush() {},
    get size() { return this.queued.length; }
  };
  const graphics = {
    activate() {},
    suppress() {},
    setOverlayPolicy() {},
    async sync() { throw new Error("CG template unavailable"); },
    async clear() {}
  };
  const scheduler = new PlayoutScheduler({
    amcp, channel: 1, layer: 10, fps: 30, fallbackClip: "FALLBACK",
    preloadLeadMs: 1000, eventBuffer: events, graphics
  });
  const now = Date.now();
  await scheduler.update({
    output: { enabled: true, alwaysOn: true }, serverTimeMs: now, receivedAtMs: now,
    log: { id: "log", items: [{
      id: "item-1", assetId: "asset-1", mediaVersionId: "version-1",
      startMs: now, endMs: now + 30_000, durationMs: 30_000, overlayPolicy: "all"
    }] }
  }, new Map([["version-1", { mediaVersionId: "version-1", clipName: "neusecast/item-1", validated: true }]]));
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { commands: async () => ({ commands: [{ id: "take-item", type: "take_item", payload: { programItemId: "item-1" } }] }) },
    amcp, scheduler, events, graphics, graphicsRetryMs: 60_000,
    liveSources: { setActiveSource() {} },
    mediaCache: { stats: () => ({}) }
  });
  agent.snapshot = { output: { enabled: true }, liveSources: [], log: { id: "log", items: [] } };
  agent.lastSnapshotAtMs = Date.now();

  await agent.pollCommands();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduler.status().mode, "automation");
  assert.equal(scheduler.status().current.itemId, "item-1");
  assert.equal(amcp.commands.filter((command) => command.startsWith("PLAY 1-10")).length, 1);
  assert.equal(agent.casparStateDirty, false);
  assert.equal(agent.graphicsStateDirty, true);
  assert.equal(agent.health().status, "degraded");
  assert.equal(events.queued.find((event) => event.type === "command_ack").status, "completed");
  await agent.stop("TEST");
});

test("a no-op automation return cannot clear an inherited dirty state", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-dirty-noop-return-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const amcp = new EventEmitter();
  amcp.connected = false;
  const events = { queued: [], add(type, details) { this.queued.push({ type, ...details }); }, async persist() {}, get size() { return this.queued.length; } };
  const scheduler = {
    graphicsOperationConfirmed: true,
    status() { return { mode: "automation", current: null }; },
    async returnToAutomation() { return false; }
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
    api: { commands: async () => ({ commands: [{ id: "noop-return", type: "resume_automation", payload: {} }] }) },
    amcp, scheduler, events, graphics: {}, mediaCache: { stats: () => ({}) }
  });
  agent.casparStateDirty = true;
  await agent.pollCommands();
  assert.equal(agent.casparStateDirty, true);
  const ack = events.queued.find((event) => event.type === "command_ack");
  assert.equal(ack.status, "completed");
  assert.match(ack.message, /already active/);
});

test("a manual take of unavailable media is acknowledged failed while fallback airs", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-missing-take-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const now = Date.now();
  const events = { queued: [], add(type, value) { this.queued.push({ type, ...value }); }, async persist() {}, get size() { return this.queued.length; } };
  const amcp = new EventEmitter();
  amcp.connected = true;
  amcp.commands = [];
  amcp.send = async (command) => { amcp.commands.push(command); return { code: 202, lines: [] }; };
  const graphics = {
    activate() {},
    setOverlayPolicy() {},
    async sync() {},
    async clear() {}
  };
  const scheduler = new PlayoutScheduler({
    amcp,
    channel: 1,
    layer: 10,
    fps: 30,
    fallbackClip: "FALLBACK",
    preloadLeadMs: 1000,
    eventBuffer: events,
    graphics
  });
  await scheduler.update({
    output: { alwaysOn: true },
    serverTimeMs: now,
    receivedAtMs: now,
    log: { id: "log", items: [
      { id: "missing", mediaVersionId: "version-missing", startMs: now, endMs: now + 5000, overlayPolicy: "all", media: {} }
    ] }
  }, new Map());
  const config = loadConfig({
    NEUSECAST_BASE_URL: "https://neusecast.example",
    BROADCAST_AGENT_SECRET: "a-secret-longer-than-sixteen-characters",
    BROADCAST_OUTPUT_KEY: "main",
    BROADCAST_AGENT_ID: "neusecast-playout-01",
    AGENT_STATE_DIR: stateDir,
    MEDIA_CACHE_DIR: path.join(stateDir, "media")
  });
  const agent = new BroadcastAgent(config, {
    api: { commands: async () => ({ commands: [{ id: "missing-take", type: "take_item", payload: { programItemId: "missing" } }] }) },
    amcp,
    events,
    graphics,
    scheduler,
    liveSources: { setActiveSource() {} },
    mediaCache: { stats: () => ({}) }
  });
  agent.snapshot = { output: { enabled: true }, liveSources: [] };

  await agent.pollCommands();

  const ack = events.queued.find((event) => event.type === "command_ack");
  assert.equal(ack.status, "failed");
  assert.match(ack.message, /media is not ready: missing; fallback is on air/);
  assert.equal(scheduler.status().mode, "fallback");
  assert.ok(amcp.commands.includes('PLAY 1-10 "FALLBACK" LOOP'));
});

test("idempotency key prevents a duplicate command side effect", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-idempotency-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const commands = [
    { id: "c1", type: "skip", idempotencyKey: "same-action", payload: {} },
    { id: "c2", type: "skip", idempotencyKey: "same-action", payload: {} }
  ];
  let skips = 0;
  const events = { queued: [], add(type, value) { this.queued.push({ type, ...value }); }, async persist() {}, get size() { return this.queued.length; } };
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
    api: { commands: async () => ({ commands }) }, amcp, events,
    graphics: {},
    scheduler: { disabled: false, async skip() { skips += 1; return "next"; }, status() { return { mode: "automation", current: null }; } },
    mediaCache: { stats: () => ({}) }
  });
  await agent.pollCommands();
  assert.equal(skips, 1);
  assert.equal(events.queued.filter((event) => event.type === "command_ack").length, 2);
});

test("a durable running intent is not replayed after an agent crash", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-crash-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const command = { id: "c-crash", type: "skip", idempotencyKey: "skip-once", payload: {} };
  const journal = new CommandJournal({ filename: path.join(stateDir, "handled-commands.json") });
  await journal.initialize();
  await journal.record(command, "running", "Command execution started");
  let skips = 0;
  const events = { queued: [], add(type, value) { this.queued.push({ type, ...value }); }, async persist() {}, get size() { return this.queued.length; } };
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
    api: { commands: async () => ({ commands: [command] }) }, amcp, events, commandJournal: journal,
    graphics: {},
    scheduler: { disabled: false, async skip() { skips += 1; return "next"; }, status() { return { mode: "automation", current: null }; } },
    mediaCache: { stats: () => ({}) }
  });
  await agent.pollCommands();
  assert.equal(skips, 0);
  const ack = events.queued.find((event) => event.type === "command_ack");
  assert.equal(ack.status, "failed");
  assert.match(ack.message, /outcome is unknown/);
});

test("an out-of-order output command cannot cross the latest server barrier", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "neusecast-agent-output-command-order-"));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  let stops = 0;
  const events = { queued: [], add(type, value) { this.queued.push({ type, ...value }); }, async persist() {}, get size() { return this.queued.length; } };
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
    api: { commands: async () => ({ commands: [{
      id: "late-old-stop", type: "stop_output",
      payload: { desiredEnabled: false, desiredAlwaysOn: false, desiredControlRevision: 2 }
    }] }) },
    amcp, events, graphics: {}, mediaCache: { stats: () => ({}) },
    scheduler: {
      disabled: false,
      status() { return { mode: "automation", current: null }; },
      async stopOutput() { stops += 1; }
    }
  });
  agent.latestOutputControlRevision = 3;
  await agent.pollCommands();
  assert.equal(stops, 0);
  const ack = events.queued.find((event) => event.type === "command_ack");
  assert.equal(ack.status, "ignored");
  assert.match(ack.message, /Ignored stale/);
});
