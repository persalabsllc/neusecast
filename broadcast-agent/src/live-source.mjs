import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { amcpQuote } from "./amcp.mjs";
import { asObject, firstDefined, stableStringify, withoutControlCharacters } from "./util.mjs";

const execFileAsync = promisify(execFile);
const NETWORK_PROTOCOLS = new Set(["srt:", "rtmp:", "rtmps:", "rtsp:", "http:", "https:", "udp:"]);
const NETWORK_TYPES = new Set(["srt", "rtmp", "rtmps", "rtsp", "http", "https", "udp", "hls", "stream"]);

function sourceFingerprint(source) {
  const root = asObject(source);
  const input = asObject(firstDefined(root.input, root));
  const metadata = asObject(root.metadata);
  // Exclude server-maintained readiness/status fields. A status event must not
  // invalidate a probe, while any endpoint or credential-reference change must.
  return stableStringify({
    enabled: root.enabled !== false,
    type: firstDefined(input.type, root.type, root.protocol, "stream"),
    protocol: firstDefined(input.protocol, root.protocol),
    endpointUrl: firstDefined(input.endpointUrl, root.endpointUrl),
    url: firstDefined(input.url, root.url, root.inputUrl),
    device: firstDefined(input.device, root.device),
    credentialSecretRef: firstDefined(input.credentialSecretRef, root.credentialSecretRef),
    activeAutoFailover: firstDefined(input.activeAutoFailover, root.activeAutoFailover, metadata.activeAutoFailover, root.monitorWhileLive, false)
  });
}

function credentialUrl(source, input, env) {
  const reference = firstDefined(input.credentialSecretRef, source.credentialSecretRef);
  if (!reference) return null;
  const match = /^env:([A-Z][A-Z0-9_]{1,127})$/.exec(String(reference));
  if (!match) throw new Error("Live source credentialSecretRef must use env:VARIABLE_NAME");
  const value = env[match[1]];
  if (!value) throw new Error(`Live source credential environment variable is missing: ${match[1]}`);
  return value;
}

export function decklinkDeviceFor(value) {
  if (Number.isInteger(value)) {
    if (value >= 1 && value <= 64) return value;
    throw new Error("DeckLink device index must be between 1 and 64");
  }
  const text = withoutControlCharacters(value, "DeckLink device identifier").trim();
  const match = /(?:^|\s|\()(\d{1,2})\)?$/.exec(text);
  const device = match ? Number(match[1]) : Number.NaN;
  if (!Number.isInteger(device) || device < 1 || device > 64) {
    throw new Error("DeckLink endpoint must be a device index from 1 to 64 (for example, 1 or DeckLink Duo (1))");
  }
  return device;
}

export function resolveLiveSource(source, env = process.env) {
  const root = asObject(source);
  const input = asObject(firstDefined(root.input, root));
  const declaredType = String(firstDefined(input.type, root.type, root.protocol, "stream")).trim().toLowerCase();

  if (declaredType === "test") {
    // CasparCG 2.5 has a built-in color producer; `[TEST]` is not a registered
    // producer in 2.5 and would fail at take time.
    return { kind: "test", protocol: "test", producer: "#06131D", probeMethod: "built-in-color" };
  }

  if (declaredType === "decklink") {
    const device = decklinkDeviceFor(firstDefined(input.device, root.device, input.endpointUrl, root.endpointUrl));
    return { kind: "decklink", protocol: "decklink", device, producer: `DECKLINK DEVICE ${device}`, probeMethod: "configuration" };
  }

  if (!NETWORK_TYPES.has(declaredType)) throw new Error(`Unsupported live source type: ${declaredType}`);
  const rawUrl = credentialUrl(root, input, env) ?? firstDefined(input.url, root.url, root.inputUrl, input.endpointUrl, root.endpointUrl, "");
  let url;
  try {
    url = new URL(withoutControlCharacters(rawUrl, "live source URL"));
  } catch {
    throw new Error("Invalid URL for live source endpoint");
  }
  if (!NETWORK_PROTOCOLS.has(url.protocol)) throw new Error(`Unsupported live stream protocol: ${url.protocol}`);
  return {
    kind: "network",
    protocol: url.protocol.slice(0, -1),
    url: url.toString(),
    producer: amcpQuote(url.toString()),
    probeMethod: "ffprobe"
  };
}

export function streamProducerFor(source, env = process.env) {
  return resolveLiveSource(source, env).producer;
}

export async function probeNetworkSource(resolved, { ffprobePath = "ffprobe", timeoutMs = 6000 } = {}) {
  if (resolved.kind !== "network") return { playable: true, streams: [], probeMethod: resolved.probeMethod };
  const inputOptions = resolved.protocol === "rtsp" ? ["-rtsp_transport", "tcp"] : [];
  let stdout;
  try {
    ({ stdout } = await execFileAsync(ffprobePath, [
      "-v", "error",
      ...inputOptions,
      "-rw_timeout", String(timeoutMs * 1000),
      "-show_entries", "stream=codec_type",
      "-of", "json",
      resolved.url
    ], { timeout: timeoutMs + 1000, maxBuffer: 256 * 1024 }));
  } catch {
    // Never include ffprobe's error: it may repeat a credential-bearing input URL.
    throw new Error("No playable signal was detected before the live-source probe timed out");
  }
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    throw new Error("The live-source probe returned an invalid response");
  }
  const streams = Array.isArray(result.streams)
    ? result.streams.map((stream) => String(stream?.codec_type ?? "")).filter((type) => type === "video" || type === "audio")
    : [];
  if (!streams.length) throw new Error("The live source has no playable audio or video signal");
  return { playable: true, streams: [...new Set(streams)], probeMethod: "ffprobe" };
}

export class LiveSourceMonitor {
  constructor({ eventBuffer, env = process.env, ffprobePath = "ffprobe", timeoutMs = 6000, probe = probeNetworkSource }) {
    this.eventBuffer = eventBuffer;
    this.env = env;
    this.ffprobePath = ffprobePath;
    this.timeoutMs = timeoutMs;
    this.probe = probe;
    this.sources = new Map();
    this.statuses = new Map();
    this.fingerprints = new Map();
    this.generations = new Map();
    this.activeSourceId = null;
    this.activeGeneration = 0;
    this.reprobeRequested = false;
    this.probeOptions = { outputEnabled: true };
    this.running = null;
  }

  update(sources) {
    const next = new Map();
    const nextFingerprints = new Map();
    const nextGenerations = new Map();
    let changed = false;
    for (const source of Array.isArray(sources) ? sources : []) {
      if (!source?.id) continue;
      const id = String(source.id);
      const fingerprint = sourceFingerprint(source);
      const priorFingerprint = this.fingerprints.get(id);
      const generation = priorFingerprint === fingerprint
        ? (this.generations.get(id) ?? 1)
        : (this.generations.get(id) ?? 0) + 1;
      if (priorFingerprint !== undefined && priorFingerprint !== fingerprint) {
        this.statuses.delete(id);
        changed = true;
      }
      if (priorFingerprint === undefined) changed = true;
      next.set(id, source);
      nextFingerprints.set(id, fingerprint);
      nextGenerations.set(id, generation);
    }
    for (const id of this.sources.keys()) {
      if (!next.has(id)) {
        this.statuses.delete(id);
        changed = true;
      }
    }
    this.sources = next;
    this.fingerprints = nextFingerprints;
    this.generations = nextGenerations;
    if (changed && this.running) this.reprobeRequested = true;
  }

  probeAll({ activeSourceId = null, outputEnabled = true } = {}) {
    this.setActiveSource(activeSourceId);
    this.probeOptions = { outputEnabled };
    if (this.running) {
      this.reprobeRequested = true;
      return this.running;
    }
    this.running = this.#drainProbes()
      .finally(() => { this.running = null; });
    return this.running;
  }

  setActiveSource(sourceId) {
    const next = sourceId ? String(sourceId) : null;
    const previous = this.activeSourceId;
    if (previous === next) return;
    this.activeSourceId = next;
    this.activeGeneration += 1;
    // The scheduler reports the intentional transition to the server. Remove
    // the local cached status so the next actual probe emits ready again;
    // silently changing live->ready would leave a prior server-side offline
    // event stuck forever after a disconnect.
    if (previous && previous !== next) this.statuses.delete(previous);
    if (next && this.sources.has(next)) this.statuses.set(next, "live");
  }

  statusFor(sourceId) {
    return this.statuses.get(String(sourceId)) ?? null;
  }

  async #drainProbes() {
    do {
      this.reprobeRequested = false;
      await this.#probeAll();
    } while (this.reprobeRequested);
  }

  async #probeAll() {
    const queue = [...this.sources.values()].map((source) => {
      const id = String(source.id);
      const active = id === this.activeSourceId;
      return {
        source,
        generation: this.generations.get(id),
        active,
        activeGeneration: active ? this.activeGeneration : null
      };
    });
    const workers = Array.from({ length: Math.min(2, Math.max(queue.length, 1)) }, async () => {
      while (queue.length) {
        const { source, generation, active, activeGeneration } = queue.shift();
        const id = String(source.id);
        if (source.enabled === false || source.status === "disabled") {
          this.#emit(source, generation, "disabled", null, { probeMethod: "disabled" }, { active, activeGeneration });
          continue;
        }
        const activeAutoFailover = source.activeAutoFailover === true ||
          asObject(source.metadata).activeAutoFailover === true ||
          source.monitorWhileLive === true;
        if (active && !activeAutoFailover) {
          this.statuses.set(id, "live");
          continue;
        }
        await this.#probeOne(source, generation, { active, activeGeneration });
      }
    });
    await Promise.all(workers);
  }

  async #probeOne(source, generation, activeProbe = {}) {
    let resolved;
    try {
      resolved = resolveLiveSource(source, this.env);
    } catch (error) {
      this.#emit(source, generation, "error", error instanceof Error ? error.message : "Invalid live-source configuration", { probeMethod: "configuration" }, activeProbe);
      return;
    }

    if (resolved.kind === "test" || resolved.kind === "decklink") {
      this.#emit(source, generation, activeProbe.active ? "live" : "ready", null, { probeMethod: resolved.probeMethod, device: resolved.device ?? null }, activeProbe);
      return;
    }

    if (!activeProbe.active && this.statuses.get(String(source.id)) !== "ready") {
      this.#emit(source, generation, "connecting", null, { probeMethod: resolved.probeMethod }, activeProbe);
    }
    try {
      const result = await this.probe(resolved, { ffprobePath: this.ffprobePath, timeoutMs: this.timeoutMs });
      this.#emit(source, generation, activeProbe.active ? "live" : "ready", null, { probeMethod: result.probeMethod, streams: result.streams }, activeProbe);
    } catch (error) {
      this.#emit(source, generation, "offline", error instanceof Error ? error.message : "No playable signal was detected", { probeMethod: resolved.probeMethod }, activeProbe);
    }
  }

  #emit(source, generation, status, errorMessage, metadata, { active = false, activeGeneration = null } = {}) {
    const id = String(source.id);
    if (!this.sources.has(id) || this.generations.get(id) !== generation) return;
    if (active && (this.activeSourceId !== id || this.activeGeneration !== activeGeneration)) return;
    // A probe that began while the source was on standby cannot overwrite the
    // scheduler's later Take Live status. A subsequent active watchdog probe
    // is allowed to report genuine signal loss.
    if (!active && this.activeSourceId === id && status !== "live") return;
    if (this.statuses.get(id) === status) return;
    this.statuses.set(id, status);
    this.eventBuffer.add("live_source_status", {
      sourceId: id,
      status,
      errorMessage,
      label: String(source.label ?? source.name ?? id),
      metadata
    });
  }
}
