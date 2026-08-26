import http from "node:http";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { AmcpClient } from "./amcp.mjs";
import { ControlPlaneClient } from "./api-client.mjs";
import { normalizeCommands, normalizeSnapshot, logVersion, snapshotVersion } from "./contracts.mjs";
import { CommandJournal } from "./command-journal.mjs";
import { EventBuffer } from "./event-buffer.mjs";
import { GraphicsController } from "./graphics.mjs";
import { IngestRetryTracker } from "./ingest-retry.mjs";
import { LiveSourceMonitor } from "./live-source.mjs";
import { MediaCache } from "./media-cache.mjs";
import { PlayoutScheduler } from "./scheduler.mjs";
import { atomicWriteJson, durableUnlink, errorDetails, firstDefined, parseDateMs } from "./util.mjs";

const AGENT_VERSION = "0.1.0";

function controlRevision(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

function log(level, message, details = {}) {
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...details })}\n`);
}

export class BroadcastAgent {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.startedAtMs = Date.now();
    this.snapshot = null;
    this.lastSnapshotAtMs = null;
    this.lastControlPlaneAtMs = null;
    this.lastCommandCursor = null;
    this.reportedMedia = new Set();
    this.resolvedMedia = new Map();
    this.pendingIngestSnapshot = null;
    this.ingestRunning = null;
    this.stopping = false;
    this.timers = [];
    this.inflight = new Set();
    this.runningOperations = new Map();
    this.snapshotPollChain = Promise.resolve();
    this.outputStateChain = Promise.resolve();
    this.casparHadConnected = false;
    this.casparNeedsReconcile = false;
    this.casparStateDirty = false;
    this.casparApplyInProgress = false;
    this.casparDisconnectGeneration = 0;
    this.casparReconcileTask = null;
    this.casparReconcileRetryTimer = null;
    this.casparReconcileRetryMs = dependencies.casparReconcileRetryMs ?? 5000;
    this.graphicsStateDirty = false;
    this.graphicsRetryTimer = null;
    this.graphicsRetryMs = dependencies.graphicsRetryMs ?? 5000;
    this.liveFailoverTimer = null;
    this.liveFailoverSourceId = null;
    this.stopTask = null;
    this.outputOverride = null;
    this.latestOutputControlRevision = null;
    this.cursorFile = path.join(config.stateDir, "command-cursor.json");
    this.snapshotFile = path.join(config.stateDir, "last-good-snapshot.json");
    this.outputOverrideFile = path.join(config.stateDir, "output-override.json");

    this.api = dependencies.api ?? new ControlPlaneClient({
      baseUrl: config.baseUrl,
      secret: config.secret,
      outputKey: config.outputKey,
      agentId: config.agentId,
      timeoutMs: config.intervals.apiTimeoutMs
    });
    this.amcp = dependencies.amcp ?? new AmcpClient(config.caspar);
    this.mediaCache = dependencies.mediaCache ?? new MediaCache({
      directory: config.mediaDir,
      manifestFile: path.join(config.stateDir, "media-manifest.json"),
      maxFileBytes: config.mediaMaxFileBytes,
      maxCacheBytes: config.mediaCacheMaxBytes,
      downloadTimeoutMs: config.mediaIngest.downloadTimeoutMs
    });
    this.events = dependencies.events ?? new EventBuffer({
      filename: path.join(config.stateDir, "events.json"),
      send: (events) => this.api.events(events)
    });
    this.ingestRetries = dependencies.ingestRetries ?? new IngestRetryTracker({
      filename: path.join(config.stateDir, "media-ingest-retries.json"),
      maxAttempts: config.mediaIngest.maxAttempts,
      baseDelayMs: config.mediaIngest.retryBaseMs,
      maxDelayMs: config.mediaIngest.retryMaxMs
    });
    this.liveSources = dependencies.liveSources ?? new LiveSourceMonitor({
      eventBuffer: this.events,
      timeoutMs: config.intervals.liveSourceProbeTimeoutMs
    });
    this.commandJournal = dependencies.commandJournal ?? new CommandJournal({
      filename: path.join(config.stateDir, "handled-commands.json")
    });
    this.graphics = dependencies.graphics ?? new GraphicsController({
      amcp: this.amcp,
      channel: config.caspar.channel,
      layer: config.caspar.graphicsLayer,
      template: config.caspar.graphicsTemplate
    });
    this.scheduler = dependencies.scheduler ?? new PlayoutScheduler({
      amcp: this.amcp,
      channel: config.caspar.channel,
      layer: config.caspar.programLayer,
      fps: config.caspar.fps,
      fallbackClip: config.caspar.fallbackClip,
      preloadLeadMs: config.intervals.preloadLeadMs,
      eventBuffer: this.events,
      graphics: this.graphics
    });
    this.amcp.on("connect", () => {
      log("info", "caspar_connected", { host: config.caspar.host, port: config.caspar.port });
      this.casparHadConnected = true;
      if (!this.casparApplyInProgress) this.#requestCasparReconcile();
    });
    this.amcp.on("disconnect", () => {
      log("warning", "caspar_disconnected");
      this.casparDisconnectGeneration += 1;
      if (this.casparHadConnected) this.casparNeedsReconcile = true;
      if (this.snapshot) this.casparStateDirty = true;
      void this.scheduler.handleCasparDisconnect?.();
    });
    this.amcp.on("socket-error", (error) => log("warning", "caspar_socket_error", { error: error.message }));
  }

  #requestCasparReconcile() {
    if (this.casparReconcileTask || this.casparApplyInProgress || this.stopping || !this.snapshot) return;
    if (!this.casparNeedsReconcile && !this.casparStateDirty) return;
    const generation = this.casparDisconnectGeneration;
    const task = this.#safe("caspar_reconcile", async () => {
      const reconciled = await this.scheduler.reconcileAfterReconnect?.(
        () => !this.casparApplyInProgress && (this.casparNeedsReconcile || this.casparStateDirty)
      );
      if (reconciled && generation === this.casparDisconnectGeneration) {
        this.casparNeedsReconcile = false;
        this.casparStateDirty = false;
        this.#recordGraphicsConfirmation(this.scheduler.graphicsOperationConfirmed !== false);
      }
      return reconciled;
    }).finally(() => {
      this.casparReconcileTask = null;
      if (generation !== this.casparDisconnectGeneration && this.amcp.connected) {
        this.#requestCasparReconcile();
      } else if ((this.casparNeedsReconcile || this.casparStateDirty) && this.amcp.connected) {
        this.#scheduleCasparReconcile();
      }
    });
    this.casparReconcileTask = task;
  }

  #scheduleCasparReconcile() {
    if (this.casparReconcileRetryTimer || this.stopping || !this.amcp.connected) return;
    const timer = setTimeout(() => {
      this.casparReconcileRetryTimer = null;
      this.#requestCasparReconcile();
    }, this.casparReconcileRetryMs);
    timer.unref();
    this.casparReconcileRetryTimer = timer;
  }

  #recordGraphicsConfirmation(confirmed) {
    this.graphicsStateDirty = !confirmed;
    if (confirmed) {
      if (this.graphicsRetryTimer) clearTimeout(this.graphicsRetryTimer);
      this.graphicsRetryTimer = null;
      return;
    }
    this.#scheduleGraphicsRetry();
  }

  #scheduleGraphicsRetry() {
    if (this.graphicsRetryTimer || this.stopping || !this.snapshot) return;
    const timer = setTimeout(() => {
      this.graphicsRetryTimer = null;
      const task = this.#safe("graphics_retry", async () => {
        try {
          const schedulerManaged = typeof this.scheduler.retryGraphics === "function";
          if (schedulerManaged) {
            await this.scheduler.retryGraphics();
          } else {
            await this.graphics.sync({ force: true });
          }
          const confirmed = schedulerManaged && typeof this.scheduler.graphicsOperationConfirmed === "boolean"
            ? this.scheduler.graphicsOperationConfirmed
            : true;
          this.#recordGraphicsConfirmation(confirmed);
        } catch (error) {
          // A graphics-only failure must stay retryable without forcing a
          // program reconciliation that could undo a live/manual take.
          this.#recordGraphicsConfirmation(false);
          throw error;
        }
      }).finally(() => this.inflight.delete(task));
      this.inflight.add(task);
    }, this.graphicsRetryMs);
    timer.unref();
    this.graphicsRetryTimer = timer;
  }

  async #syncGraphicsOnly(options, context) {
    try {
      const result = typeof this.scheduler.syncGraphics === "function"
        ? await this.scheduler.syncGraphics(options, context)
        : await this.graphics.sync(options);
      const confirmed = typeof this.scheduler.graphicsOperationConfirmed === "boolean"
        ? this.scheduler.graphicsOperationConfirmed
        : true;
      this.#recordGraphicsConfirmation(confirmed);
      return confirmed;
    } catch (error) {
      this.#recordGraphicsConfirmation(false);
      this.events.add("error", {
        code: "GRAPHICS_SYNC_FAILED",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
        context
      });
      return false;
    }
  }

  async start() {
    await mkdir(this.config.stateDir, { recursive: true });
    await Promise.all([
      this.mediaCache.initialize(),
      this.events.initialize(),
      this.ingestRetries.initialize(),
      this.commandJournal.initialize(),
      this.#loadCursor(),
      this.#loadOutputOverride()
    ]);
    this.healthServer = this.#startHealthServer();

    await this.#safe("initial_snapshot", () => this.pollSnapshot());
    if (!this.snapshot) await this.#safe("cached_snapshot_restore", () => this.restoreCachedSnapshot());
    await this.#safe("initial_live_source_probe", () => this.probeLiveSources());
    await this.#safe("initial_heartbeat", () => this.heartbeat());
    await this.#safe("initial_event_flush", () => this.events.flush());
    await this.#safe("initial_commands", () => this.pollCommands());

    this.#every(this.config.intervals.snapshotMs, "snapshot_poll", () => this.pollSnapshot());
    this.#every(this.config.intervals.commandMs, "command_poll", () => this.pollCommands());
    this.#every(this.config.intervals.scheduleTickMs, "schedule_tick", () => this.tickSchedule(), false);
    this.#every(this.config.intervals.heartbeatMs, "heartbeat", () => this.heartbeat());
    this.#every(this.config.intervals.eventFlushMs, "event_flush", () => this.events.flush(), false);
    this.#every(this.config.intervals.graphicsClockSyncMs, "graphics_clock_sync", () => this.syncGraphicsClock());
    this.#every(this.config.intervals.liveSourceProbeMs, "live_source_probe", () => this.probeLiveSources(), false);
    this.#every(this.config.intervals.mediaIngestRetryMs, "media_ingest_retry", () => this.retryMediaIngest(), false);
    log("info", "broadcast_agent_started", { agentId: this.config.agentId, outputKey: this.config.outputKey, version: AGENT_VERSION });
  }

  #every(milliseconds, label, operation, reportErrors = true) {
    const timer = setInterval(() => {
      if (this.stopping || this.runningOperations.has(label)) return;
      const task = this.#safe(label, operation, reportErrors).finally(() => {
        this.inflight.delete(task);
        this.runningOperations.delete(label);
      });
      this.inflight.add(task);
      this.runningOperations.set(label, task);
    }, milliseconds);
    timer.unref();
    this.timers.push(timer);
  }

  async #safe(label, operation, reportErrors = true) {
    try {
      return await operation();
    } catch (error) {
      log("error", label, { error: errorDetails(error) });
      if (reportErrors) this.events.add("error", {
        code: String(error?.code ?? label.toUpperCase()),
        message: error instanceof Error ? error.message : String(error),
        retryable: error?.retryable !== false,
        context: label
      });
      return null;
    }
  }

  pollSnapshot({ force = false } = {}) {
    const task = this.snapshotPollChain.then(
      () => this.#pollSnapshot(force),
      () => this.#pollSnapshot(force)
    );
    this.snapshotPollChain = task.catch(() => undefined);
    return task;
  }

  async #pollSnapshot(force) {
    if (force) this.api.snapshotEtag = null;
    const body = await this.api.snapshot();
    if (this.stopping) return;
    this.lastControlPlaneAtMs = Date.now();
    if (!body) {
      if (this.snapshot) this.lastSnapshotAtMs = Date.now();
      this.retryMediaIngest();
      if (this.casparStateDirty && this.amcp.connected) this.#requestCasparReconcile();
      return;
    }
    try {
      await this.#applySnapshot(body, { persist: true });
    } catch (error) {
      // ControlPlaneClient receives the ETag before application. Force a full
      // body next poll if normalization, persistence, or AMCP application fails.
      this.api.snapshotEtag = null;
      throw error;
    }
  }

  #applySnapshot(body, options = {}) {
    const task = this.outputStateChain.then(
      () => this.#applySnapshotUnlocked(body, options),
      () => this.#applySnapshotUnlocked(body, options)
    );
    this.outputStateChain = task.catch(() => undefined);
    return task;
  }

  async #applySnapshotUnlocked(body, { persist = false, cached = false } = {}) {
    if (this.stopping) return false;
    let snapshot = normalizeSnapshot(body, { useLocalTime: cached });
    let confirmedOverride = null;
    const incomingControlRevision = controlRevision(snapshot.output.controlRevision);
    const isOlderOutputRevision = !cached &&
      incomingControlRevision !== null &&
      this.latestOutputControlRevision !== null &&
      incomingControlRevision < this.latestOutputControlRevision;
    if (isOlderOutputRevision && this.snapshot) {
      // Preserve the complete accepted output/control configuration. The same
      // delayed snapshot may still carry useful newer log/media/source data.
      snapshot = Object.freeze({ ...snapshot, output: this.snapshot.output });
    }
    if (this.outputOverride) {
      const barrierRevision = controlRevision(this.outputOverride.desiredControlRevision);
      const confirmsOrSupersedes = !isOlderOutputRevision &&
        incomingControlRevision !== null &&
        barrierRevision !== null &&
        incomingControlRevision >= barrierRevision;
      if (confirmsOrSupersedes) {
        // Persist the authoritative snapshot before removing the durable
        // command barrier. A crash between those operations must leave either
        // the override or a cache containing the confirming control revision.
        confirmedOverride = this.outputOverride;
      } else {
        snapshot = Object.freeze({
          ...snapshot,
          output: {
            ...snapshot.output,
            enabled: this.outputOverride.enabled,
            alwaysOn: this.outputOverride.alwaysOn
          }
        });
      }
    }
    const disconnectGeneration = this.casparDisconnectGeneration;
    this.casparStateDirty = true;
    this.casparApplyInProgress = true;
    try {
      // Keep reconnect reconciliation paused for the entire scheduler
      // transaction, including durable persistence/update.
      if (persist) {
        const effectiveBody = { ...snapshot.raw, output: snapshot.output };
        await atomicWriteJson(this.snapshotFile, { version: 1, savedAt: new Date().toISOString(), body: effectiveBody });
      }
      if (confirmedOverride) await this.#clearOutputOverride(confirmedOverride);
      if (incomingControlRevision !== null) {
        this.latestOutputControlRevision = Math.max(this.latestOutputControlRevision ?? incomingControlRevision, incomingControlRevision);
      }
      const referencedVersions = this.#referencedVersions(snapshot);
      for (const [key, result] of this.resolvedMedia) {
        if (!referencedVersions.has(String(result.mediaVersionId))) this.resolvedMedia.delete(key);
      }
      this.snapshot = snapshot;
      this.lastSnapshotAtMs = cached ? null : Date.now();
      this.graphics.setSnapshot(snapshot.graphics, snapshot.serverTimeMs, snapshot.receivedAtMs);
      this.liveSources.update(snapshot.liveSources);
      this.mediaCache.setProtectedAssets?.(snapshot.assets, { abortUnprotected: true });
      await this.scheduler.update(snapshot, new Map(this.resolvedMedia));
      // Begin ingest only after this exact log/config is durable and installed
      // in the scheduler, but still before any fallible AMCP operation.
      this.#queueIngest(snapshot);
      await this.scheduler.applyOutputEnabled(snapshot.output.enabled !== false);
      if (snapshot.output.enabled !== false) {
        // Put fallback/standby on air before remote media ingest completes.
        await this.scheduler.tick();
        this.#recordGraphicsConfirmation(this.scheduler.graphicsOperationConfirmed !== false);
        if (this.#graphicsMayBeOn()) await this.#syncGraphicsOnly({}, "snapshot_graphics");
      } else {
        this.#recordGraphicsConfirmation(this.scheduler.graphicsOperationConfirmed !== false);
      }
      if (disconnectGeneration === this.casparDisconnectGeneration) {
        this.casparStateDirty = false;
        this.casparNeedsReconcile = false;
      }
    } finally {
      this.casparApplyInProgress = false;
      if (this.casparStateDirty && this.amcp.connected) this.#requestCasparReconcile();
    }
    log("info", "snapshot_applied", {
      snapshotVersion: snapshotVersion(snapshot),
      logVersion: logVersion(snapshot),
      items: snapshot.log.items.length,
      cachedMedia: this.resolvedMedia.size,
      source: cached ? "cache" : "control_plane"
    });
  }

  #queueIngest(snapshot) {
    this.pendingIngestSnapshot = snapshot;
    if (this.ingestRunning) return;
    const task = this.#safe("media_ingest", () => this.#drainIngest()).finally(() => {
      this.inflight.delete(task);
      this.ingestRunning = null;
      if (this.pendingIngestSnapshot && !this.stopping) this.#queueIngest(this.pendingIngestSnapshot);
    });
    this.ingestRunning = task;
    this.inflight.add(task);
  }

  async #drainIngest() {
    while (this.pendingIngestSnapshot && !this.stopping) {
      const snapshot = this.pendingIngestSnapshot;
      this.pendingIngestSnapshot = null;
      await this.#ingestSnapshot(snapshot);
    }
  }

  async #ingestSnapshot(snapshot) {
    const eligibleAssets = snapshot.assets.filter((asset) => {
      const id = String(asset.versionId ?? asset.mediaVersionId ?? asset.id ?? "");
      return !this.resolvedMedia.has(id) && this.ingestRetries.shouldAttempt(asset);
    });
    const { resolved, failures } = await this.mediaCache.resolveAll(eligibleAssets, 3, snapshot.assets);
    if (this.stopping) return;
    const currentVersions = this.snapshot ? this.#referencedVersions(this.snapshot) : new Set();
    for (const result of resolved.values()) {
      if (!currentVersions.has(String(result.mediaVersionId))) {
        this.ingestRetries.forget?.(result.mediaVersionId);
        continue;
      }
      this.ingestRetries.succeeded(result.mediaVersionId);
      this.resolvedMedia.set(result.mediaVersionId, result);
      if (result.assetId) this.resolvedMedia.set(result.assetId, result);
      const reportKey = `${result.mediaVersionId}:${result.sha256 ?? result.clipName}`;
      if (result.validated && !this.reportedMedia.has(reportKey)) {
        this.reportedMedia.add(reportKey);
        this.events.add("media_ready", {
          mediaVersionId: result.mediaVersionId,
          assetId: result.assetId,
          durationMs: result.probe?.durationMs ?? null,
          width: result.probe?.width ?? null,
          height: result.probe?.height ?? null,
          mimeType: result.probe?.mimeType ?? null,
          videoCodec: result.probe?.videoCodec ?? null,
          audioCodec: result.probe?.audioCodec ?? null,
          sha256: result.sha256 ?? null,
          casparClipName: result.clipName
        });
      }
    }
    for (const failure of failures) {
      if (!currentVersions.has(String(failure.mediaVersionId))) continue;
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
      const retry = this.ingestRetries.failed(failure);
      this.events.add("media_failed", {
        mediaVersionId: failure.mediaVersionId,
        assetId: failure.assetId,
        error: message,
        retryable: retry.retryable,
        technicalMetadata: {
          attempt: retry.attempt,
          maxAttempts: retry.maxAttempts,
          nextAttemptAt: retry.nextAttemptAt
        }
      });
    }
    await this.ingestRetries.persist();
    const latestVersions = this.snapshot ? this.#referencedVersions(this.snapshot) : new Set();
    for (const [key, result] of this.resolvedMedia) {
      if (!latestVersions.has(String(result.mediaVersionId))) this.resolvedMedia.delete(key);
    }
    await this.#withOutputState(async () => {
      if (this.stopping || !this.snapshot) return;
      await this.scheduler.update(this.snapshot, new Map(this.resolvedMedia));
      if (this.snapshot.output.enabled !== false) {
        await this.scheduler.tick();
        this.#recordGraphicsConfirmation(this.scheduler.graphicsOperationConfirmed !== false);
      }
    });
    log("info", "media_ingest_completed", {
      snapshotVersion: snapshotVersion(snapshot),
      mediaReady: resolved.size,
      mediaFailed: failures.length,
      mediaDeferred: snapshot.assets.length - eligibleAssets.length
    });
  }

  #referencedVersions(snapshot) {
    return new Set(snapshot.assets.map((asset) => String(asset.versionId ?? asset.mediaVersionId ?? asset.id ?? "")));
  }

  #graphicsMayBeOn() {
    const mode = this.scheduler.status().mode;
    return this.snapshot?.output.enabled !== false && !new Set(["disabled", "standby"]).has(mode);
  }

  syncGraphicsClock() {
    if (this.casparApplyInProgress || !this.#graphicsMayBeOn()) return false;
    return this.#syncGraphicsOnly({ clockOnly: true }, "graphics_clock");
  }

  retryMediaIngest() {
    if (!this.snapshot || this.stopping) return false;
    const due = this.snapshot.assets.some((asset) => {
      const id = String(asset.versionId ?? asset.mediaVersionId ?? asset.id ?? "");
      return !this.resolvedMedia.has(id) && this.ingestRetries.shouldAttempt(asset);
    });
    if (!due) return false;
    this.#queueIngest(this.snapshot);
    return true;
  }

  async restoreCachedSnapshot() {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(this.snapshotFile, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
    if (parsed?.version !== 1 || !parsed.body || typeof parsed.body !== "object") throw new Error("Cached snapshot is invalid");
    await this.#applySnapshot(parsed.body, { cached: true });
    log("warning", "cached_snapshot_restored", { savedAt: parsed.savedAt ?? null });
    return true;
  }

  async probeLiveSources() {
    const activeSourceId = this.scheduler.status().mode === "live" ? this.scheduler.status().current?.sourceId : null;
    await this.liveSources.probeAll({
      activeSourceId,
      outputEnabled: this.snapshot?.output.enabled !== false
    });
    if (this.stopping) return;
    const current = this.scheduler.status();
    const currentSourceId = current.mode === "live" ? String(current.current?.sourceId ?? "") : "";
    if (!currentSourceId || currentSourceId !== String(activeSourceId ?? "")) {
      this.#clearLiveFailoverTimer();
      return;
    }
    const status = this.liveSources.statusFor?.(currentSourceId);
    if (new Set(["offline", "error", "disabled"]).has(status)) {
      this.#scheduleLiveFailover(currentSourceId);
    } else {
      this.#clearLiveFailoverTimer();
    }
  }

  #scheduleLiveFailover(sourceId) {
    if (this.liveFailoverTimer && this.liveFailoverSourceId === sourceId) return;
    this.#clearLiveFailoverTimer();
    const source = this.snapshot?.liveSources.find((candidate) => String(candidate.id) === sourceId);
    const requestedMs = Number(firstDefined(source?.reconnectTimeoutSeconds, source?.input?.reconnectTimeoutSeconds, 10)) * 1000;
    const delayMs = Number.isFinite(requestedMs) ? Math.max(10, Math.min(requestedMs, 300_000)) : 10_000;
    const timer = setTimeout(() => {
      this.liveFailoverTimer = null;
      this.liveFailoverSourceId = null;
      const task = this.#safe("live_source_watchdog", () => this.#failoverLostLiveSource(sourceId)).finally(() => {
        this.inflight.delete(task);
      });
      this.inflight.add(task);
    }, delayMs);
    timer.unref();
    this.liveFailoverTimer = timer;
    this.liveFailoverSourceId = sourceId;
  }

  #clearLiveFailoverTimer() {
    if (this.liveFailoverTimer) clearTimeout(this.liveFailoverTimer);
    this.liveFailoverTimer = null;
    this.liveFailoverSourceId = null;
  }

  async #failoverLostLiveSource(sourceId) {
    if (this.stopping) return false;
    const current = this.scheduler.status();
    if (current.mode !== "live" || String(current.current?.sourceId ?? "") !== sourceId) return false;
    await this.liveSources.probeAll({
      activeSourceId: sourceId,
      outputEnabled: this.snapshot?.output.enabled !== false
    });
    if (this.liveSources.statusFor?.(sourceId) === "live") return false;
    const returned = typeof this.scheduler.returnLiveSourceToAutomation === "function"
      ? await this.scheduler.returnLiveSourceToAutomation(sourceId, "live_signal_timeout")
      : await this.scheduler.returnToAutomation("live_signal_timeout");
    if (!returned) return false;
    this.liveSources.setActiveSource?.(null);
    const source = this.snapshot?.liveSources.find((candidate) => String(candidate.id) === sourceId);
    this.events.add("error", {
      code: "LIVE_SOURCE_SIGNAL_LOST",
      message: `Live source ${source?.label ?? source?.name ?? sourceId} did not recover before its reconnect timeout; automation resumed`,
      retryable: true,
      sourceId,
      failoverAssetId: source?.failoverAssetId ?? null,
      context: "live_source_watchdog"
    });
    return true;
  }

  async tickSchedule() {
    try {
      const result = await this.scheduler.tick();
      this.#recordGraphicsConfirmation(this.scheduler.graphicsOperationConfirmed !== false);
      return result;
    } catch (error) {
      const wasDirty = this.casparStateDirty;
      this.casparStateDirty = true;
      if (!wasDirty) {
        this.events.add("error", {
          code: "SCHEDULE_PLAYOUT_FAILED",
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          context: "schedule_tick"
        });
      }
      this.#requestCasparReconcile();
      return false;
    }
  }

  async pollCommands() {
    if (this.stopping) return;
    // An acknowledgement persisted before a crash must reach the control plane
    // before that command is polled again.
    while (this.events.hasType?.("command_ack")) {
      const before = this.events.size;
      await this.events.flush();
      if (this.events.size >= before) return;
    }
    const body = await this.api.commands(this.lastCommandCursor);
    this.lastControlPlaneAtMs = Date.now();
    const { commands } = normalizeCommands(body);
    for (const command of commands) {
      if (this.stopping) break;
      const handled = this.commandJournal.find(command);
      if (handled) {
        let recovered = handled;
        if (handled.status === "running") {
          recovered = await this.commandJournal.record(
            command,
            "failed",
            "Previous execution outcome is unknown after agent restart; the command was not replayed. The operator may retry with a new action."
          );
        }
        this.#ack(command, recovered.status, recovered.message);
        this.lastCommandCursor = command.id;
        await this.events.persist();
        await atomicWriteJson(this.cursorFile, { version: 1, after: this.lastCommandCursor, updatedAt: new Date().toISOString() });
        continue;
      }
      const now = Date.now();
      const notBefore = parseDateMs(command.notBefore);
      if (notBefore && notBefore > now) break;
      const expiresAt = parseDateMs(command.expiresAt);
      if (expiresAt && expiresAt <= now) {
        const message = "Command expired before delivery";
        await this.commandJournal.record(command, "ignored", message);
        this.#ack(command, "ignored", message);
      } else {
        await this.commandJournal.record(command, "running", "Command execution started");
        try {
          const result = await this.#executeCommand(command);
          const status = result && typeof result === "object" && result.status === "ignored" ? "ignored" : "completed";
          const message = result && typeof result === "object" ? result.message : result;
          await this.commandJournal.record(command, status, message);
          this.#ack(command, status, message);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.commandJournal.record(command, "failed", message);
          this.#ack(command, "failed", message);
        }
      }
      this.lastCommandCursor = command.id;
      await this.events.persist();
      await atomicWriteJson(this.cursorFile, { version: 1, after: this.lastCommandCursor, updatedAt: new Date().toISOString() });
    }
  }

  #executeCommand(command) {
    if (this.stopping) throw new Error("Broadcast agent is shutting down");
    const type = command.type.trim().toLowerCase().replaceAll("-", "_");
    // Refresh polls already serialize through snapshotPollChain and then
    // outputStateChain. Running one while holding outputStateChain would
    // deadlock when the response is applied.
    if (type === "refresh_snapshot") return this.#refreshSnapshotCommand();
    const mutatesProgram = new Set([
      "take_live", "remove_live", "return_to_automation", "resume_automation",
      "take_item", "skip", "start_output", "stop_output"
    ]).has(type);
    return this.#withOutputState(() => mutatesProgram
      ? this.#executeProgramCommand(command, type)
      : this.#executeCommandUnlocked(command, type));
  }

  async #executeProgramCommand(command, type) {
    const pendingReconcile = this.casparReconcileTask;
    const disconnectGeneration = this.casparDisconnectGeneration;
    const inheritedDirtyState = this.casparStateDirty || this.casparNeedsReconcile;
    this.casparApplyInProgress = true;
    try {
      if (pendingReconcile) await pendingReconcile;
      const result = await this.#executeCommandUnlocked(command, type);
      const confirmsProgram = !new Set(["remove_live", "return_to_automation", "resume_automation"]).has(type) || result === "Automation resumed";
      const graphicsConfirmed = this.scheduler.graphicsOperationConfirmed !== false;
      this.#recordGraphicsConfirmation(graphicsConfirmed);
      if (
        disconnectGeneration === this.casparDisconnectGeneration &&
        (!inheritedDirtyState || confirmsProgram)
      ) {
        this.casparStateDirty = false;
        this.casparNeedsReconcile = false;
      }
      return result;
    } finally {
      this.casparApplyInProgress = false;
      if (this.casparStateDirty && this.amcp.connected) this.#requestCasparReconcile();
    }
  }

  async #refreshSnapshotCommand() {
    await this.pollSnapshot({ force: true });
    return "Snapshot refreshed";
  }

  async #executeCommandUnlocked(command, type) {
    if (this.stopping) throw new Error("Broadcast agent is shutting down");
    if (type === "take_live") {
      if (!this.snapshot) throw new Error("Cannot take live before a snapshot has loaded");
      const sourceId = String(firstDefined(command.payload.sourceId, command.payload.liveSourceId, command.liveSourceId, ""));
      const source = this.snapshot.liveSources.find((candidate) => String(candidate.id) === sourceId);
      if (!source) throw new Error(`Unknown or disabled live source: ${sourceId}`);
      if (source.enabled === false || source.status === "disabled") throw new Error(`Live source is disabled: ${sourceId}`);
      const hasMonitorStatus = typeof this.liveSources.statusFor === "function";
      const readiness = hasMonitorStatus ? this.liveSources.statusFor(sourceId) : source.status;
      if (!new Set(["ready", "live"]).has(readiness)) {
        throw new Error(`Live source is not ready for program: ${sourceId} (${readiness ?? "unprobed"})`);
      }
      const priorPlayout = this.scheduler.status();
      const priorActiveSourceId = priorPlayout.mode === "live" ? priorPlayout.current?.sourceId ?? null : null;
      this.liveSources.setActiveSource?.(sourceId);
      try {
        await this.scheduler.takeLive(source);
      } catch (error) {
        this.liveSources.setActiveSource?.(priorActiveSourceId);
        throw error;
      }
      return `Live source ${sourceId} is on program`;
    }
    if (type === "remove_live") {
      const requestedSourceId = String(firstDefined(command.payload.liveSourceId, command.payload.sourceId, command.liveSourceId, ""));
      if (!requestedSourceId) throw new Error("remove_live requires a liveSourceId");
      const playout = this.scheduler.status();
      const currentSourceId = playout.mode === "live" ? String(playout.current?.sourceId ?? "") : "";
      if (currentSourceId !== requestedSourceId) {
        throw new Error(`Live source ${requestedSourceId} is not currently on program`);
      }
      const returned = await this.scheduler.returnToAutomation("control_room_command");
      if (returned) this.liveSources.setActiveSource?.(null);
      return returned ? "Automation resumed" : "Automation was already active";
    }
    if (type === "return_to_automation" || type === "resume_automation") {
      const returned = await this.scheduler.returnToAutomation("control_room_command");
      if (returned) this.liveSources.setActiveSource?.(null);
      return returned ? "Automation resumed" : "Automation was already active";
    }
    if (type === "reload_graphics" || type === "refresh_graphics") {
      if (!this.#graphicsMayBeOn()) return "Output is disabled or in standby; graphics remain off";
      const confirmed = await this.#syncGraphicsOnly({ force: true }, "operator_graphics_refresh");
      if (!confirmed) throw new Error("Graphics refresh remains unconfirmed; the agent will retry it without changing program video");
      return "Graphics reloaded";
    }
    if (type === "take_item") {
      const programItemId = String(firstDefined(command.payload.programItemId, command.programItemId, ""));
      await this.scheduler.takeItem(programItemId);
      this.liveSources.setActiveSource?.(null);
      return `Program item ${programItemId} taken`;
    }
    if (type === "skip") {
      const next = await this.scheduler.skip();
      this.liveSources.setActiveSource?.(null);
      return next ? `Skipped to program item ${next}` : "No later item; fallback is on air";
    }
    if (type === "start_output") {
      const intent = this.#outputCommandIntent(command, true);
      if (this.#outputCommandIsStale(intent)) return { status: "ignored", message: "Ignored stale Start Output command" };
      await this.#setOutputOverride(true, intent.alwaysOn, command.id, intent.desiredControlRevision);
      if (this.stopping) throw new Error("Broadcast agent is shutting down");
      try {
        await this.scheduler.startOutput();
      } catch (error) {
        this.casparStateDirty = true;
        this.#requestCasparReconcile();
        throw error;
      }
      this.api.snapshotEtag = null;
      return "Output started";
    }
    if (type === "stop_output") {
      const intent = this.#outputCommandIntent(command, false);
      if (this.#outputCommandIsStale(intent)) return { status: "ignored", message: "Ignored stale Stop Output command" };
      await this.#setOutputOverride(false, intent.alwaysOn, command.id, intent.desiredControlRevision);
      if (this.stopping) throw new Error("Broadcast agent is shutting down");
      try {
        await this.scheduler.stopOutput();
      } catch (error) {
        this.casparStateDirty = true;
        this.#requestCasparReconcile();
        throw error;
      }
      this.liveSources.setActiveSource?.(null);
      this.api.snapshotEtag = null;
      return "Output stopped";
    }
    throw new Error(`Unsupported command type: ${command.type}`);
  }

  #ack(command, status, message) {
    this.events.add("command_ack", {
      commandId: command.id,
      idempotencyKey: command.idempotencyKey ?? null,
      status,
      message
    });
  }

  async heartbeat() {
    let casparVersion = null;
    try {
      const response = await this.amcp.send("VERSION SERVER");
      casparVersion = response.lines?.[0] ?? response.message ?? null;
    } catch (error) {
      this.events.add("error", { code: "CASPAR_UNREACHABLE", message: error.message, retryable: true, context: "heartbeat" });
    }
    const health = this.health();
    this.events.add("heartbeat", {
      status: health.status,
      outputStatus: health.desiredStateApplied ? health.playout.mode : "degraded",
      errorMessage: health.desiredStateApplied ? null : "Desired CasparCG program/graphics state is not yet confirmed",
      casparConnected: this.amcp.connected,
      casparVersion,
      snapshotVersion: this.snapshot ? snapshotVersion(this.snapshot) : null,
      logVersion: this.snapshot ? logVersion(this.snapshot) : null,
      currentProgramItemId: this.scheduler.status().current?.itemId ?? null,
      liveSourceId: this.scheduler.status().current?.sourceId ?? null,
      lastSnapshotAt: this.lastSnapshotAtMs ? new Date(this.lastSnapshotAtMs).toISOString() : null,
      mediaCache: this.mediaCache.stats(),
      eventBacklog: this.events.size,
      eventQuarantine: this.events.quarantinedSize ?? 0,
      uptimeSeconds: Math.floor((Date.now() - this.startedAtMs) / 1000),
      agentVersion: AGENT_VERSION
    });
  }

  health() {
    const snapshotAgeMs = this.lastSnapshotAtMs ? Date.now() - this.lastSnapshotAtMs : null;
    const snapshotFresh = snapshotAgeMs !== null && snapshotAgeMs < this.config.intervals.snapshotMs * 4;
    const playout = this.scheduler.status();
    const needsClearConfirmation = new Set(["disabled", "standby"]).has(playout.mode);
    const clearConfirmed = !needsClearConfirmation || (
      this.scheduler.programClearConfirmed === true && this.scheduler.graphicsClearConfirmed === true
    );
    const desiredStateApplied = !this.casparStateDirty &&
      !this.casparNeedsReconcile &&
      !this.casparApplyInProgress &&
      !this.graphicsStateDirty &&
      playout.mode !== "starting" &&
      clearConfirmed;
    const status = this.amcp.connected && snapshotFresh && desiredStateApplied
      ? "healthy"
      : this.snapshot ? "degraded" : "starting";
    return {
      status,
      agentId: this.config.agentId,
      outputKey: this.config.outputKey,
      casparConnected: this.amcp.connected,
      snapshotAgeMs,
      controlPlaneAgeMs: this.lastControlPlaneAtMs ? Date.now() - this.lastControlPlaneAtMs : null,
      desiredStateApplied,
      playout,
      eventBacklog: this.events.size,
      eventQuarantine: this.events.quarantinedSize ?? 0,
      mediaCache: this.mediaCache.stats(),
      version: AGENT_VERSION
    };
  }

  #startHealthServer() {
    const server = http.createServer((request, response) => {
      if (request.method !== "GET" || !new Set(["/healthz", "/readyz"]).has(request.url)) {
        response.writeHead(404).end();
        return;
      }
      const health = this.health();
      const ready = health.status === "healthy";
      response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(health));
    });
    server.listen(this.config.health.port, this.config.health.host, () => {
      log("info", "health_server_listening", this.config.health);
    });
    return server;
  }

  async #loadCursor() {
    try {
      const parsed = JSON.parse(await readFile(this.cursorFile, "utf8"));
      this.lastCommandCursor = typeof parsed.after === "string" ? parsed.after : null;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async #loadOutputOverride() {
    try {
      const parsed = JSON.parse(await readFile(this.outputOverrideFile, "utf8"));
      if (parsed?.version !== 1 || typeof parsed.enabled !== "boolean" || typeof parsed.alwaysOn !== "boolean") {
        throw new Error("Output override state is invalid");
      }
      if (controlRevision(parsed.desiredControlRevision) === null) throw new Error("Output override state has no valid control-revision barrier");
      this.outputOverride = {
        enabled: parsed.enabled,
        alwaysOn: parsed.alwaysOn,
        commandId: parsed.commandId ?? null,
        desiredControlRevision: parsed.desiredControlRevision,
        setAt: parsed.setAt ?? null
      };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  #outputCommandIntent(command, enabled) {
    const payloadEnabled = command.payload.desiredEnabled;
    if (payloadEnabled !== undefined && payloadEnabled !== enabled) throw new Error("Output command desiredEnabled does not match its command type");
    if (typeof command.payload.desiredAlwaysOn !== "boolean") {
      throw new Error("Output command is missing desiredAlwaysOn");
    }
    const desiredControlRevision = controlRevision(firstDefined(command.payload.desiredControlRevision, command.desiredControlRevision));
    if (desiredControlRevision === null) throw new Error("Output command is missing a valid desiredControlRevision barrier");
    return { enabled, alwaysOn: command.payload.desiredAlwaysOn, desiredControlRevision };
  }

  #outputCommandIsStale(intent) {
    const overrideRevision = controlRevision(this.outputOverride?.desiredControlRevision);
    const floorRevision = Math.max(this.latestOutputControlRevision ?? -Infinity, overrideRevision ?? -Infinity);
    return intent.desiredControlRevision <= floorRevision;
  }

  async #setOutputOverride(enabled, alwaysOn, commandId, desiredControlRevision) {
    const override = {
      enabled,
      alwaysOn,
      commandId: commandId ?? null,
      desiredControlRevision,
      setAt: new Date().toISOString()
    };
    await atomicWriteJson(this.outputOverrideFile, { version: 1, ...override });
    this.outputOverride = override;
    if (this.snapshot) {
      this.snapshot = Object.freeze({
        ...this.snapshot,
        output: { ...this.snapshot.output, enabled, alwaysOn }
      });
      await this.scheduler.update?.(this.snapshot, new Map(this.resolvedMedia));
    }
  }

  #withOutputState(operation) {
    const task = this.outputStateChain.then(operation, operation);
    this.outputStateChain = task.catch(() => undefined);
    return task;
  }

  async #clearOutputOverride(expectedOverride) {
    if (this.outputOverride !== expectedOverride) return false;
    try {
      await durableUnlink(this.outputOverrideFile);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (this.outputOverride !== expectedOverride) return false;
    this.outputOverride = null;
    return true;
  }

  stop(signal = "SIGTERM") {
    if (this.stopTask) return this.stopTask;
    this.stopping = true;
    this.stopTask = this.#finishStop(signal);
    return this.stopTask;
  }

  async #finishStop(signal) {
    for (const timer of this.timers) clearTimeout(timer);
    if (this.casparReconcileRetryTimer) clearTimeout(this.casparReconcileRetryTimer);
    this.casparReconcileRetryTimer = null;
    if (this.graphicsRetryTimer) clearTimeout(this.graphicsRetryTimer);
    this.graphicsRetryTimer = null;
    this.#clearLiveFailoverTimer();
    this.mediaCache.close?.();
    const schedulerClose = this.scheduler.close(`agent_${signal.toLowerCase()}`);
    await Promise.allSettled([...this.inflight, this.snapshotPollChain]);
    await schedulerClose;
    await this.events.persist?.();
    await this.events.flush().catch(() => undefined);
    await this.events.persist?.();
    this.amcp.close();
    await new Promise((resolve) => this.healthServer?.close(resolve) ?? resolve());
    log("info", "broadcast_agent_stopped", { signal });
  }
}
