export const BROADCAST_AGENT_CONTRACT_VERSION = 1;
export const BROADCAST_AGENT_POLL_AFTER_MS = 2_000;
// Matches the agent's durable event-buffer batch size while keeping requests bounded.
export const MAX_AGENT_EVENTS = 100;
export const MAX_AGENT_REQUEST_BYTES = 128 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AGENT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const OUTPUT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}$/;

const AGENT_STATUSES = new Set(["offline", "starting", "ready", "healthy", "degraded", "stopping"] as const);
const OUTPUT_STATUSES = new Set(["disabled", "standby", "automation", "fallback", "starting", "live", "degraded", "offline", "error"] as const);
const LIVE_SOURCE_STATUSES = new Set(["disabled", "offline", "connecting", "ready", "live", "error"] as const);
const AS_RUN_TYPES = new Set([
  "started",
  "completed",
  "skipped",
  "failed",
  "interrupted",
  "resumed",
  "live_taken",
  "automation_resumed",
  "graphics_changed",
] as const);
const COMMAND_ACK_STATUSES = new Set(["running", "succeeded", "completed", "failed", "ignored"] as const);

type AgentStatus = "offline" | "starting" | "ready" | "degraded" | "stopping";
type OutputStatus = "disabled" | "standby" | "starting" | "live" | "degraded" | "offline" | "error";
type LiveSourceStatus = "disabled" | "offline" | "connecting" | "ready" | "live" | "error";
export type AsRunEventType =
  | "started"
  | "completed"
  | "skipped"
  | "failed"
  | "interrupted"
  | "resumed"
  | "live_taken"
  | "automation_resumed"
  | "graphics_changed";

type JsonRecord = Record<string, unknown>;

type AgentEventBase = {
  eventId: string | null;
  occurredAt: Date;
};

export type BroadcastAgentEvent =
  | (AgentEventBase & {
      type: "heartbeat";
      status: AgentStatus;
      outputStatus: OutputStatus | null;
      hostname: string | null;
      softwareVersion: string | null;
      currentProgramItemId: string | null;
      leaseSeconds: number;
      metrics: Record<string, number>;
      diagnostics: JsonRecord;
      errorMessage: string | null;
    })
  | (AgentEventBase & {
      type: "now_playing";
      logId: string | null;
      programItemId: string | null;
      mediaVersionId: string | null;
      liveSourceId: string | null;
      label: string | null;
      plannedStartAt: Date | null;
      durationMs: number | null;
      metadata: JsonRecord;
    })
  | (AgentEventBase & {
      type: "as_run";
      eventType: AsRunEventType;
      logId: string | null;
      programItemId: string | null;
      mediaVersionId: string | null;
      liveSourceId: string | null;
      label: string | null;
      plannedStartAt: Date | null;
      durationMs: number | null;
      errorMessage: string | null;
      metadata: JsonRecord;
    })
  | (AgentEventBase & {
      type: "command_ack";
      commandId: string;
      idempotencyKey: string | null;
      status: "running" | "succeeded" | "failed" | "cancelled";
      result: JsonRecord | null;
      errorMessage: string | null;
    })
  | (AgentEventBase & {
      type: "error";
      message: string;
      programItemId: string | null;
      metadata: JsonRecord;
    })
  | (AgentEventBase & {
      type: "live_source_status";
      liveSourceId: string;
      status: LiveSourceStatus;
      errorMessage: string | null;
      metadata: JsonRecord;
    })
  | (AgentEventBase & {
      type: "media_ready";
      mediaVersionId: string;
      assetId: string | null;
      durationMs: number | null;
      width: number | null;
      height: number | null;
      mimeType: string | null;
      playbackUrl: string | null;
      checksumSha256: string | null;
      casparClipName: string | null;
      technicalMetadata: JsonRecord;
    })
  | (AgentEventBase & {
      type: "media_failed";
      mediaVersionId: string;
      errorMessage: string;
      retryable: boolean;
      technicalMetadata: JsonRecord;
    });

export type BroadcastAgentEventsEnvelope = {
  outputKey: string;
  agentId: string;
  events: BroadcastAgentEvent[];
};

export type AgentCommandCursor =
  | { kind: "timestamp"; value: Date }
  | { kind: "id"; value: string }
  | null;

export class BroadcastAgentContractError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 = 400,
  ) {
    super(message);
    this.name = "BroadcastAgentContractError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new BroadcastAgentContractError(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new BroadcastAgentContractError(`${field} must be text.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new BroadcastAgentContractError(`${field} must contain 1-${max} characters.`);
  }
  return normalized;
}

function uuid(value: unknown, field: string, required = false) {
  const normalized = text(value, field, 36, required);
  if (normalized && !UUID_PATTERN.test(normalized)) {
    throw new BroadcastAgentContractError(`${field} must be a UUID.`);
  }
  return normalized;
}

function eventId(value: unknown) {
  const normalized = text(value, "eventId", 255);
  if (normalized && !EVENT_ID_PATTERN.test(normalized)) {
    throw new BroadcastAgentContractError("eventId contains unsupported characters.");
  }
  return normalized;
}

function dateTime(value: unknown, field: string, required = false) {
  const normalized = text(value, field, 64, required);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BroadcastAgentContractError(`${field} must be an ISO date and time.`);
  }
  return parsed;
}

function integer(value: unknown, field: string, minimum: number, maximum: number, fallback: number | null = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new BroadcastAgentContractError(`${field} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function record(value: unknown, field: string, maximumBytes = 16 * 1024): JsonRecord {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new BroadcastAgentContractError(`${field} must be an object.`);
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new BroadcastAgentContractError(`${field} must be JSON serializable.`);
  }
  if (new TextEncoder().encode(encoded).byteLength > maximumBytes) {
    throw new BroadcastAgentContractError(`${field} is too large.`);
  }
  return value;
}

function numericRecord(value: unknown, field: string) {
  const values = record(value, field, 8 * 1024);
  const result: Record<string, number> = {};
  for (const [key, metric] of Object.entries(values)) {
    if (key.length > 80 || typeof metric !== "number" || !Number.isFinite(metric)) {
      throw new BroadcastAgentContractError(`${field} must contain finite numeric values.`);
    }
    result[key] = metric;
  }
  return result;
}

function booleanValue(value: unknown, field: string, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new BroadcastAgentContractError(`${field} must be true or false.`);
  return value;
}

function normalizedAgentStatus(value: unknown, field: string): AgentStatus {
  const status = enumValue(value, field, AGENT_STATUSES, true)!;
  return status === "healthy" ? "ready" : status;
}

function normalizedOutputStatus(value: unknown, field: string): OutputStatus | null {
  const status = enumValue(value, field, OUTPUT_STATUSES);
  if (status === "automation") return "live";
  if (status === "fallback") return "degraded";
  return status;
}

function normalizedCommandStatus(value: unknown, field: string) {
  const status = enumValue(value, field, COMMAND_ACK_STATUSES, true)!;
  if (status === "completed") return "succeeded" as const;
  if (status === "ignored") return "cancelled" as const;
  return status;
}

function normalizedLiveSourceStatus(value: unknown, field: string): LiveSourceStatus {
  if (value === "standby") return "ready";
  return enumValue(value, field, LIVE_SOURCE_STATUSES, true)!;
}

function inferredAsRunType(value: JsonRecord, field: string): AsRunEventType {
  if (value.eventType !== undefined && value.eventType !== null) {
    return enumValue(value.eventType, field, AS_RUN_TYPES, true)!;
  }
  const outcome = text(value.outcome, `${field.replace(/\.eventType$/, "")}.outcome`, 120) ?? "completed";
  if (/interrupt|live/i.test(outcome)) return "interrupted";
  if (/fail|error/i.test(outcome)) return "failed";
  if (/skip/i.test(outcome)) return "skipped";
  return "completed";
}

function enumValue<T extends string>(value: unknown, field: string, allowed: ReadonlySet<T>, required = false) {
  const normalized = text(value, field, 80, required);
  if (!normalized) return null;
  if (!allowed.has(normalized as T)) {
    throw new BroadcastAgentContractError(`${field} has an unsupported value.`);
  }
  return normalized as T;
}

function parseEvent(value: unknown, index: number): BroadcastAgentEvent {
  if (!isRecord(value)) throw new BroadcastAgentContractError(`events[${index}] must be an object.`);
  const type = text(value.type, `events[${index}].type`, 40, true);
  const base = {
    eventId: eventId(value.eventId),
    occurredAt: dateTime(value.occurredAt, `events[${index}].occurredAt`) ?? new Date(),
  };
  const prefix = `events[${index}]`;

  switch (type) {
    case "heartbeat":
      {
        const casparConnected = booleanValue(value.casparConnected, `${prefix}.casparConnected`);
        const casparVersion = text(value.casparVersion, `${prefix}.casparVersion`, 160);
        const snapshotVersion = text(value.snapshotVersion, `${prefix}.snapshotVersion`, 160);
        const logVersion = text(value.logVersion, `${prefix}.logVersion`, 160);
        const liveSourceId = uuid(value.liveSourceId, `${prefix}.liveSourceId`);
        const lastSnapshotAt = dateTime(value.lastSnapshotAt, `${prefix}.lastSnapshotAt`);
        const mediaCache = numericRecord(value.mediaCache, `${prefix}.mediaCache`);
        const eventBacklog = integer(value.eventBacklog, `${prefix}.eventBacklog`, 0, 1_000_000, 0)!;
        const uptimeSeconds = integer(value.uptimeSeconds, `${prefix}.uptimeSeconds`, 0, 315_576_000, 0)!;
        const agentVersion = text(value.agentVersion, `${prefix}.agentVersion`, 80);
      return {
        ...base,
        type,
        status: normalizedAgentStatus(value.status, `${prefix}.status`),
        outputStatus: normalizedOutputStatus(value.outputStatus, `${prefix}.outputStatus`),
        hostname: text(value.hostname, `${prefix}.hostname`, 255),
        softwareVersion: text(value.softwareVersion, `${prefix}.softwareVersion`, 80) ?? agentVersion,
        currentProgramItemId: uuid(value.currentProgramItemId, `${prefix}.currentProgramItemId`),
        leaseSeconds: integer(value.leaseSeconds, `${prefix}.leaseSeconds`, 5, 300, 90)!,
        metrics: numericRecord(value.metrics, `${prefix}.metrics`),
        diagnostics: {
          ...record(value.diagnostics, `${prefix}.diagnostics`),
          casparConnected,
          casparVersion,
          snapshotVersion,
          logVersion,
          liveSourceId,
          lastSnapshotAt: lastSnapshotAt?.toISOString() ?? null,
          mediaCache,
          eventBacklog,
          uptimeSeconds,
          agentVersion,
        },
        errorMessage: text(value.errorMessage, `${prefix}.errorMessage`, 2_000),
      };
      }
    case "now_playing":
      return {
        ...base,
        type,
        logId: uuid(value.logId, `${prefix}.logId`),
        programItemId: uuid(value.programItemId, `${prefix}.programItemId`),
        mediaVersionId: uuid(value.mediaVersionId, `${prefix}.mediaVersionId`),
        liveSourceId: uuid(value.liveSourceId, `${prefix}.liveSourceId`),
        label: text(value.label, `${prefix}.label`, 240),
        plannedStartAt: dateTime(value.plannedStartAt, `${prefix}.plannedStartAt`),
        durationMs: integer(value.durationMs, `${prefix}.durationMs`, 0, 86_400_000),
        metadata: {
          ...record(value.metadata, `${prefix}.metadata`),
          mode: text(value.mode, `${prefix}.mode`, 40),
          assetId: uuid(value.assetId, `${prefix}.assetId`),
          clipName: text(value.clipName, `${prefix}.clipName`, 512),
          actualStartAt: dateTime(value.actualStartAt, `${prefix}.actualStartAt`)?.toISOString() ?? null,
          lateByMs: integer(value.lateByMs, `${prefix}.lateByMs`, 0, 86_400_000),
          reason: text(value.reason, `${prefix}.reason`, 240),
        },
      };
    case "as_run":
      return {
        ...base,
        type,
        eventType: inferredAsRunType(value, `${prefix}.eventType`),
        logId: uuid(value.logId, `${prefix}.logId`),
        programItemId: uuid(value.programItemId, `${prefix}.programItemId`),
        mediaVersionId: uuid(value.mediaVersionId, `${prefix}.mediaVersionId`),
        liveSourceId: uuid(value.liveSourceId, `${prefix}.liveSourceId`),
        label: text(value.label, `${prefix}.label`, 240),
        plannedStartAt: dateTime(value.plannedStartAt, `${prefix}.plannedStartAt`),
        durationMs: integer(value.durationMs ?? value.playedDurationMs, `${prefix}.durationMs`, 0, 86_400_000),
        errorMessage: text(value.errorMessage, `${prefix}.errorMessage`, 2_000),
        metadata: {
          ...record(value.metadata, `${prefix}.metadata`),
          assetId: uuid(value.assetId, `${prefix}.assetId`),
          plannedEndAt: dateTime(value.plannedEndAt, `${prefix}.plannedEndAt`)?.toISOString() ?? null,
          actualStartAt: dateTime(value.actualStartAt, `${prefix}.actualStartAt`)?.toISOString() ?? null,
          actualEndAt: dateTime(value.actualEndAt, `${prefix}.actualEndAt`)?.toISOString() ?? null,
          outcome: text(value.outcome, `${prefix}.outcome`, 120),
        },
      };
    case "command_ack":
      {
      const idempotencyKey = text(value.idempotencyKey, `${prefix}.idempotencyKey`, 255);
      return {
        ...base,
        type,
        commandId: uuid(value.commandId, `${prefix}.commandId`, true)!,
        idempotencyKey,
        status: normalizedCommandStatus(value.status, `${prefix}.status`),
        result: {
          ...(value.result === undefined || value.result === null
            ? {}
            : record(value.result, `${prefix}.result`)),
          idempotencyKey,
          message: text(value.message, `${prefix}.message`, 2_000),
        },
        errorMessage: text(value.errorMessage, `${prefix}.errorMessage`, 2_000)
          ?? (value.status === "failed" ? text(value.message, `${prefix}.message`, 2_000) : null),
      };
      }
    case "error":
      return {
        ...base,
        type,
        message: text(value.message ?? value.errorMessage, `${prefix}.message`, 2_000, true)!,
        programItemId: uuid(value.programItemId, `${prefix}.programItemId`),
        metadata: {
          ...record(value.metadata, `${prefix}.metadata`),
          code: text(value.code, `${prefix}.code`, 120),
          retryable: booleanValue(value.retryable, `${prefix}.retryable`, false),
          context: text(value.context, `${prefix}.context`, 160),
          mediaVersionId: uuid(value.mediaVersionId, `${prefix}.mediaVersionId`),
        },
      };
    case "live_source_status":
      return {
        ...base,
        type,
        liveSourceId: uuid(value.liveSourceId ?? value.sourceId, `${prefix}.liveSourceId`, true)!,
        status: normalizedLiveSourceStatus(value.status, `${prefix}.status`),
        errorMessage: text(value.errorMessage, `${prefix}.errorMessage`, 2_000),
        metadata: {
          ...record(value.metadata, `${prefix}.metadata`),
          label: text(value.label, `${prefix}.label`, 240),
          takenAt: dateTime(value.takenAt, `${prefix}.takenAt`)?.toISOString() ?? null,
          endedAt: dateTime(value.endedAt, `${prefix}.endedAt`)?.toISOString() ?? null,
          reason: text(value.reason, `${prefix}.reason`, 240),
        },
      };
    case "media_ready":
      return {
        ...base,
        type,
        mediaVersionId: uuid(value.mediaVersionId, `${prefix}.mediaVersionId`, true)!,
        assetId: uuid(value.assetId, `${prefix}.assetId`),
        durationMs: integer(value.durationMs, `${prefix}.durationMs`, 1, 86_400_000),
        width: integer(value.width, `${prefix}.width`, 1, 32_768),
        height: integer(value.height, `${prefix}.height`, 1, 32_768),
        mimeType: text(value.mimeType, `${prefix}.mimeType`, 160),
        playbackUrl: text(value.playbackUrl, `${prefix}.playbackUrl`, 2_048),
        checksumSha256: (() => {
          const checksum = text(value.sha256, `${prefix}.sha256`, 64);
          if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) {
            throw new BroadcastAgentContractError(`${prefix}.sha256 must be a SHA-256 digest.`);
          }
          return checksum?.toLowerCase() ?? null;
        })(),
        casparClipName: text(value.casparClipName, `${prefix}.casparClipName`, 512),
        technicalMetadata: {
          ...record(value.technicalMetadata ?? value.metadata, `${prefix}.technicalMetadata`),
          videoCodec: text(value.videoCodec, `${prefix}.videoCodec`, 80),
          audioCodec: text(value.audioCodec, `${prefix}.audioCodec`, 80),
          casparClipName: text(value.casparClipName, `${prefix}.casparClipName`, 512),
        },
      };
    case "media_failed":
      return {
        ...base,
        type,
        mediaVersionId: uuid(value.mediaVersionId, `${prefix}.mediaVersionId`, true)!,
        errorMessage: text(value.error ?? value.errorMessage, `${prefix}.error`, 2_000, true)!,
        retryable: booleanValue(value.retryable, `${prefix}.retryable`, false),
        technicalMetadata: {
          ...record(value.technicalMetadata ?? value.metadata, `${prefix}.technicalMetadata`),
          retryable: booleanValue(value.retryable, `${prefix}.retryable`, false),
        },
      };
    default:
      throw new BroadcastAgentContractError(`${prefix}.type has an unsupported value.`);
  }
}

export function parseAgentKey(value: unknown) {
  const normalized = text(value, "agentId", 120, true)!;
  if (!AGENT_KEY_PATTERN.test(normalized)) {
    throw new BroadcastAgentContractError("agentId contains unsupported characters.");
  }
  return normalized;
}

export function parseOutputKey(value: unknown) {
  const normalized = text(value, "outputKey", 120, true)!;
  if (!OUTPUT_KEY_PATTERN.test(normalized)) {
    throw new BroadcastAgentContractError("outputKey contains unsupported characters.");
  }
  return normalized;
}

export function parseCommandCursor(value: unknown): AgentCommandCursor {
  if (value === undefined || value === null || value === "") return null;
  const normalized = text(value, "after", 64, true)!;
  if (UUID_PATTERN.test(normalized)) return { kind: "id", value: normalized };
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BroadcastAgentContractError("after must be a command UUID or ISO date and time.");
  }
  return { kind: "timestamp", value: parsed };
}

export async function readAgentEventsEnvelope(request: Request): Promise<BroadcastAgentEventsEnvelope> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_AGENT_REQUEST_BYTES) {
    throw new BroadcastAgentContractError("Agent event payload is too large.", 413);
  }

  if (!request.body) throw new BroadcastAgentContractError("A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_AGENT_REQUEST_BYTES) {
      await reader.cancel();
      throw new BroadcastAgentContractError("Agent event payload is too large.", 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new BroadcastAgentContractError("The request body must be valid JSON.");
  }
  if (!isRecord(value)) throw new BroadcastAgentContractError("The request body must be an object.");
  if (!Array.isArray(value.events) || value.events.length === 0 || value.events.length > MAX_AGENT_EVENTS) {
    throw new BroadcastAgentContractError(`events must contain 1-${MAX_AGENT_EVENTS} entries.`);
  }

  return {
    outputKey: parseOutputKey(value.outputKey),
    agentId: parseAgentKey(value.agentId),
    events: value.events.map(parseEvent),
  };
}

export function broadcastAgentContractErrorResponse(error: BroadcastAgentContractError) {
  return Response.json(
    { ok: false, error: error.message },
    {
      status: error.status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
