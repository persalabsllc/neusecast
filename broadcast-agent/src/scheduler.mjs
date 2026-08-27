import { amcpQuote, layerAddress } from "./amcp.mjs";
import { itemAfter, itemAt } from "./contracts.mjs";
import { streamProducerFor } from "./live-source.mjs";
import { asObject, firstDefined } from "./util.mjs";

export { streamProducerFor } from "./live-source.mjs";

function transitionTokens(item) {
  const transition = asObject(item.transition);
  const type = String(firstDefined(transition.type, transition.name, item.transition, "CUT")).toUpperCase();
  if (!new Set(["CUT", "MIX", "WIPE", "SLIDE", "PUSH"]).has(type)) return [];
  if (type === "CUT") return [];
  const frames = Math.max(1, Math.min(300, Number(transition.frames ?? transition.durationFrames ?? 12) || 12));
  return [type, String(Math.round(frames))];
}

export class PlayoutScheduler {
  constructor({ amcp, channel, layer, fps, fallbackClip, preloadLeadMs, eventBuffer, graphics }) {
    this.amcp = amcp;
    this.address = layerAddress(channel, layer);
    this.fps = fps;
    this.fallbackClip = fallbackClip;
    this.preloadLeadMs = preloadLeadMs;
    this.eventBuffer = eventBuffer;
    this.graphics = graphics;
    this.snapshot = null;
    this.resolvedMedia = new Map();
    this.serverOffsetMs = 0;
    this.current = null;
    this.preloadedItemId = null;
    this.preloadedClipName = null;
    this.preloadedMediaVersionId = null;
    this.nextPreloadRetryMs = 0;
    this.live = null;
    this.stopped = false;
    this.disabled = false;
    this.programClearConfirmed = false;
    this.graphicsClearConfirmed = false;
    this.graphicsOperationConfirmed = false;
    this.nextGraphicsClearRetryMs = 0;
    this.ticking = null;
    this.operationChain = Promise.resolve();
    this.acceptingOperations = true;
  }

  update(snapshot, resolvedMedia) {
    return this.#serialize(() => this.#update(snapshot, resolvedMedia));
  }

  #update(snapshot, resolvedMedia) {
    this.snapshot = snapshot;
    this.resolvedMedia = resolvedMedia;
    this.serverOffsetMs = snapshot.serverTimeMs - snapshot.receivedAtMs;
    if (this.preloadedItemId) {
      const preloaded = snapshot.log.items.find((item) => item.id === this.preloadedItemId);
      const clip = preloaded ? this.#clipFor(preloaded) : null;
      const mediaVersionId = preloaded?.mediaVersionId == null ? null : String(preloaded.mediaVersionId);
      if (!clip || clip !== this.preloadedClipName || mediaVersionId !== this.preloadedMediaVersionId) this.#clearPreload();
    }
    if (this.current?.mode === "fallback" && this.current.scheduledItemId) {
      const scheduled = snapshot.log.items.find((item) => item.id === this.current.scheduledItemId);
      if (scheduled && (this.#clipFor(scheduled) || this.#dynamicProducerFor(scheduled))) this.current.scheduledItemId = null;
    }
  }

  tick() {
    if (this.ticking) return this.ticking;
    this.ticking = this.#serialize(() => this.#tick()).finally(() => { this.ticking = null; });
    return this.ticking;
  }

  syncGraphics(options = {}, context = "agent_graphics_sync") {
    return this.#serialize(() => this.#syncGraphics(options, context));
  }

  retryGraphics() {
    return this.#serialize(() => {
      const mode = this.status().mode;
      if (mode === "disabled" || mode === "standby") {
        return this.#clearGraphics({ force: true }, "graphics_retry");
      }
      return this.#syncGraphics({ force: true }, "graphics_retry");
    });
  }

  #serialize(operation) {
    if (!this.acceptingOperations) return Promise.resolve(false);
    const task = this.operationChain.then(operation, operation);
    this.operationChain = task.catch(() => undefined);
    return task;
  }

  async #tick() {
    if (!this.snapshot || this.live || this.stopped) return;
    const nowMs = Date.now() + this.serverOffsetMs;
    if (this.current?.manualUntilMs && nowMs < this.current.manualUntilMs) return;
    if (this.current?.manualUntilMs) {
      this.#closeCurrent(nowMs, "completed");
      this.current = null;
    }
    const items = this.snapshot.log.items;
    const due = itemAt(items, nowMs);
    if (due && this.current?.itemId !== due.id && this.current?.scheduledItemId !== due.id) await this.#playItem(due, nowMs);
    if (!due) {
      if (this.snapshot.output.alwaysOn === true) {
        if (this.current?.mode !== "fallback") await this.#playFallback(nowMs, "schedule_gap");
      } else if (
        this.current?.mode !== "standby" ||
        (!this.graphicsClearConfirmed && nowMs >= this.nextGraphicsClearRetryMs)
      ) {
        await this.#enterStandby(nowMs, "schedule_gap_always_on_disabled");
      }
    }

    const next = itemAfter(items, nowMs);
    if (next && next.startMs - nowMs <= this.preloadLeadMs) {
      const clip = this.#clipFor(next);
      const mediaVersionId = next.mediaVersionId == null ? null : String(next.mediaVersionId);
      if (clip && nowMs >= this.nextPreloadRetryMs && (
        this.preloadedItemId !== next.id ||
        this.preloadedClipName !== clip ||
        this.preloadedMediaVersionId !== mediaVersionId
      )) {
        try {
          await this.amcp.send(`LOADBG ${this.address} ${amcpQuote(clip)} ${transitionTokens(next).join(" ")}`.trim());
          this.preloadedItemId = next.id;
          this.preloadedClipName = clip;
          this.preloadedMediaVersionId = mediaVersionId;
          this.nextPreloadRetryMs = 0;
        } catch (error) {
          this.#clearPreload();
          this.nextPreloadRetryMs = nowMs + 5000;
          this.eventBuffer.add("error", {
            code: "MEDIA_PRELOAD_FAILED",
            message: error instanceof Error ? error.message : "CasparCG rejected the background preload",
            retryable: true,
            programItemId: next.id,
            mediaVersionId: next.mediaVersionId,
            context: "schedule_preload"
          });
        }
      } else if (!clip && this.preloadedItemId === next.id) {
        this.#clearPreload();
      }
    }
  }

  #clipFor(item) {
    // Database clip names describe a prior agent's cache and are not proof the
    // file exists on this playout host. Only MediaCache resolutions are local.
    const resolved = item.mediaVersionId
      ? this.resolvedMedia.get(item.mediaVersionId)
      : this.resolvedMedia.get(item.assetId);
    return resolved?.validated === false ? null : resolved?.clipName ?? null;
  }

  #dynamicProducerFor(item) {
    if (item.dynamicKey !== "weather_center") return null;
    const url = String(item.dynamicUrl ?? "");
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/|$)/iu.test(url) || /[\r\n]/u.test(url)) return null;
    return `[HTML] ${amcpQuote(url)}`;
  }

  async #playItem(item, nowMs, {
    seekFromSchedule = true,
    closeOutcome = "completed_or_advanced",
    manual = false,
    fallbackWhenMissing = true
  } = {}) {
    const clip = this.#clipFor(item);
    const dynamicProducer = this.#dynamicProducerFor(item);
    if (!clip && !dynamicProducer) {
      this.eventBuffer.add("error", { code: "MEDIA_NOT_READY", message: `Scheduled media or dynamic producer is not ready: ${item.id}`, retryable: true, programItemId: item.id, mediaVersionId: item.mediaVersionId });
      if (fallbackWhenMissing) await this.#playFallback(nowMs, "media_not_ready", item.id);
      return false;
    }
    const lateMs = seekFromSchedule ? Math.max(0, nowMs - item.startMs) : 0;
    const seekFrames = Math.floor((lateMs / 1000) * this.fps);
    const mediaVersionId = item.mediaVersionId == null ? null : String(item.mediaVersionId);
    if (dynamicProducer) {
      await this.amcp.send(`PLAY ${this.address} ${dynamicProducer}`, { redactedCommand: `PLAY ${this.address} [WEATHER CENTER]` });
    } else if (
      this.preloadedItemId === item.id &&
      this.preloadedClipName === clip &&
      this.preloadedMediaVersionId === mediaVersionId &&
      seekFrames < this.fps
    ) {
      await this.amcp.send(`PLAY ${this.address}`);
    } else {
      const seek = seekFrames > 0 ? ` SEEK ${seekFrames}` : "";
      const transitions = transitionTokens(item);
      await this.amcp.send(`PLAY ${this.address} ${amcpQuote(clip)}${seek}${transitions.length ? ` ${transitions.join(" ")}` : ""}`);
    }
    this.#clearPreload();
    this.programClearConfirmed = false;
    this.#closeCurrent(nowMs, closeOutcome);
    this.current = {
      mode: "automation",
      itemId: item.id,
      assetId: item.assetId,
      mediaVersionId: item.mediaVersionId,
      logId: this.snapshot.log.id,
      startedAtMs: nowMs,
      plannedStartMs: item.startMs,
      plannedEndMs: item.endMs,
      clipName: clip ?? "weather-center-html",
      dynamicKey: item.dynamicKey ?? null,
    };
    this.graphics.activate?.();
    if (manual) this.current.manualUntilMs = nowMs + Math.max(1000, item.durationMs ?? (item.endMs - item.startMs));
    this.graphics.setOverlayPolicy(item.overlayPolicy);
    this.eventBuffer.add("now_playing", {
      mode: "automation", logId: this.snapshot.log.id, programItemId: item.id, assetId: item.assetId,
      mediaVersionId: item.mediaVersionId, clipName: clip ?? "weather-center-html", dynamicKey: item.dynamicKey ?? null, plannedStartAt: new Date(item.startMs).toISOString(),
      plannedEndAt: new Date(item.endMs).toISOString(), actualStartAt: new Date(nowMs).toISOString(), lateByMs: lateMs
    });
    await this.#syncGraphics({}, "program_item");
    return true;
  }

  async #playFallback(nowMs, reason, scheduledItemId = null) {
    await this.amcp.send(`PLAY ${this.address} ${amcpQuote(this.fallbackClip)} LOOP`);
    this.programClearConfirmed = false;
    this.#closeCurrent(nowMs, reason);
    this.current = { mode: "fallback", itemId: null, scheduledItemId, startedAtMs: nowMs, clipName: this.fallbackClip, reason };
    this.graphics.activate?.();
    this.graphics.setOverlayPolicy("all");
    this.eventBuffer.add("now_playing", { mode: "fallback", clipName: this.fallbackClip, actualStartAt: new Date(nowMs).toISOString(), reason });
    await this.#syncGraphics({}, "fallback");
  }

  async #enterStandby(nowMs, reason) {
    this.graphics.suppress?.();
    await this.amcp.send(`CLEAR ${this.address}`);
    this.programClearConfirmed = true;
    this.#closeCurrent(nowMs, reason);
    this.current = { mode: "standby", itemId: null, startedAtMs: nowMs, reason };
    this.#clearPreload();
    this.eventBuffer.add("now_playing", { mode: "standby", actualStartAt: new Date(nowMs).toISOString(), reason });
    await this.#clearGraphics({ force: true }, "standby");
  }

  #closeCurrent(nowMs, outcome) {
    if (!this.current?.itemId) return;
    this.eventBuffer.add("as_run", {
      logId: this.current.logId,
      programItemId: this.current.itemId,
      assetId: this.current.assetId,
      mediaVersionId: this.current.mediaVersionId,
      plannedStartAt: new Date(this.current.plannedStartMs).toISOString(),
      plannedEndAt: new Date(this.current.plannedEndMs).toISOString(),
      actualStartAt: new Date(this.current.startedAtMs).toISOString(),
      actualEndAt: new Date(nowMs).toISOString(),
      playedDurationMs: Math.max(0, nowMs - this.current.startedAtMs),
      outcome
    });
  }

  takeLive(source) {
    return this.#serialize(() => this.#takeLive(source));
  }

  async #takeLive(source) {
    if (this.disabled) throw new Error("Output is disabled");
    if (this.stopped) throw new Error("Output is stopped");
    const nowMs = Date.now() + this.serverOffsetMs;
    const producer = streamProducerFor(source);
    const previousLive = this.live;
    await this.amcp.send(`PLAY ${this.address} ${producer}`, { redactedCommand: `PLAY ${this.address} [LIVE SOURCE]` });
    this.programClearConfirmed = false;
    this.#closeCurrent(nowMs, "interrupted_for_live");
    this.current = null;
    if (previousLive) this.#reportLiveEnded(previousLive, "replaced_by_live_source", nowMs);
    this.live = { sourceId: String(source.id), label: String(source.label ?? source.name ?? source.id), startedAtMs: nowMs };
    this.#clearPreload();
    this.graphics.activate?.();
    this.eventBuffer.add("live_source_status", { sourceId: this.live.sourceId, status: "live", label: this.live.label, takenAt: new Date(nowMs).toISOString() });
    this.eventBuffer.add("now_playing", { mode: "live", liveSourceId: this.live.sourceId, label: this.live.label, actualStartAt: new Date(nowMs).toISOString() });
    await this.#syncGraphics({}, "live_source");
  }

  takeItem(programItemId) {
    return this.#serialize(() => this.#takeItem(programItemId));
  }

  async #takeItem(programItemId) {
    if (this.disabled) throw new Error("Output is disabled");
    if (!this.snapshot) throw new Error("No published program log is loaded");
    const item = this.snapshot.log.items.find((candidate) => candidate.id === programItemId);
    if (!item) throw new Error(`Program item is not in the published log: ${programItemId}`);
    const endedLive = this.live;
    this.stopped = false;
    const nowMs = Date.now() + this.serverOffsetMs;
    const played = await this.#playItem(item, nowMs, {
      seekFromSchedule: false,
      closeOutcome: "interrupted_manual_take",
      manual: true,
      fallbackWhenMissing: !endedLive
    });
    if (!played) {
      const outcome = endedLive ? "the current live source remains on air" : "fallback is on air";
      throw new Error(`Program item media is not ready: ${item.id}; ${outcome}`);
    }
    this.#completeLiveHandoff(endedLive, "manual_item_take", nowMs);
    return item.id;
  }

  skip() {
    return this.#serialize(() => this.#skip());
  }

  async #skip() {
    if (this.disabled) throw new Error("Output is disabled");
    if (!this.snapshot) throw new Error("No published program log is loaded");
    const nowMs = Date.now() + this.serverOffsetMs;
    const currentIndex = this.current?.itemId
      ? this.snapshot.log.items.findIndex((item) => item.id === this.current.itemId)
      : -1;
    const next = currentIndex >= 0
      ? this.snapshot.log.items[currentIndex + 1]
      : this.snapshot.log.items.find((item) => item.startMs > nowMs);
    const endedLive = this.live;
    if (!next) {
      if (this.snapshot.output.alwaysOn === true) await this.#playFallback(nowMs, "operator_skip_no_next");
      else await this.#enterStandby(nowMs, "operator_skip_no_next");
      this.#completeLiveHandoff(endedLive, "operator_skip", nowMs);
      return null;
    }
    this.stopped = false;
    const played = await this.#playItem(next, nowMs, {
      seekFromSchedule: false,
      closeOutcome: "skipped",
      manual: true,
      fallbackWhenMissing: !endedLive
    });
    if (!played) {
      const outcome = endedLive ? "the current live source remains on air" : "fallback is on air";
      throw new Error(`Program item media is not ready: ${next.id}; ${outcome}`);
    }
    this.#completeLiveHandoff(endedLive, "operator_skip", nowMs);
    return next.id;
  }

  startOutput() {
    return this.#serialize(() => this.#startOutput());
  }

  async #startOutput() {
    this.disabled = false;
    this.stopped = false;
    this.programClearConfirmed = false;
    this.graphics.activate?.();
    if (this.snapshot) await this.#tick();
    else await this.#playFallback(Date.now() + this.serverOffsetMs, "output_started_without_log");
  }

  stopOutput() {
    return this.#serialize(() => this.#stopOutput());
  }

  async #stopOutput() {
    const nowMs = Date.now() + this.serverOffsetMs;
    this.#closeCurrent(nowMs, "interrupted_output_stopped");
    if (this.live) this.eventBuffer.add("live_source_status", { sourceId: this.live.sourceId, status: "ready", endedAt: new Date(nowMs).toISOString(), reason: "output_stopped" });
    // Latch the safe state before network I/O so a reconnect callback cannot
    // restart program while a stop/disable is in progress.
    this.stopped = true;
    this.disabled = true;
    this.live = null;
    this.current = null;
    this.#clearPreload();
    this.graphics.suppress?.();
    this.programClearConfirmed = false;
    await this.amcp.send(`CLEAR ${this.address}`);
    this.programClearConfirmed = true;
    const graphicsCleared = await this.#clearGraphics({ force: true }, "output_stop");
    if (!graphicsCleared) throw new Error("Output program is clear, but the graphics clear remains unconfirmed");
  }

  applyOutputEnabled(enabled) {
    return this.#serialize(() => this.#applyOutputEnabled(enabled));
  }

  async #applyOutputEnabled(enabled) {
    if (enabled) {
      if (!this.disabled) return;
      this.disabled = false;
      this.stopped = false;
      this.programClearConfirmed = false;
      this.graphics.activate?.();
      await this.#tick();
      return;
    }
    if (this.disabled && this.programClearConfirmed && this.graphicsClearConfirmed) return;
    await this.#stopOutput();
  }

  returnToAutomation(reason = "operator_return") {
    return this.#serialize(() => this.#returnToAutomation(reason));
  }

  returnLiveSourceToAutomation(sourceId, reason = "live_signal_timeout") {
    const expectedSourceId = String(sourceId);
    return this.#serialize(() => {
      if (!this.live || String(this.live.sourceId) !== expectedSourceId) return false;
      return this.#returnToAutomation(reason);
    });
  }

  async #returnToAutomation(reason = "operator_return") {
    if (!this.live && !this.current?.manualUntilMs) return false;
    const endedLive = this.live;
    const nowMs = Date.now() + this.serverOffsetMs;
    this.stopped = false;
    await this.#playAutomationAt(nowMs, reason);
    this.#completeLiveHandoff(endedLive, reason, nowMs);
    return true;
  }

  async #playAutomationAt(nowMs, reason) {
    if (!this.snapshot) {
      await this.#playFallback(nowMs, reason);
      return;
    }
    const due = itemAt(this.snapshot.log.items, nowMs);
    if (due) {
      await this.#playItem(due, nowMs, { closeOutcome: reason });
    } else if (this.snapshot.output.alwaysOn === true) {
      await this.#playFallback(nowMs, reason);
    } else {
      await this.#enterStandby(nowMs, reason);
    }
  }

  #reportLiveEnded(live, reason, nowMs) {
    const signalLost = reason === "live_signal_timeout";
    this.eventBuffer.add("live_source_status", {
      sourceId: live.sourceId,
      status: signalLost ? "offline" : "ready",
      errorMessage: signalLost ? "Live signal did not recover before its reconnect timeout" : null,
      endedAt: new Date(nowMs).toISOString(),
      reason
    });
  }

  #completeLiveHandoff(endedLive, reason, nowMs) {
    if (!endedLive || this.live !== endedLive) return;
    this.#reportLiveEnded(endedLive, reason, nowMs);
    this.live = null;
  }

  handleCasparDisconnect() {
    return this.#serialize(() => this.#handleCasparDisconnect());
  }

  #handleCasparDisconnect() {
    const nowMs = Date.now() + this.serverOffsetMs;
    this.#closeCurrent(nowMs, "caspar_disconnected");
    if (this.live) {
      this.eventBuffer.add("live_source_status", {
        sourceId: this.live.sourceId,
        status: "offline",
        errorMessage: "CasparCG disconnected while the source was live",
        endedAt: new Date(nowMs).toISOString(),
        reason: "caspar_disconnected"
      });
    }
    this.current = null;
    this.live = null;
    this.#clearPreload();
    this.programClearConfirmed = false;
    this.graphicsClearConfirmed = false;
    this.graphicsOperationConfirmed = false;
  }

  reconcileAfterReconnect(shouldApply = null) {
    return this.#serialize(() => this.#reconcileAfterReconnect(shouldApply));
  }

  async #reconcileAfterReconnect(shouldApply) {
    // The connection event can fire while the command that opened the socket
    // is still applying the same desired state. Evaluate this only once the
    // scheduler-wide queue reaches reconciliation, so a successful initial
    // application does not cause a duplicate PLAY/CG sequence.
    if (typeof shouldApply === "function" && !shouldApply()) return false;
    this.current = null;
    this.live = null;
    this.#clearPreload();
    if (this.disabled || this.snapshot?.output.enabled === false) {
      await this.amcp.send(`CLEAR ${this.address}`);
      this.programClearConfirmed = true;
      const graphicsCleared = await this.#clearGraphics({ force: true }, "reconnect_disabled");
      if (!graphicsCleared) throw new Error("Disabled output graphics clear remains unconfirmed after reconnect");
      return true;
    }
    if (this.stopped || !this.snapshot) return false;
    await this.#tick();
    return true;
  }

  async #syncGraphics(options, context) {
    this.graphicsClearConfirmed = false;
    try {
      const result = await this.graphics.sync(options);
      // GraphicsController returns false for an already-correct no-op. A
      // resolved call still confirms desired state; only rejection is failure.
      this.graphicsOperationConfirmed = true;
      return result;
    } catch {
      this.graphicsOperationConfirmed = false;
      this.eventBuffer.add("error", {
        code: "GRAPHICS_SYNC_FAILED",
        message: "The program take succeeded, but the CasparCG graphics layer could not be updated",
        retryable: true,
        context
      });
      return false;
    }
  }

  async #clearGraphics(options, context) {
    try {
      await this.graphics.clear(options);
      this.graphicsClearConfirmed = true;
      this.graphicsOperationConfirmed = true;
      this.nextGraphicsClearRetryMs = 0;
      return true;
    } catch {
      this.graphicsClearConfirmed = false;
      this.graphicsOperationConfirmed = false;
      this.nextGraphicsClearRetryMs = Date.now() + 5000;
      this.eventBuffer.add("error", {
        code: "GRAPHICS_CLEAR_FAILED",
        message: "The program layer changed, but the CasparCG graphics layer could not be cleared",
        retryable: true,
        context
      });
      return false;
    }
  }

  #clearPreload() {
    this.preloadedItemId = null;
    this.preloadedClipName = null;
    this.preloadedMediaVersionId = null;
    this.nextPreloadRetryMs = 0;
  }

  status() {
    return {
      mode: this.disabled ? "disabled" : this.stopped ? "standby" : this.live ? "live" : this.current?.mode ?? "starting",
      current: this.live ?? this.current,
      preloadedItemId: this.preloadedItemId
    };
  }

  close(outcome = "agent_shutdown") {
    if (!this.acceptingOperations) return this.operationChain;
    this.acceptingOperations = false;
    const operation = () => this.#closeCurrent(Date.now() + this.serverOffsetMs, outcome);
    const task = this.operationChain.then(operation, operation);
    this.operationChain = task.catch(() => undefined);
    return task;
  }
}
