import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { GraphicsController, graphicsTemplateData, normalizeGraphics, xmlEscape } from "../src/graphics.mjs";

test("graphics data escapes untrusted ticker and logo text", () => {
  assert.equal(xmlEscape('A&B<"'), "A&amp;B&lt;&quot;");
  const normalized = normalizeGraphics({
    definitions: [{ type: "weather", payload: { temperature: "72°", condition: "Clear" } }],
    ticker: [{ text: 'News & weather <now>' }],
    overlayConfig: { logoLabel: 'Neuse "Cast"' }
  }, { serverTimeMs: 123 });
  assert.equal(normalized.temperature, "72°");
  const xml = graphicsTemplateData(normalized);
  assert.match(xml, /News &amp; weather &lt;now&gt;/);
  assert.match(xml, /Neuse &quot;Cast&quot;/);
  assert.doesNotMatch(xml, /<now>/);
});

test("overlay policy can suppress only the ticker", () => {
  const normalized = normalizeGraphics({ ticker: ["one"] }, { overlayPolicy: "no_ticker" });
  assert.equal(normalized.logoVisible, true);
  assert.equal(normalized.tickerVisible, false);
});

test("object overlay policy from a program item suppresses ticker", () => {
  const normalized = normalizeGraphics({ ticker: ["one"] }, { overlayPolicy: { ticker: false } });
  assert.equal(normalized.logoVisible, true);
  assert.equal(normalized.tickerVisible, false);
});

test("supplied layer definitions make missing graphic kinds stay off", () => {
  const normalized = normalizeGraphics({
    definitions: [{ kind: "weather", data: { temperature: "81°" } }],
    ticker: ["This has no active ticker layer"]
  });
  assert.equal(normalized.weatherVisible, true);
  assert.equal(normalized.logoVisible, false);
  assert.equal(normalized.clockVisible, false);
  assert.equal(normalized.tickerVisible, false);
});

test("expired automated weather is never left on air", () => {
  const normalized = normalizeGraphics({
    definitions: [{ kind: "weather", data: { temperature: "81°" } }],
    overlayConfig: { weather: { expiresAt: "2026-08-26T12:00:00.000Z" } }
  }, { serverTimeMs: Date.parse("2026-08-26T12:00:01.000Z") });
  assert.equal(normalized.weatherVisible, false);
});

class BlockingAmcp extends EventEmitter {
  constructor() {
    super();
    this.commands = [];
    this.started = new Promise((resolve) => { this.markStarted = resolve; });
    this.blocked = new Promise((resolve) => { this.release = resolve; });
    this.first = true;
  }

  async send(command) {
    this.commands.push(command);
    if (this.first) {
      this.first = false;
      this.markStarted();
      await this.blocked;
    }
    return { code: 202, lines: [] };
  }
}

test("concurrent graphics sync calls cannot enqueue duplicate CG ADD commands", async () => {
  const amcp = new BlockingAmcp();
  const graphics = new GraphicsController({ amcp, channel: 1, layer: 900, template: "neusecast-overlay" });
  graphics.setSnapshot({ ticker: ["One"] }, Date.now(), Date.now());
  const first = graphics.sync({ force: true });
  await amcp.started;
  const second = graphics.sync();
  amcp.release();
  await Promise.all([first, second]);
  assert.equal(amcp.commands.filter((command) => command.includes(" ADD ")).length, 1);
});

test("a clear requested during CG ADD wins after the in-flight sync", async () => {
  const amcp = new BlockingAmcp();
  const graphics = new GraphicsController({ amcp, channel: 1, layer: 900, template: "neusecast-overlay" });
  graphics.setSnapshot({ ticker: ["One"] }, Date.now(), Date.now());
  const sync = graphics.sync();
  await amcp.started;
  const clear = graphics.clear();
  amcp.release();
  await Promise.all([sync, clear]);
  assert.match(amcp.commands[0], /^CG 1-900 ADD /);
  assert.equal(amcp.commands[1], "CG 1-900 STOP 1");
  assert.equal(graphics.loaded, false);
});

test("a clock sync queued while clear is pending cannot re-add a suppressed overlay", async () => {
  class ImmediateAmcp extends EventEmitter {
    constructor() { super(); this.commands = []; }
    async send(command) { this.commands.push(command); return { code: 202, lines: [] }; }
  }
  const amcp = new ImmediateAmcp();
  const graphics = new GraphicsController({ amcp, channel: 1, layer: 900, template: "neusecast-overlay" });
  graphics.setSnapshot({ ticker: ["One"] }, Date.now(), Date.now());
  await graphics.sync();
  const clear = graphics.clear();
  const clock = graphics.sync({ clockOnly: true });
  const [, clockResult] = await Promise.all([clear, clock]);
  assert.equal(clockResult, false);
  assert.equal(amcp.commands.length, 2);
  assert.equal(amcp.commands[1], "CG 1-900 STOP 1");
  assert.equal(graphics.loaded, false);
});
