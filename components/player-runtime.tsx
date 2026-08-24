"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CloudSun, History, Lightbulb, MapPin, Radio, Store, Waves } from "lucide-react";
import type { PlayerItem, PlayerManifest } from "@/lib/player/types";

const kindLabels: Record<PlayerItem["kind"], string> = {
  advertisement: "Local business",
  host: "At this location",
  weather: "Local weather",
  event: "Around town",
  history: "Local history",
  trivia: "Quick trivia",
  community: "Eastern Carolina",
};

function KindIcon({ kind }: { kind: PlayerItem["kind"] }) {
  if (kind === "weather") return <CloudSun />;
  if (kind === "history") return <History />;
  if (kind === "trivia") return <Lightbulb />;
  if (kind === "event") return <CalendarDays />;
  if (kind === "host") return <Store />;
  return <Radio />;
}

function PlayerProgress({ durationSeconds }: { durationSeconds: number }) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    const countdown = window.setInterval(() => {
      if (startedAt.current === null) return;
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setRemaining(Math.max(0, durationSeconds - elapsed));
    }, 1000);
    return () => window.clearInterval(countdown);
  }, [durationSeconds]);

  const progress = ((durationSeconds - remaining) / durationSeconds) * 100;
  return <span style={{ width: `${progress}%` }} />;
}

type DeviceIdentity = {
  id: string;
  credential: string;
};

type PlaybackPayload = {
  eventId: string;
  itemId: string;
  source: PlayerItem["source"];
  campaignId: string | null;
  creativeId: string | null;
  durationSeconds: number;
  manifestVersion: string | null;
  sessionId: string | null;
  playerVersion: string;
  playedAt: string;
};

type HeartbeatResponse = {
  ok: boolean;
  enrolled?: boolean;
  serverTime?: string;
  timeZone?: string;
};

type ManifestCacheEnvelope = {
  schemaVersion: 2;
  manifest: PlayerManifest;
  cachedAtClientTimeMs: number;
  cachedAtServerTimeMs: number;
  manifestAgeAtCacheMs: number;
};

type CachedManifest = {
  manifest: PlayerManifest;
  ageMs: number;
  estimatedServerTime: string;
};

type ManifestFreshnessAnchor = {
  ageMs: number;
  monotonicTimeMs: number;
};

const DEFAULT_TIME_ZONE = "America/New_York";
const MAX_QUEUED_PLAYBACK_EVENTS = 250;
const MAX_CACHED_MANIFEST_AGE_MS = 24 * 60 * 60 * 1_000;
const MANIFEST_CACHE_SCHEMA_VERSION = 2;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const TERMINAL_PLAYBACK_STATUSES = new Set([400, 404, 409, 429]);
const AUTHORIZATION_FAILURE_STATUSES = new Set([401, 403, 404]);

function deviceStorageKey(playerKey: string) {
  return `neusecast:player:${playerKey}:device:v1`;
}

function playbackQueueStorageKey(playerKey: string) {
  return `neusecast:player:${playerKey}:playback-queue:v1`;
}

function manifestStorageKey(playerKey: string) {
  return `neusecast:player:${playerKey}:manifest:v1`;
}

function randomCredential() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return window.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function getOrCreateDeviceIdentity(playerKey: string): DeviceIdentity {
  const storageKey = deviceStorageKey(playerKey);

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DeviceIdentity>;
      if (
        typeof parsed.id === "string"
        && DEVICE_ID_PATTERN.test(parsed.id)
        && typeof parsed.credential === "string"
        && DEVICE_CREDENTIAL_PATTERN.test(parsed.credential)
      ) {
        return { id: parsed.id, credential: parsed.credential };
      }
    }
  } catch {
    // A kiosk can still run with an in-memory identity if storage is unavailable.
  }

  const identity = { id: crypto.randomUUID(), credential: randomCredential() };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(identity));
  } catch {
    // The caller retains the generated identity for this browser session.
  }
  return identity;
}

function authenticatedHeaders(
  identity: DeviceIdentity,
  includeJson = false,
  pairingToken?: string | null,
): HeadersInit {
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    "X-NeuseCast-Device-Id": identity.id,
    "X-NeuseCast-Device-Credential": identity.credential,
    ...(pairingToken ? { "X-NeuseCast-Pairing-Token": pairingToken } : {}),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function readPlaybackQueue(playerKey: string): PlaybackPayload[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(playbackQueueStorageKey(playerKey)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PlaybackPayload => {
      if (!item || typeof item !== "object") return false;
      const event = item as Partial<PlaybackPayload>;
      return typeof event.eventId === "string" && typeof event.itemId === "string" && typeof event.source === "string";
    }).slice(-MAX_QUEUED_PLAYBACK_EVENTS);
  } catch {
    return [];
  }
}

function writePlaybackQueue(playerKey: string, queue: PlaybackPayload[]) {
  try {
    window.localStorage.setItem(
      playbackQueueStorageKey(playerKey),
      JSON.stringify(queue.slice(-MAX_QUEUED_PLAYBACK_EVENTS)),
    );
  } catch {
    // The in-memory queue remains available until the player is restarted.
  }
}

function isPlayerManifest(value: unknown): value is PlayerManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<PlayerManifest>;
  return typeof manifest.generatedAt === "string"
    && typeof manifest.serverTime === "string"
    && typeof manifest.version === "string"
    && Boolean(manifest.venue)
    && Boolean(manifest.screen)
    && Array.isArray(manifest.items);
}

function manifestAgeAtServerTime(manifest: PlayerManifest) {
  const generatedAt = Date.parse(manifest.generatedAt);
  const serverTime = Date.parse(manifest.serverTime);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(serverTime)) return Number.POSITIVE_INFINITY;
  return Math.max(0, serverTime - generatedAt);
}

function monotonicTime() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function cacheManifest(playerKey: string, manifest: PlayerManifest) {
  const cachedAtServerTimeMs = Date.parse(manifest.serverTime);
  const manifestAgeAtCacheMs = manifestAgeAtServerTime(manifest);
  try {
    const envelope: ManifestCacheEnvelope = {
      schemaVersion: MANIFEST_CACHE_SCHEMA_VERSION,
      manifest,
      cachedAtClientTimeMs: Date.now(),
      cachedAtServerTimeMs,
      manifestAgeAtCacheMs,
    };
    window.localStorage.setItem(manifestStorageKey(playerKey), JSON.stringify(envelope));
  } catch {
    // The live React state remains the last-known-good manifest.
  }
  return manifestAgeAtCacheMs;
}

function readCachedManifest(playerKey: string): CachedManifest | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(manifestStorageKey(playerKey)) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const envelope = parsed as Partial<ManifestCacheEnvelope>;
    if (
      envelope.schemaVersion !== MANIFEST_CACHE_SCHEMA_VERSION
      || !isPlayerManifest(envelope.manifest)
      || typeof envelope.cachedAtClientTimeMs !== "number"
      || !Number.isFinite(envelope.cachedAtClientTimeMs)
      || typeof envelope.cachedAtServerTimeMs !== "number"
      || !Number.isFinite(envelope.cachedAtServerTimeMs)
      || typeof envelope.manifestAgeAtCacheMs !== "number"
      || !Number.isFinite(envelope.manifestAgeAtCacheMs)
    ) return null;

    // The TV's absolute wall clock may be wrong, but a stable wrong offset
    // cancels when measuring elapsed time. A backward jump is unknowable after
    // a restart, so fail closed rather than extending stale content.
    const elapsedSinceCacheMs = Date.now() - envelope.cachedAtClientTimeMs;
    const ageMs = elapsedSinceCacheMs < 0
      ? Number.POSITIVE_INFINITY
      : envelope.manifestAgeAtCacheMs + elapsedSinceCacheMs;
    const estimatedServerTimeMs = envelope.cachedAtServerTimeMs + Math.max(0, elapsedSinceCacheMs);

    return {
      manifest: envelope.manifest,
      ageMs,
      estimatedServerTime: new Date(estimatedServerTimeMs).toISOString(),
    };
  } catch {
    return null;
  }
}

function clockOffset(serverTime: string) {
  const timestamp = Date.parse(serverTime);
  return Number.isFinite(timestamp) ? timestamp - Date.now() : 0;
}

export function PlayerRuntime({
  initialManifest,
  initialItemId,
  pairingToken,
  playerKey,
  playerVersion = "neusecast-web",
  preview = false,
}: {
  initialManifest: PlayerManifest;
  initialItemId?: string | null;
  pairingToken?: string;
  playerKey: string;
  playerVersion?: string;
  preview?: boolean;
}) {
  const [manifest, setManifest] = useState(initialManifest);
  const [activeIndex, setActiveIndex] = useState(() => {
    const reportedIndex = initialManifest.items.findIndex((item) => item.id === initialItemId);
    return Math.max(0, reportedIndex);
  });
  const [clock, setClock] = useState("");
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [identity] = useState<DeviceIdentity | null>(() => {
    if (preview || typeof window === "undefined") return null;
    return getOrCreateDeviceIdentity(playerKey);
  });
  const [clockSync, setClockSync] = useState(() => ({
    offsetMs: clockOffset(initialManifest.serverTime),
    timeZone: initialManifest.venue.timeZone || DEFAULT_TIME_ZONE,
  }));
  const initialManifestAgeMs = manifestAgeAtServerTime(initialManifest);
  const [manifestExpired, setManifestExpired] = useState(
    () => initialManifestAgeMs > MAX_CACHED_MANIFEST_AGE_MS,
  );
  const clockOffsetRef = useRef(clockOffset(initialManifest.serverTime));
  const manifestFreshnessRef = useRef<ManifestFreshnessAnchor>({
    ageMs: initialManifestAgeMs,
    monotonicTimeMs: monotonicTime(),
  });
  const sessionId = useRef<string | null>(null);
  const currentItemId = useRef<string | null>(null);
  const manifestVersion = useRef(initialManifest.version);
  const lastError = useRef<string | null>(null);
  const playbackQueue = useRef<PlaybackPayload[]>([]);
  const pairingTokenRef = useRef(pairingToken ?? null);
  const flushingPlayback = useRef(false);
  const refreshingManifest = useRef(false);
  const currentItem = manifest.items[activeIndex] ?? null;

  const location = useMemo(
    () => `${manifest.venue.city}, ${manifest.venue.state}`,
    [manifest.venue.city, manifest.venue.state],
  );

  const syncServerClock = useCallback((serverTime: string, timeZone?: string) => {
    const offsetMs = clockOffset(serverTime);
    clockOffsetRef.current = offsetMs;
    setClockSync({
      offsetMs,
      timeZone: timeZone || DEFAULT_TIME_ZONE,
    });
  }, []);

  const anchorManifestFreshness = useCallback((ageMs: number) => {
    manifestFreshnessRef.current = {
      ageMs,
      monotonicTimeMs: monotonicTime(),
    };
    setManifestExpired(!Number.isFinite(ageMs) || ageMs > MAX_CACHED_MANIFEST_AGE_MS);
  }, []);

  const revokePlayerAccess = useCallback(() => {
    setAccessRevoked(true);
    currentItemId.current = null;
    playbackQueue.current = [];
    try {
      window.localStorage.removeItem(deviceStorageKey(playerKey));
      window.localStorage.removeItem(playbackQueueStorageKey(playerKey));
      window.localStorage.removeItem(manifestStorageKey(playerKey));
    } catch {
      // The live runtime still locks immediately if kiosk storage is unavailable.
    }
    navigator.serviceWorker?.controller?.postMessage({ type: "REVOKE_PLAYER", playerKey });
  }, [playerKey]);

  const flushPlaybackQueue = useCallback(async () => {
    if (!identity || flushingPlayback.current || playbackQueue.current.length === 0) return;
    flushingPlayback.current = true;

    try {
      while (playbackQueue.current.length > 0) {
        const event = playbackQueue.current[0];
        const response = await fetchWithTimeout(`/api/player/${playerKey}/playback`, {
          method: "POST",
          headers: authenticatedHeaders(identity, true),
          body: JSON.stringify(event),
          keepalive: true,
        }).catch(() => null);

        if (!response) break;
        if (AUTHORIZATION_FAILURE_STATUSES.has(response.status)) {
          revokePlayerAccess();
          break;
        }
        if (!response.ok && TERMINAL_PLAYBACK_STATUSES.has(response.status)) {
          playbackQueue.current = playbackQueue.current.slice(1);
          writePlaybackQueue(playerKey, playbackQueue.current);
          continue;
        }
        if (!response.ok) break;
        playbackQueue.current = playbackQueue.current.slice(1);
        writePlaybackQueue(playerKey, playbackQueue.current);
      }
    } finally {
      flushingPlayback.current = false;
    }
  }, [identity, playerKey, revokePlayerAccess]);

  const sendPlayback = useCallback(async (event: PlaybackPayload) => {
    if (!identity) {
      playbackQueue.current = [...playbackQueue.current, event].slice(-MAX_QUEUED_PLAYBACK_EVENTS);
      writePlaybackQueue(playerKey, playbackQueue.current);
      return;
    }

    const response = await fetchWithTimeout(`/api/player/${playerKey}/playback`, {
      method: "POST",
      headers: authenticatedHeaders(identity, true),
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => null);

    if (response && AUTHORIZATION_FAILURE_STATUSES.has(response.status)) {
      revokePlayerAccess();
      return;
    }
    if (response?.ok || (response && TERMINAL_PLAYBACK_STATUSES.has(response.status))) return;
    lastError.current = response ? `Playback reporting failed (${response.status})` : "Playback reporting is offline";
    playbackQueue.current = [...playbackQueue.current, event].slice(-MAX_QUEUED_PLAYBACK_EVENTS);
    writePlaybackQueue(playerKey, playbackQueue.current);
  }, [identity, playerKey, revokePlayerAccess]);

  const refreshManifest = useCallback(async () => {
    if (!identity || refreshingManifest.current) return false;
    refreshingManifest.current = true;

    try {
      const response = await fetchWithTimeout(`/api/player/${playerKey}/manifest`, {
        cache: "no-store",
        headers: authenticatedHeaders(identity),
      }).catch(() => null);

      if (!response?.ok) {
        if (response && AUTHORIZATION_FAILURE_STATUSES.has(response.status)) {
          revokePlayerAccess();
          return false;
        }
        lastError.current = response ? `Manifest refresh failed (${response.status})` : "Manifest refresh is offline";
        return false;
      }

      const nextManifest = (await response.json().catch(() => null)) as PlayerManifest | null;
      if (!nextManifest || !Array.isArray(nextManifest.items)) {
        lastError.current = "Manifest refresh returned invalid data";
        return false;
      }

      const nextManifestAgeMs = cacheManifest(playerKey, nextManifest);
      anchorManifestFreshness(nextManifestAgeMs);
      const previousVersion = manifestVersion.current;
      manifestVersion.current = nextManifest.version;
      syncServerClock(nextManifest.serverTime, nextManifest.venue.timeZone);
      if (nextManifest.version === previousVersion) {
        setManifest((current) => ({
          ...current,
          generatedAt: nextManifest.generatedAt,
          serverTime: nextManifest.serverTime,
          refreshAfterSeconds: nextManifest.refreshAfterSeconds,
          screen: nextManifest.screen,
          venue: nextManifest.venue,
        }));
      } else {
        const retainedIndex = nextManifest.items.findIndex((item) => item.id === currentItemId.current);
        setManifest(nextManifest);
        setActiveIndex(nextManifest.items.length === 0 ? 0 : Math.max(0, retainedIndex));
      }
      lastError.current = null;
      return true;
    } finally {
      refreshingManifest.current = false;
    }
  }, [anchorManifestFreshness, identity, playerKey, revokePlayerAccess, syncServerClock]);

  useEffect(() => {
    if (preview || !identity) return;
    const initialize = window.setTimeout(() => {
      sessionId.current = crypto.randomUUID();
      playbackQueue.current = readPlaybackQueue(playerKey);
      const cached = readCachedManifest(playerKey);
      const cachedServerTime = Date.parse(cached?.manifest.serverTime ?? "");
      const initialServerTime = Date.parse(initialManifest.serverTime);
      const cachedIsAtLeastAsRecent = Boolean(cached)
        && Number.isFinite(cachedServerTime)
        && (
          !Number.isFinite(initialServerTime)
          || cachedServerTime > initialServerTime
          || (
            cachedServerTime === initialServerTime
            && cached?.manifest.version === initialManifest.version
          )
        );

      if (cached && cachedIsAtLeastAsRecent) {
        anchorManifestFreshness(cached.ageMs);
        if (cached.ageMs <= MAX_CACHED_MANIFEST_AGE_MS) {
          manifestVersion.current = cached.manifest.version;
          syncServerClock(cached.estimatedServerTime, cached.manifest.venue.timeZone);
          setManifest(cached.manifest);
          setActiveIndex(0);
        }
        return;
      }

      anchorManifestFreshness(cacheManifest(playerKey, initialManifest));
    }, 0);
    return () => window.clearTimeout(initialize);
  }, [anchorManifestFreshness, identity, initialManifest, playerKey, preview, syncServerClock]);

  useEffect(() => {
    if (preview || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/neusecast-player-sw.js", { scope: "/player/" }).catch(() => undefined);
  }, [preview]);

  useEffect(() => {
    currentItemId.current = currentItem?.id ?? null;
    manifestVersion.current = manifest.version;
  }, [currentItem?.id, manifest.version]);

  useEffect(() => {
    const checkFreshness = () => {
      const anchor = manifestFreshnessRef.current;
      const elapsedMs = Math.max(0, monotonicTime() - anchor.monotonicTimeMs);
      const ageMs = anchor.ageMs + elapsedMs;
      setManifestExpired(
        !Number.isFinite(ageMs)
        || ageMs > MAX_CACHED_MANIFEST_AGE_MS,
      );
    };
    checkFreshness();
    const interval = window.setInterval(checkFreshness, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: clockSync.timeZone,
      });
    } catch {
      formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: DEFAULT_TIME_ZONE,
      });
    }

    const updateClock = () => {
      setClock(formatter.format(new Date(Date.now() + clockSync.offsetMs)));
    };
    updateClock();
    const interval = window.setInterval(updateClock, 15_000);
    return () => window.clearInterval(interval);
  }, [clockSync.offsetMs, clockSync.timeZone]);

  useEffect(() => {
    if (!identity || accessRevoked) return;

    const sendHeartbeat = async () => {
      const response = await fetchWithTimeout(`/api/player/${playerKey}/heartbeat`, {
        method: "POST",
        headers: authenticatedHeaders(identity, true, pairingTokenRef.current),
        body: JSON.stringify({
          sessionId: sessionId.current,
          playerVersion,
          currentItemId: currentItemId.current,
          manifestVersion: manifestVersion.current,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
          },
          error: lastError.current,
        }),
        keepalive: true,
      }).catch(() => null);

      if (!response?.ok) {
        if (response && AUTHORIZATION_FAILURE_STATUSES.has(response.status)) {
          revokePlayerAccess();
          return;
        }
        lastError.current = response ? `Heartbeat failed (${response.status})` : "Heartbeat is offline";
        return;
      }

      const result = (await response.json().catch(() => null)) as HeartbeatResponse | null;
      if (result?.serverTime) syncServerClock(result.serverTime, result.timeZone);
      const completedPairing = Boolean(pairingTokenRef.current && result?.enrolled);
      if (pairingTokenRef.current) {
        pairingTokenRef.current = null;
        window.history.replaceState({}, "", `/player/${encodeURIComponent(playerKey)}`);
      }
      if (window.location.protocol === "https:") {
        try {
          window.localStorage.removeItem(deviceStorageKey(playerKey));
        } catch {
          // HttpOnly device cookies remain the primary credential after pairing.
        }
      }
      lastError.current = null;
      if (completedPairing) {
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.ready.catch(() => undefined);
        }
        window.location.replace(`/player/${encodeURIComponent(playerKey)}`);
        return;
      }
      if (result?.enrolled) void refreshManifest();
      void flushPlaybackQueue();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void sendHeartbeat();
    };
    const onOnline = () => void sendHeartbeat();

    void sendHeartbeat();
    const heartbeat = window.setInterval(() => void sendHeartbeat(), 30_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [accessRevoked, flushPlaybackQueue, identity, playerKey, playerVersion, refreshManifest, revokePlayerAccess, syncServerClock]);

  useEffect(() => {
    if (!identity || accessRevoked) return;
    let cancelled = false;
    let retryCount = 0;
    let timeout: number | undefined;

    const schedule = (delayMs: number) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      const refreshed = await refreshManifest();
      if (cancelled) return;
      retryCount = refreshed ? 0 : retryCount + 1;
      const normalDelay = Math.max(30, manifest.refreshAfterSeconds) * 1000;
      const retryDelay = Math.min(60_000, 5_000 * (2 ** Math.min(retryCount - 1, 4)));
      schedule(refreshed ? normalDelay : retryDelay);
    };

    const onOnline = () => schedule(0);
    // Every normal mount performs an immediate authenticated refresh. Besides
    // picking up last-minute changes, this snapshots the exact manifest that
    // the device is about to play for later proof-of-play validation.
    schedule(pairingTokenRef.current ? 5_000 : 0);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("online", onOnline);
    };
  }, [accessRevoked, identity, manifest.refreshAfterSeconds, refreshManifest]);

  useEffect(() => {
    if (!currentItem || accessRevoked || manifestExpired) return;

    const advance = window.setTimeout(() => {
      if (!preview) {
        void sendPlayback({
          eventId: crypto.randomUUID(),
          itemId: currentItem.id,
          source: currentItem.source,
          campaignId: currentItem.campaignId,
          creativeId: currentItem.creativeId,
          durationSeconds: currentItem.durationSeconds,
          manifestVersion: manifestVersion.current,
          sessionId: sessionId.current,
          playerVersion,
          playedAt: new Date(Date.now() + clockOffsetRef.current).toISOString(),
        });
      }
      setActiveIndex((index) => (index + 1) % manifest.items.length);
    }, currentItem.durationSeconds * 1000);

    return () => {
      window.clearTimeout(advance);
    };
  }, [accessRevoked, currentItem, manifest.items.length, manifestExpired, playerVersion, preview, sendPlayback]);

  if (accessRevoked) {
    return (
      <main className="player-empty player-locked">
        <Waves size={54} aria-hidden="true" />
        <h1>This screen is offline.</h1>
        <p>Reconnect or pair this player again from the NeuseCast Control Room.</p>
      </main>
    );
  }

  if (!currentItem) {
    return (
      <main className="player-empty">
        <Waves size={54} aria-hidden="true" />
        <h1>NeuseCast is connected.</h1>
        <p>Waiting for scheduled content.</p>
      </main>
    );
  }

  if (manifestExpired) {
    return (
      <main className="player-empty">
        <Waves size={54} aria-hidden="true" />
        <h1>NeuseCast is reconnecting.</h1>
        <p>The saved schedule has expired. Playback will resume after this screen receives a current schedule.</p>
      </main>
    );
  }

  return (
    <main className={`player-stage player-theme-${currentItem.theme}`}>
      <div className="player-orbit player-orbit-one" aria-hidden="true" />
      <div className="player-orbit player-orbit-two" aria-hidden="true" />

      <header className="player-header">
        <div className="player-brand">
          <span className="player-brand-icon" aria-hidden="true"><Waves /></span>
          <span><strong>NeuseCast</strong><small>Local screens, connected.</small></span>
        </div>
        <div className="player-status">
          <span className="player-live"><i aria-hidden="true" /> {preview ? "PREVIEW" : "LIVE"}</span>
          <span><MapPin size={17} aria-hidden="true" /> {location}</span>
          <strong>{clock}</strong>
        </div>
      </header>

      <section className="player-slide" key={currentItem.id}>
        <div className="player-copy">
          <div className="player-eyebrow">
            <KindIcon kind={currentItem.kind} />
            {currentItem.eyebrow || kindLabels[currentItem.kind]}
          </div>
          <h1>{currentItem.title}</h1>
          <p>{currentItem.body}</p>
          {currentItem.callToAction ? <div className="player-cta">{currentItem.callToAction}</div> : null}
        </div>

        <div className="player-visual" aria-hidden="true">
          {currentItem.mediaUrl
            ? <div className="player-visual-artwork" style={{ backgroundImage: `url(${JSON.stringify(currentItem.mediaUrl)})` }} />
            : <div className="player-visual-ring"><KindIcon kind={currentItem.kind} /></div>}
          <span>{currentItem.sponsor ?? kindLabels[currentItem.kind]}</span>
        </div>
      </section>

      <footer className="player-footer">
        <span>{manifest.venue.name}</span>
        <span className="player-position">{activeIndex + 1} / {manifest.items.length}</span>
        <span>{preview ? "Control Room playlist preview" : "Eastern Carolina's local screen network"}</span>
      </footer>

      <div className="player-progress" aria-hidden="true">
        <PlayerProgress key={`${manifest.version}:${activeIndex}:${currentItem.id}`} durationSeconds={currentItem.durationSeconds} />
      </div>
    </main>
  );
}
