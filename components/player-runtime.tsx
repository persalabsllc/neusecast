"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  CalendarDays,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  History,
  Lightbulb,
  MapPin,
  Maximize2,
  Newspaper,
  Radio,
  Store,
  Sun,
  TriangleAlert,
  Waves,
  Wind,
} from "lucide-react";
import type { PlayerItem, PlayerManifest } from "@/lib/player/types";
import { NewsroomBroadcast } from "@/components/newsroom-broadcast";

const kindLabels: Record<PlayerItem["kind"], string> = {
  advertisement: "Local business",
  host: "At this location",
  weather: "Local weather",
  news: "Local news",
  event: "Around town",
  history: "Local history",
  trivia: "Quick trivia",
  community: "Eastern Carolina",
  ident: "NeuseCast Network",
};

const EVERGREEN_FILLER_CATEGORIES = new Set([
  "did_you_know",
  "fact",
  "history",
  "on_this_day",
  "place_spotlight",
  "then_and_now",
  "river_and_coast",
]);
const EVERGREEN_REPLAY_GAP_MS = 90 * 60 * 1_000;
const NEWSROOM_REPLAY_GAP_MS = 55 * 60 * 1_000;

function isEvergreenFiller(item: PlayerItem) {
  return item.source === "generated_content"
    && EVERGREEN_FILLER_CATEGORIES.has(item.contentCategory ?? "");
}

function KindIcon({ kind }: { kind: PlayerItem["kind"] }) {
  if (kind === "weather") return <CloudSun />;
  if (kind === "news") return <Newspaper />;
  if (kind === "history") return <History />;
  if (kind === "trivia") return <Lightbulb />;
  if (kind === "event") return <CalendarDays />;
  if (kind === "host") return <Store />;
  return <Radio />;
}

function extractTemperature(value: string) {
  const degreeValue = value.match(/(-?\d{1,3})\s*°(?:\s*f)?/iu)?.[1];
  if (degreeValue) return `${degreeValue}°`;
  const forecastValue = value.match(/\b(?:high|low|near|around)\s+(?:near\s+|around\s+|of\s+)?(-?\d{1,3})\b/iu)?.[1];
  return forecastValue ? `${forecastValue}°` : null;
}

function ForecastIcon({ forecast }: { forecast: string }) {
  const normalized = forecast.toLowerCase();
  if (/thunder|lightning|storm/u.test(normalized)) return <CloudLightning />;
  if (/snow|sleet|flurr/u.test(normalized)) return <CloudSnow />;
  if (/rain|shower|drizzle/u.test(normalized)) return <CloudRain />;
  if (/fog|mist|haze/u.test(normalized)) return <CloudFog />;
  if (/wind|breez|gust/u.test(normalized)) return <Wind />;
  if (/sunny|clear/u.test(normalized)) return <Sun />;
  return <CloudSun />;
}

type WeatherCondition = "storm" | "snow" | "rain" | "fog" | "wind" | "clear" | "cloudy";

function weatherCondition(forecast: string): WeatherCondition {
  const normalized = forecast.toLowerCase();
  if (/thunder|lightning|storm|tornado/u.test(normalized)) return "storm";
  if (/snow|sleet|flurr|ice|freez/u.test(normalized)) return "snow";
  if (/rain|shower|drizzle/u.test(normalized)) return "rain";
  if (/fog|mist|haze/u.test(normalized)) return "fog";
  if (/wind|breez|gust/u.test(normalized)) return "wind";
  if (/sunny|clear|hot/u.test(normalized)) return "clear";
  return "cloudy";
}

function WeatherBroadcast({ item, location }: { item: PlayerItem; location: string }) {
  const forecast = `${item.title} ${item.body}`;
  const periods = item.weatherPeriods ?? [];
  const currentPeriod = periods[0];
  const currentForecast = currentPeriod?.shortForecast ?? item.title;
  const condition = weatherCondition(currentForecast);
  const temperature = currentPeriod
    ? `${currentPeriod.temperature}°`
    : extractTemperature(forecast);
  const locationTemperatures = new Map((item.weatherLocations ?? []).map((weatherLocation) => [
    weatherLocation.name,
    weatherLocation.temperature === null ? "--" : `${weatherLocation.temperature}°`,
  ]));
  const mapTemperature = (name: string, fallback = "--") => locationTemperatures.get(name) ?? fallback;
  const tickerText = periods.length
    ? periods.map((period) => (
      `${period.name}: ${period.temperature}° · ${period.shortForecast}${period.precipitationChance === null ? "" : ` · ${period.precipitationChance}% rain`}`
    )).join("     •     ")
    : item.body;

  return (
    <div className={`player-weather-broadcast player-weather-condition-${condition}`}>
      <section className="player-weather-segment player-weather-segment-current">
        <div className="player-weather-broadcast-copy">
          <span>From the Captain 97.1 FM Weather Center</span>
          <h1>{currentPeriod?.name ?? "Right now"}</h1>
          <p>{currentPeriod?.shortForecast ?? item.title}</p>
          <div className="player-weather-facts">
            <strong>{temperature ?? "Forecast"}</strong>
            <span>{currentPeriod?.windDirection} {currentPeriod?.windSpeed}</span>
            <span>{currentPeriod?.precipitationChance ?? 0}% rain chance</span>
          </div>
        </div>
        <div className="player-weather-hero" aria-hidden="true">
          <span className="player-weather-sun" />
          <span className="player-weather-cloud"><ForecastIcon forecast={currentForecast} /></span>
          <span className="player-weather-wind player-weather-wind-one" />
          <span className="player-weather-wind player-weather-wind-two" />
          <span className="player-weather-rain" />
          <span className="player-weather-snow" />
          <span className="player-weather-fog player-weather-fog-one" />
          <span className="player-weather-fog player-weather-fog-two" />
          <span className="player-weather-lightning" />
          <i>Live NWS forecast</i>
        </div>
      </section>

      <section className="player-weather-segment player-weather-segment-map">
        <div className="player-weather-map-heading">
          <span>Captain 97.1 FM Weather Center</span>
          <h1>Eastern North Carolina</h1>
          <p>{currentPeriod?.shortForecast ?? item.title}</p>
        </div>
        <div className="player-weather-map" aria-hidden="true">
          <svg viewBox="0 0 820 430" role="img">
            <title>Stylized Eastern North Carolina regional weather map</title>
            <path className="player-weather-map-land" d="M42 50H550L615 82 602 118 654 148 625 181 682 212 645 250 702 286 662 326 711 365 675 408H42Z" />
            <path className="player-weather-map-coast" d="M550 50 615 82 602 118 654 148 625 181 682 212 645 250 702 286 662 326 711 365 675 408" />
            <path className="player-weather-map-river" d="M104 185C218 154 282 211 371 188S522 129 621 164" />
            <g className="player-weather-map-band">
              <path d="M-70 360C95 305 172 213 300 182S510 119 895 66" />
              <path d="M-90 405C100 347 192 262 325 229S575 153 910 112" />
            </g>
            <g className="player-weather-map-cities">
              <circle cx="245" cy="98" r="7" /><text x="261" y="104">Greenville · {mapTemperature("Greenville")}</text>
              <circle cx="410" cy="118" r="7" /><text x="426" y="124">Washington · {mapTemperature("Washington")}</text>
              <circle cx="191" cy="216" r="7" /><text x="207" y="222">Kinston · {mapTemperature("Kinston")}</text>
              <circle className="is-primary" cx="428" cy="235" r="10" /><text className="is-primary" x="448" y="242">New Bern · {mapTemperature("New Bern", temperature ?? "--")}</text>
              <circle cx="240" cy="337" r="7" /><text x="256" y="343">Jacksonville · {mapTemperature("Jacksonville")}</text>
              <circle cx="555" cy="344" r="7" /><text x="571" y="350">Morehead City · {mapTemperature("Morehead City")}</text>
            </g>
          </svg>
          <div className="player-weather-map-key"><ForecastIcon forecast={currentForecast} /><span>{currentPeriod?.shortForecast ?? "Regional forecast"}</span></div>
        </div>
      </section>

      <section className="player-weather-segment player-weather-segment-periods">
        <div className="player-weather-section-heading">
          <span>Captain 97.1 FM Weather Center</span>
          <h1>The next 36 hours</h1>
        </div>
        <div className="player-weather-periods">
          {periods.slice(0, 4).map((period) => (
            <div key={`${period.name}:${period.startsAt}`}>
              <span><ForecastIcon forecast={period.shortForecast} /></span>
              <small>{period.name}</small>
              <strong>{period.temperature}°</strong>
              <p>{period.shortForecast}</p>
              <em>{period.precipitationChance === null ? period.windSpeed : `${period.precipitationChance}% rain · ${period.windSpeed}`}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="player-weather-segment player-weather-segment-outlook">
        <div className="player-weather-section-heading">
          <span>Captain 97.1 FM Weather Center</span>
          <h1>Your regional outlook</h1>
          <p>Updated live from the National Weather Service for Eastern North Carolina.</p>
        </div>
        <div className="player-weather-outlook-grid">
          {periods.slice(0, 3).map((period) => (
            <article key={`${period.name}:${period.endsAt}`}>
              <ForecastIcon forecast={period.shortForecast} />
              <div><small>{period.name}</small><strong>{period.temperature}°</strong></div>
              <p>{period.shortForecast}</p>
            </article>
          ))}
        </div>
        <div className="player-weather-source">National Weather Service · Live regional forecast</div>
      </section>

      <div className="player-weather-ticker" aria-hidden="true">
        <strong>97.1 WEATHER</strong>
        <div>
          <span>{location} &nbsp; • &nbsp; {tickerText}</span>
          <span>{location} &nbsp; • &nbsp; {tickerText}</span>
        </div>
      </div>
    </div>
  );
}

function NewsSignal() {
  return (
    <div className="player-news-signal">
      <span className="player-news-signal-ring player-news-signal-ring-one" />
      <span className="player-news-signal-ring player-news-signal-ring-two" />
      <span className="player-news-signal-ring player-news-signal-ring-three" />
      <Newspaper />
    </div>
  );
}

function NetworkIdent({ variant }: { variant: string | null | undefined }) {
  const identVariant = variant?.replace("network_ident_", "") ?? "combo";
  const logo = (
    <svg className="player-ident-logo" viewBox="0 0 120 120" role="img" aria-label="NeuseCast">
      <rect x="13" y="14" width="94" height="78" rx="24" />
      <path d="M29 67c10 0 10-18 20-18s10 18 20 18 10-18 20-18" />
      <path d="M47 105h26" />
    </svg>
  );

  if (identVariant === "logo") {
    return (
      <div className="player-ident player-ident-logo-sting">
        <div className="player-ident-rings" aria-hidden="true"><i /><i /><i /></div>
        {logo}
        <strong>NeuseCast</strong>
        <span>Local screens, connected.</span>
      </div>
    );
  }

  if (identVariant === "network") {
    return (
      <div className="player-ident player-ident-network-id">
        <div className="player-ident-scan" aria-hidden="true" />
        <span>This is the</span>
        <h1>NeuseCast<br />TV Network</h1>
        <p>Serving Eastern North Carolina</p>
        <strong>NeuseCast.com</strong>
      </div>
    );
  }

  return (
    <div className="player-ident player-ident-combo">
      <div className="player-ident-network-lines" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>
      <div className="player-ident-combo-mark">{logo}</div>
      <div className="player-ident-combo-copy">
        <span>Eastern North Carolina&apos;s</span>
        <h1>NeuseCast<br />TV Network</h1>
        <p>Local screens, connected.</p>
        <strong>NeuseCast.com</strong>
      </div>
    </div>
  );
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
  publicFeed = false,
  embedded = false,
}: {
  initialManifest: PlayerManifest;
  initialItemId?: string | null;
  pairingToken?: string;
  playerKey: string;
  playerVersion?: string;
  preview?: boolean;
  publicFeed?: boolean;
  embedded?: boolean;
}) {
  const [manifest, setManifest] = useState(initialManifest);
  const [activeIndex, setActiveIndex] = useState(() => {
    const reportedIndex = initialManifest.items.findIndex((item) => item.id === initialItemId);
    return Math.max(0, reportedIndex);
  });
  const [playbackGeneration, setPlaybackGeneration] = useState(0);
  const [clock, setClock] = useState("");
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [identity] = useState<DeviceIdentity | null>(() => {
    if (preview || publicFeed || typeof window === "undefined") return null;
    return getOrCreateDeviceIdentity(playerKey);
  });
  const [clockSync, setClockSync] = useState(() => ({
    offsetMs: clockOffset(initialManifest.serverTime),
    timeZone: initialManifest.venue.timeZone || DEFAULT_TIME_ZONE,
  }));
  const [serverNowMs, setServerNowMs] = useState(() => Date.now() + clockOffset(initialManifest.serverTime));
  const initialManifestAgeMs = manifestAgeAtServerTime(initialManifest);
  const [manifestExpired, setManifestExpired] = useState(
    () => initialManifestAgeMs > MAX_CACHED_MANIFEST_AGE_MS,
  );
  const [playedAdvertisements, setPlayedAdvertisements] = useState(() => ({
    manifestVersion: initialManifest.version,
    ids: new Set<string>(),
  }));
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
  const recentEvergreenPlaysRef = useRef(new Map<string, number>());
  const lastNewsroomPlayRef = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const playableItems = useMemo(() => manifest.items.filter((item) => {
    if (
      !preview
      && item.kind === "advertisement"
      && playedAdvertisements.manifestVersion === manifest.version
      && playedAdvertisements.ids.has(item.id)
    ) return false;
    if (!item.expiresAt) return true;
    const expiresAt = Date.parse(item.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > serverNowMs;
  }), [manifest.items, manifest.version, playedAdvertisements, preview, serverNowMs]);
  const playableItemsRef = useRef(playableItems);
  const displayedIndex = activeIndex < playableItems.length ? activeIndex : 0;
  const currentItem = playableItems[displayedIndex] ?? null;
  const playbackItemKey = currentItem
    ? `${currentItem.id}:${currentItem.durationSeconds}:${playbackGeneration}`
    : `empty:${playbackGeneration}`;
  const playbackItemRef = useRef(currentItem);
  const isNews = currentItem?.kind === "news";
  const isNewsroom = Boolean(currentItem?.source === "newsroom" && currentItem.newsroomEdition);
  const isWeather = currentItem?.kind === "weather";
  const isIdent = currentItem?.kind === "ident";
  const hasMedia = Boolean(currentItem?.mediaUrl);
  const isEditorialPhoto = Boolean(
    currentItem?.source === "generated_content"
    && currentItem.mediaUrl
    && ["did_you_know", "fact", "history", "on_this_day", "place_spotlight", "then_and_now", "river_and_coast"].includes(currentItem.contentCategory ?? ""),
  );
  const visualTemplate = ["editorial_split", "photo_feature", "place_card", "archival", "fact_reveal"]
    .includes(currentItem?.visualTemplate ?? "")
    ? currentItem?.visualTemplate
    : "editorial_split";
  const activeAlerts = useMemo(() => (manifest.alerts ?? []).filter((alert) => {
    if (!alert.expiresAt) return true;
    const expiresAt = Date.parse(alert.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > serverNowMs;
  }), [manifest.alerts, serverNowMs]);

  useEffect(() => {
    playableItemsRef.current = playableItems;
  }, [playableItems]);

  useEffect(() => {
    playbackItemRef.current = currentItem;
  }, [currentItem]);

  const location = useMemo(
    () => [manifest.venue.city, manifest.venue.state].filter(Boolean).join(", "),
    [manifest.venue.city, manifest.venue.state],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void stageRef.current?.requestFullscreen();
  }, []);

  const syncServerClock = useCallback((serverTime: string, timeZone?: string) => {
    const offsetMs = clockOffset(serverTime);
    clockOffsetRef.current = offsetMs;
    setServerNowMs(Date.now() + offsetMs);
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
    if ((!identity && !publicFeed) || refreshingManifest.current) return false;
    refreshingManifest.current = true;

    try {
      const response = await fetchWithTimeout(publicFeed ? "/api/watch/manifest" : `/api/player/${playerKey}/manifest`, {
        cache: "no-store",
        headers: identity ? authenticatedHeaders(identity) : undefined,
      }).catch(() => null);

      if (!response?.ok) {
        if (!publicFeed && response && AUTHORIZATION_FAILURE_STATUSES.has(response.status)) {
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
  }, [anchorManifestFreshness, identity, playerKey, publicFeed, revokePlayerAccess, syncServerClock]);

  useEffect(() => {
    if (preview || (!identity && !publicFeed)) return;
    const initialize = window.setTimeout(() => {
      if (!publicFeed) {
        sessionId.current = crypto.randomUUID();
        playbackQueue.current = readPlaybackQueue(playerKey);
      }
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
  }, [anchorManifestFreshness, identity, initialManifest, playerKey, preview, publicFeed, syncServerClock]);

  useEffect(() => {
    if (preview || publicFeed || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/neusecast-player-sw.js", { scope: "/player/" }).catch(() => undefined);
  }, [preview, publicFeed]);

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
      const now = Date.now() + clockSync.offsetMs;
      setServerNowMs(now);
      setClock(formatter.format(new Date(now)));
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
    if ((!identity && !publicFeed) || accessRevoked) return;
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
    // Physical players authenticate and snapshot manifests for proof-of-play.
    // The public channel uses the same refresh loop without device enrollment
    // or playback reporting.
    schedule(!publicFeed && pairingTokenRef.current ? 5_000 : 0);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("online", onOnline);
    };
  }, [accessRevoked, identity, manifest.refreshAfterSeconds, publicFeed, refreshManifest]);

  useEffect(() => {
    if (!playbackItemRef.current || accessRevoked || manifestExpired) return;

    const advance = window.setTimeout(() => {
      const playedItem = playbackItemRef.current;
      if (!playedItem) return;

      if (!preview && !publicFeed) {
        if (playedItem.kind === "advertisement") {
          setPlayedAdvertisements((current) => {
            const currentManifestVersion = manifestVersion.current;
            const ids = current.manifestVersion === currentManifestVersion
              ? new Set(current.ids)
              : new Set<string>();
            ids.add(playedItem.id);
            return { manifestVersion: currentManifestVersion, ids };
          });
        }
        void sendPlayback({
          eventId: crypto.randomUUID(),
          itemId: playedItem.id,
          source: playedItem.source,
          campaignId: playedItem.campaignId,
          creativeId: playedItem.creativeId,
          durationSeconds: playedItem.durationSeconds,
          manifestVersion: manifestVersion.current,
          sessionId: sessionId.current,
          playerVersion,
          playedAt: new Date(Date.now() + clockOffsetRef.current).toISOString(),
        }).then(() => {
          if (playedItem.kind === "advertisement") void refreshManifest();
        });
      }
      const completedAt = Date.now();
      const recentEvergreenPlays = recentEvergreenPlaysRef.current;
      for (const [itemId, playedAt] of recentEvergreenPlays) {
        if (completedAt - playedAt >= EVERGREEN_REPLAY_GAP_MS) recentEvergreenPlays.delete(itemId);
      }
      if (isEvergreenFiller(playedItem)) recentEvergreenPlays.set(playedItem.id, completedAt);
      if (playedItem.source === "newsroom") lastNewsroomPlayRef.current = completedAt;

      const currentPlayableItems = playableItemsRef.current;
      if (currentPlayableItems.length === 0) {
        setActiveIndex(0);
        setPlaybackGeneration((current) => current + 1);
        return;
      }
      const playedIndex = currentPlayableItems.findIndex((item) => item.id === playedItem.id);
      const currentIndex = playedIndex >= 0 ? playedIndex : currentPlayableItems.length - 1;
      let nextIndex = (currentIndex + 1) % currentPlayableItems.length;
      for (let offset = 0; offset < currentPlayableItems.length; offset += 1) {
        const candidateIndex = (currentIndex + 1 + offset) % currentPlayableItems.length;
        const candidate = currentPlayableItems[candidateIndex];
        const lastPlayedAt = recentEvergreenPlays.get(candidate.id);
        const newsroomBlocked = candidate.source === "newsroom"
          && completedAt - lastNewsroomPlayRef.current < NEWSROOM_REPLAY_GAP_MS;
        if (
          !newsroomBlocked
          && (!isEvergreenFiller(candidate) || !lastPlayedAt || completedAt - lastPlayedAt >= EVERGREEN_REPLAY_GAP_MS)
        ) {
          nextIndex = candidateIndex;
          break;
        }
      }
      setActiveIndex(nextIndex);
      // A generation change remounts timed children even when a one-item
      // playlist necessarily selects the same item again.
      setPlaybackGeneration((current) => current + 1);
    }, playbackItemRef.current.durationSeconds * 1000);

    return () => {
      window.clearTimeout(advance);
    };
  }, [accessRevoked, manifestExpired, playbackItemKey, playerVersion, preview, publicFeed, refreshManifest, sendPlayback]);

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

  const playerStyle = {
    "--player-slide-duration": `${currentItem.durationSeconds}s`,
  } as CSSProperties;

  return (
    <div ref={stageRef} className={`player-viewport${embedded ? " player-viewport-embedded" : ""}`}>
      <main
        className={`player-stage player-theme-${currentItem.theme} player-kind-${currentItem.kind} player-template-${visualTemplate}${hasMedia ? " player-has-media" : ""}${isEditorialPhoto ? " player-editorial-photo" : ""}${isNewsroom ? " player-newsroom-package" : ""}${activeAlerts.length ? " player-has-alert" : ""}${embedded ? " player-embedded" : ""}`}
        style={playerStyle}
      >
      <div className="player-orbit player-orbit-one" aria-hidden="true" />
      <div className="player-orbit player-orbit-two" aria-hidden="true" />

      <header className="player-header">
        <div className="player-brand">
          <span className="player-brand-icon" aria-hidden="true"><Waves /></span>
          <span><strong>NeuseCast</strong><small>Local screens, connected.</small></span>
        </div>
        <div className="player-status">
          <span className="player-live"><i aria-hidden="true" /> {publicFeed ? "NETWORK LIVE" : preview ? "PREVIEW" : "LIVE"}</span>
          <span><MapPin size={17} aria-hidden="true" /> {location}</span>
          <strong>{clock}</strong>
          {embedded ? (
            <button className="player-fullscreen" type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
              <Maximize2 aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <section className={`player-slide player-slide-${currentItem.kind}`} key={playbackItemKey}>
        {isNewsroom && currentItem.newsroomEdition ? (
          <NewsroomBroadcast
            edition={currentItem.newsroomEdition}
            durationSeconds={currentItem.durationSeconds}
            location={currentItem.locationLabel ?? "Eastern North Carolina"}
          />
        ) : isIdent ? (
          <NetworkIdent variant={currentItem.contentCategory} />
        ) : isWeather ? (
          <WeatherBroadcast item={currentItem} location="Eastern North Carolina" />
        ) : (
          <>
          <div className="player-copy">
          {isNews ? <div className="player-news-strap"><span>Captain 97.1 FM News Desk</span> Local update</div> : null}
          <div className="player-eyebrow">
            <KindIcon kind={currentItem.kind} />
            {currentItem.eyebrow || kindLabels[currentItem.kind]}
          </div>
          <h1>{currentItem.title}</h1>
          <p>{currentItem.body}</p>
          {currentItem.locationLabel ? <div className="player-location-tag"><MapPin aria-hidden="true" /> {currentItem.locationLabel}</div> : null}
          {currentItem.callToAction ? <div className="player-cta">{currentItem.callToAction}</div> : null}
        </div>

        <div className="player-visual" aria-hidden="true">
          {currentItem.mediaUrl
              ? (
                <div className="player-visual-artwork">
                  <div
                    className="player-visual-artwork-image"
                    style={{ backgroundImage: `url(${JSON.stringify(currentItem.mediaUrl)})` }}
                  />
                  <div className="player-visual-artwork-shade" />
                </div>
              )
              : isNews
                ? <NewsSignal />
                : <div className="player-visual-ring"><KindIcon kind={currentItem.kind} /></div>}
          <span>{currentItem.sponsor ?? kindLabels[currentItem.kind]}</span>
          {currentItem.mediaCredit ? <small className="player-media-credit">{currentItem.mediaCredit}</small> : null}
        </div>
          </>
        )}

        {isNews && !isNewsroom ? (
          <div className="player-news-ticker" aria-hidden="true">
            <strong>LOCAL UPDATE</strong>
            <div>
              <span>{currentItem.title} &nbsp; • &nbsp; {currentItem.body} &nbsp; • &nbsp; Source: {currentItem.sponsor ?? "NeuseCast Newsroom"}</span>
              <span>{currentItem.title} &nbsp; • &nbsp; {currentItem.body} &nbsp; • &nbsp; Source: {currentItem.sponsor ?? "NeuseCast Newsroom"}</span>
            </div>
          </div>
        ) : null}
      </section>

      {activeAlerts.length ? (
        <div className="player-alert-ticker" role="status" aria-live="polite">
          <strong><TriangleAlert aria-hidden="true" /> Weather warning</strong>
          <div>
            {[...activeAlerts, ...activeAlerts].map((alert, index) => (
              <span key={`${alert.id}:${index}`}>
                <b>{alert.event}</b> — {alert.headline} — {alert.area}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="player-footer">
        <span>{manifest.venue.name}</span>
        <span className="player-position">{displayedIndex + 1} / {playableItems.length}</span>
        <span>{publicFeed ? "Network-wide feed · Local host posts excluded" : preview ? "Control Room playlist preview" : "Eastern Carolina's local screen network"}</span>
      </footer>

      <div className="player-progress" aria-hidden="true">
        <PlayerProgress key={playbackItemKey} durationSeconds={currentItem.durationSeconds} />
      </div>
      </main>
    </div>
  );
}
