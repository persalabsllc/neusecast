import path from "node:path";
import { safeIdentifier } from "./util.mjs";

function integer(env, name, fallback, minimum, maximum) {
  const raw = env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env = process.env) {
  const baseUrl = new URL(required(env, "NEUSECAST_BASE_URL"));
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("NEUSECAST_BASE_URL must be HTTP or HTTPS");
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]).has(baseUrl.hostname);
  if (baseUrl.protocol !== "https:" && !loopback && env.ALLOW_INSECURE_CONTROL_PLANE !== "true") {
    throw new Error("NEUSECAST_BASE_URL must use HTTPS outside loopback development");
  }
  baseUrl.pathname = baseUrl.pathname.replace(/\/$/, "");

  const secret = required(env, "BROADCAST_AGENT_SECRET");
  if (secret.length < 16) throw new Error("BROADCAST_AGENT_SECRET must be at least 16 characters");

  const outputKey = safeIdentifier(required(env, "BROADCAST_OUTPUT_KEY"), "BROADCAST_OUTPUT_KEY");
  const agentId = safeIdentifier(required(env, "BROADCAST_AGENT_ID"), "BROADCAST_AGENT_ID");
  const stateDir = path.resolve(env.AGENT_STATE_DIR?.trim() || "/var/lib/neusecast-agent");
  const mediaDir = path.resolve(env.MEDIA_CACHE_DIR?.trim() || "/var/lib/casparcg/media");
  const legacyMediaMax = env.MEDIA_MAX_BYTES;
  const mediaMaxFileBytes = legacyMediaMax !== undefined && env.MEDIA_MAX_FILE_BYTES === undefined
    ? integer(env, "MEDIA_MAX_BYTES", 5 * 1024 * 1024 * 1024, 1024, Number.MAX_SAFE_INTEGER)
    : integer(env, "MEDIA_MAX_FILE_BYTES", 5 * 1024 * 1024 * 1024, 1024, Number.MAX_SAFE_INTEGER);

  return Object.freeze({
    baseUrl,
    secret,
    outputKey,
    agentId,
    stateDir,
    mediaDir,
    mediaMaxFileBytes,
    mediaCacheMaxBytes: integer(env, "MEDIA_CACHE_MAX_BYTES", 20 * 1024 * 1024 * 1024, mediaMaxFileBytes, Number.MAX_SAFE_INTEGER),
    mediaIngest: Object.freeze({
      // Zero means transport failures retry indefinitely. Validation failures
      // are terminal regardless of this setting.
      maxAttempts: integer(env, "MEDIA_INGEST_MAX_ATTEMPTS", 0, 0, 1000000),
      retryBaseMs: integer(env, "MEDIA_INGEST_RETRY_BASE_MS", 5000, 250, 3600000),
      retryMaxMs: integer(env, "MEDIA_INGEST_RETRY_MAX_MS", 300000, 1000, 86400000),
      downloadTimeoutMs: integer(env, "MEDIA_DOWNLOAD_TIMEOUT_MS", 1800000, 30000, 86400000)
    }),
    caspar: Object.freeze({
      host: env.CASPAR_HOST?.trim() || "127.0.0.1",
      port: integer(env, "CASPAR_PORT", 5250, 1, 65535),
      channel: integer(env, "CASPAR_CHANNEL", 1, 1, 9999),
      programLayer: integer(env, "CASPAR_PROGRAM_LAYER", 10, 0, 9999),
      graphicsLayer: integer(env, "CASPAR_GRAPHICS_LAYER", 900, 0, 9999),
      graphicsTemplate: safeIdentifier(env.CASPAR_GRAPHICS_TEMPLATE?.trim() || "neusecast-overlay", "CASPAR_GRAPHICS_TEMPLATE"),
      fps: integer(env, "CASPAR_FORMAT_FPS", 30, 1, 120),
      fallbackClip: safeIdentifier(env.CASPAR_FALLBACK_CLIP?.trim() || "NEUSECAST_FALLBACK", "CASPAR_FALLBACK_CLIP"),
      commandTimeoutMs: integer(env, "CASPAR_COMMAND_TIMEOUT_MS", 5000, 250, 60000),
      connectTimeoutMs: integer(env, "CASPAR_CONNECT_TIMEOUT_MS", 5000, 250, 60000)
    }),
    intervals: Object.freeze({
      snapshotMs: integer(env, "SNAPSHOT_INTERVAL_MS", 5000, 1000, 300000),
      commandMs: integer(env, "COMMAND_INTERVAL_MS", 1500, 250, 300000),
      scheduleTickMs: integer(env, "SCHEDULE_TICK_MS", 200, 50, 5000),
      preloadLeadMs: integer(env, "PRELOAD_LEAD_MS", 8000, 500, 60000),
      heartbeatMs: integer(env, "HEARTBEAT_INTERVAL_MS", 10000, 1000, 300000),
      eventFlushMs: integer(env, "EVENT_FLUSH_INTERVAL_MS", 2000, 250, 300000),
      graphicsClockSyncMs: integer(env, "GRAPHICS_CLOCK_SYNC_MS", 30000, 5000, 300000),
      mediaIngestRetryMs: integer(env, "MEDIA_INGEST_RETRY_TICK_MS", 1000, 250, 60000),
      liveSourceProbeMs: integer(env, "LIVE_SOURCE_PROBE_INTERVAL_MS", 15000, 2000, 300000),
      liveSourceProbeTimeoutMs: integer(env, "LIVE_SOURCE_PROBE_TIMEOUT_MS", 6000, 500, 60000),
      apiTimeoutMs: integer(env, "API_TIMEOUT_MS", 10000, 500, 120000)
    }),
    health: Object.freeze({
      host: env.LOCAL_HEALTH_HOST?.trim() || "127.0.0.1",
      port: integer(env, "LOCAL_HEALTH_PORT", 8787, 1, 65535)
    })
  });
}
