import { asArray, asObject, firstDefined, parseDateMs } from "./util.mjs";

function durationMs(item) {
  const explicit = Number(firstDefined(item.durationMs, item.plannedDurationMs));
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const seconds = Number(firstDefined(item.durationSeconds, item.duration));
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  return null;
}

export function normalizeSnapshot(response, { receivedAtMs = Date.now(), useLocalTime = false } = {}) {
  const envelope = asObject(response);
  const source = asObject(firstDefined(envelope.snapshot, envelope.data, envelope));
  const output = asObject(firstDefined(source.output, source.outputConfig));
  const log = asObject(firstDefined(source.publishedLog, source.programLog, source.log));
  const rawItems = asArray(firstDefined(log.items, log.entries, source.items));
  const logStartMs = parseDateMs(firstDefined(log.startsAt, log.startAt));
  let cursorMs = logStartMs;

  const items = rawItems.map((raw, index) => {
    const item = asObject(raw);
    const media = asObject(item.media);
    const startMs = parseDateMs(firstDefined(item.plannedStartAt, item.startsAt, item.startAt, item.scheduledStartAt)) ?? cursorMs;
    const explicitEndMs = parseDateMs(firstDefined(item.plannedEndAt, item.endsAt, item.endAt, item.scheduledEndAt));
    const lengthMs = durationMs(item) ?? (explicitEndMs !== null && startMs !== null ? explicitEndMs - startMs : null);
    const endMs = explicitEndMs ?? (startMs !== null && lengthMs !== null ? startMs + lengthMs : null);
    if (endMs !== null) cursorMs = endMs;
    return Object.freeze({
      ...item,
      id: String(firstDefined(item.id, item.logItemId, `item-${index}`)),
      assetId: firstDefined(item.assetId, item.mediaAssetId, media.assetId) === undefined ? null : String(firstDefined(item.assetId, item.mediaAssetId, media.assetId)),
      mediaVersionId: firstDefined(item.mediaVersionId, media.versionId) === undefined ? null : String(firstDefined(item.mediaVersionId, media.versionId)),
      media,
      startMs,
      endMs,
      durationMs: lengthMs,
      overlayPolicy: normalizeOverlayPolicy(item)
    });
  }).filter((item) => item.startMs !== null && item.endMs !== null && item.endMs > item.startMs)
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));

  const serverTimeMs = useLocalTime
    ? receivedAtMs
    : parseDateMs(firstDefined(source.serverTime, envelope.serverTime, source.generatedAt)) ?? receivedAtMs;
  return Object.freeze({
    raw: source,
    output,
    log: Object.freeze({ ...log, id: String(firstDefined(log.id, log.logId, "unpublished")), items }),
    assets: collectMediaVersions(source, rawItems),
    graphics: {
      definitions: asArray(firstDefined(source.activeGraphics, source.graphics)),
      ticker: asArray(source.ticker),
      overlayConfig: asObject(output.overlayConfig),
      raw: firstDefined(source.activeGraphics, source.graphics, {})
    },
    liveSources: asArray(source.liveSources),
    versions: asObject(source.versions),
    serverTimeMs,
    receivedAtMs
  });
}

function normalizeOverlayPolicy(item) {
  const explicit = firstDefined(item.overlayPolicy, item.overlays);
  if (typeof explicit === "string" && explicit.trim()) {
    if (item.allowTicker === false && explicit === "all") return "no_ticker";
    return explicit;
  }
  const policy = { ...asObject(explicit) };
  if (item.allowTicker === false) policy.ticker = false;
  return Object.keys(policy).length ? policy : "all";
}

function collectMediaVersions(source, rawItems) {
  const explicit = [
    ...asArray(source.mediaVersions),
    ...asArray(source.assets),
    ...asArray(source.mediaAssets),
    ...asArray(source.ingestQueue)
  ];
  const nested = rawItems.map((item) => asObject(item).media).filter((media) => media && typeof media === "object" && Object.keys(media).length);
  const unique = new Map();
  for (const raw of [...explicit, ...nested]) {
    const media = asObject(raw);
    const versionId = firstDefined(media.versionId, media.mediaVersionId, media.id, media.assetId);
    if (versionId === undefined) continue;
    const normalized = {
      ...media,
      id: String(versionId),
      versionId: String(versionId),
      assetId: firstDefined(media.assetId, media.id) === undefined ? null : String(firstDefined(media.assetId, media.id)),
      downloadUrl: firstDefined(media.downloadUrl, media.storageUrl, media.playbackUrl, media.sourceUrl),
      fileName: firstDefined(media.fileName, media.filename, media.assetSlug && `${media.assetSlug}.mp4`)
    };
    unique.set(normalized.versionId, normalized);
  }
  return [...unique.values()];
}

export function normalizeCommands(response) {
  const envelope = asObject(response);
  const commands = asArray(firstDefined(envelope.commands, envelope.data)).map((raw) => {
    const command = asObject(raw);
    return Object.freeze({
      ...command,
      id: String(firstDefined(command.id, command.commandId, "")),
      type: String(firstDefined(command.type, command.command, "")),
      payload: asObject(command.payload)
    });
  }).filter((command) => command.id && command.type);
  const nextCursor = firstDefined(envelope.nextCursor, envelope.cursor, commands.at(-1)?.id);
  return { commands, nextCursor: nextCursor === undefined ? null : String(nextCursor) };
}

export function itemAt(items, nowMs) {
  return items.findLast((item) => item.startMs <= nowMs && nowMs < item.endMs) ?? null;
}

export function itemAfter(items, nowMs) {
  return items.find((item) => item.startMs > nowMs) ?? null;
}

export function snapshotVersion(snapshot) {
  return String(firstDefined(snapshot.versions.snapshot, snapshot.raw.version, snapshot.raw.updatedAt, snapshot.receivedAtMs));
}

export function logVersion(snapshot) {
  return String(firstDefined(snapshot.versions.log, snapshot.log.version, snapshot.log.publishedAt, snapshot.log.id));
}
