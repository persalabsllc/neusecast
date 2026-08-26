import { amcpQuote, layerAddress } from "./amcp.mjs";
import { asArray, asObject, firstDefined, parseDateMs, stableStringify } from "./util.mjs";

export function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
}

function component(id, value) {
  return `<componentData id="${xmlEscape(id)}"><data id="text" value="${xmlEscape(value)}"/></componentData>`;
}

function normalizeTicker(raw) {
  const source = asObject(raw);
  const entries = asArray(firstDefined(source.items, source.ticker, raw)).map((item) => {
    if (typeof item === "string") return item.trim();
    return String(firstDefined(item?.text, item?.message, item?.headline, "")).trim();
  }).filter(Boolean);
  return [...new Set(entries)].slice(0, 50);
}

export function normalizeGraphics(graphics, { serverTimeMs = Date.now(), overlayPolicy = "all" } = {}) {
  const source = asObject(graphics);
  const config = asObject(source.overlayConfig);
  const rawDefinitions = asArray(source.definitions);
  const usesLayerDefinitions = Array.isArray(source.definitions);
  const byType = new Map(rawDefinitions.map((entry) => [
    String(firstDefined(entry?.type, entry?.kind, entry?.slot, "")),
    { ...asObject(entry), ...asObject(entry?.payload), ...asObject(entry?.data) }
  ]));
  const raw = asObject(source.raw);
  const logo = { ...asObject(byType.get("logo")), ...asObject(config.logo), ...asObject(raw.logo) };
  const weather = { ...asObject(byType.get("weather")), ...asObject(config.weather), ...asObject(raw.weather) };
  const clock = { ...asObject(byType.get("clock")), ...asObject(config.clock), ...asObject(raw.clock) };
  const tickerSource = firstDefined(source.ticker, raw.ticker, config.ticker, byType.get("ticker"), []);
  const policyObject = asObject(overlayPolicy);
  const policy = typeof overlayPolicy === "string" ? overlayPolicy : String(firstDefined(policyObject.mode, policyObject.policy, "all"));
  const suppressAll = policy === "none" || policy === "clean" || policyObject.visible === false || policyObject.all === false;
  const permits = (kind) => firstDefined(
    policyObject[kind],
    policyObject[`show${kind[0].toUpperCase()}${kind.slice(1)}`],
    policyObject[`allow${kind[0].toUpperCase()}${kind.slice(1)}`],
    true
  ) !== false;
  const tickerItems = normalizeTicker(tickerSource);
  const layerEnabled = (kind) => !usesLayerDefinitions || byType.has(kind);
  const weatherExpiresMs = parseDateMs(firstDefined(weather.expiresAt, config.weatherExpiresAt));
  const weatherFresh = weatherExpiresMs === null || weatherExpiresMs > serverTimeMs;

  return {
    logoVisible: !suppressAll && permits("logo") && layerEnabled("logo") && firstDefined(logo.visible, config.showLogo, true) !== false,
    logoLabel: String(firstDefined(logo.label, logo.text, config.logoLabel, "NEUSECAST")),
    logoUrl: String(firstDefined(logo.url, logo.imageUrl, config.logoUrl, "")),
    weatherVisible: !suppressAll && permits("weather") && policy !== "no_weather" && layerEnabled("weather") && weatherFresh && firstDefined(weather.visible, config.showWeather, true) !== false,
    temperature: String(firstDefined(weather.temperature, weather.temperatureText, weather.temp, "--°")),
    condition: String(firstDefined(weather.condition, weather.shortForecast, "Eastern Carolina")),
    location: String(firstDefined(weather.location, weather.stationName, "New Bern")),
    clockVisible: !suppressAll && permits("clock") && policy !== "no_clock" && layerEnabled("clock") && firstDefined(clock.visible, config.showClock, true) !== false,
    timeZone: String(firstDefined(clock.timeZone, config.timeZone, "America/New_York")),
    clockFormat: String(firstDefined(clock.format, config.clockFormat, "h:mm a")),
    tickerVisible: !suppressAll && permits("ticker") && policy !== "no_ticker" && layerEnabled("ticker") && tickerItems.length > 0,
    tickerText: tickerItems.join("     •     "),
    tickerSpeedSeconds: Number(firstDefined(asObject(tickerSource).speedSeconds, config.tickerSpeedSeconds, 45)),
    serverTimeMs
  };
}

export function graphicsTemplateData(graphics) {
  return `<templateData>${Object.entries(graphics).filter(([key]) => key !== "overlayPolicy").map(([key, value]) => component(key, value)).join("")}</templateData>`;
}

export class GraphicsController {
  constructor({ amcp, channel, layer, template }) {
    this.amcp = amcp;
    this.address = layerAddress(channel, layer);
    this.template = template;
    this.loaded = false;
    this.lastStableState = null;
    this.baseGraphics = {};
    this.serverOffsetMs = 0;
    this.overlayPolicy = "all";
    this.desiredEnabled = true;
    this.operationChain = Promise.resolve();
    amcp.on("disconnect", () => { this.loaded = false; });
  }

  setSnapshot(graphics, serverTimeMs, receivedAtMs) {
    this.baseGraphics = graphics ?? {};
    this.serverOffsetMs = serverTimeMs - receivedAtMs;
  }

  setOverlayPolicy(policy) {
    this.overlayPolicy = typeof policy === "string" || (policy && typeof policy === "object") ? policy : "all";
  }

  activate() {
    this.desiredEnabled = true;
  }

  suppress() {
    this.desiredEnabled = false;
  }

  #serialize(operation) {
    const task = this.operationChain.then(operation, operation);
    this.operationChain = task.catch(() => undefined);
    return task;
  }

  sync(options = {}) {
    return this.#serialize(() => this.#sync(options));
  }

  async #sync({ force = false, clockOnly = false } = {}) {
    // clear()/suppress() changes desired state synchronously. A clock update
    // already queued behind a slow clear must not re-add the overlay afterward.
    if (!this.desiredEnabled) return false;
    const state = normalizeGraphics(this.baseGraphics, {
      serverTimeMs: Date.now() + this.serverOffsetMs,
      overlayPolicy: this.overlayPolicy
    });
    const stableState = { ...state, serverTimeMs: 0 };
    const fingerprint = stableStringify(stableState);
    if (!force && !clockOnly && this.loaded && fingerprint === this.lastStableState) return false;
    const xml = graphicsTemplateData({ ...state, overlayPolicy: this.overlayPolicy });
    if (!this.loaded) {
      await this.amcp.send(`CG ${this.address} ADD 1 ${amcpQuote(this.template)} 1 ${amcpQuote(xml)}`);
      this.loaded = true;
    } else {
      await this.amcp.send(`CG ${this.address} UPDATE 1 ${amcpQuote(xml)}`);
    }
    this.lastStableState = fingerprint;
    return true;
  }

  clear(options = {}) {
    this.suppress();
    return this.#serialize(() => this.#clear(options));
  }

  async #clear({ force = false } = {}) {
    if (force) {
      await this.amcp.send(`CLEAR ${this.address}`);
      this.loaded = false;
      return;
    }
    if (!this.loaded) return;
    await this.amcp.send(`CG ${this.address} STOP 1`).catch(() => this.amcp.send(`CG ${this.address} REMOVE 1`));
    this.loaded = false;
  }

  reload() {
    return this.#serialize(async () => {
      if (!this.desiredEnabled) return false;
      await this.amcp.send(`CLEAR ${this.address}`);
      this.loaded = false;
      return this.#sync({ force: true });
    });
  }
}
