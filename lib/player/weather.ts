import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import type { PlayerAlert, PlayerItem, PlayerWeatherLocation, PlayerWeatherPeriod } from "./types";
import {
  createLastKnownAlertStore,
  filterUnexpiredAlerts,
  NwsHttpError,
  retryTransientNwsRequest,
} from "./weather-resilience";

const REGIONAL_POINT = {
  latitude: 35.1085,
  longitude: -77.0441,
  label: "Eastern North Carolina",
} as const;

const REGIONAL_WEATHER_STATIONS = [
  { name: "Greenville", stationIds: ["KPGV"] },
  { name: "Washington", stationIds: ["KOCW", "KPGV"] },
  { name: "Kinston", stationIds: ["KISO", "KPGV"] },
  { name: "New Bern", stationIds: ["KEWN", "KNKT"] },
  { name: "Jacksonville", stationIds: ["KOAJ", "KNCA"] },
  { name: "Morehead City", stationIds: ["KMRH", "KNKT"] },
] as const;
const MAX_OBSERVATION_AGE_MS = 2 * 60 * 60 * 1_000;

const NWS_HEADERS = {
  Accept: "application/geo+json",
  "User-Agent": "(neusecast.com, Hello@NeuseCast.com)",
} as const;

type NwsPointsResponse = {
  properties?: { forecast?: string };
};

type NwsForecastResponse = {
  properties?: {
    updated?: string;
    periods?: Array<{
      number?: number;
      name?: string;
      startTime?: string;
      endTime?: string;
      isDaytime?: boolean;
      temperature?: number;
      temperatureUnit?: string;
      probabilityOfPrecipitation?: { value?: number | null };
      windSpeed?: string;
      windDirection?: string;
      shortForecast?: string;
      detailedForecast?: string;
    }>;
  };
};

type NwsAlertsResponse = {
  features?: Array<{
    id?: string;
    properties?: {
      event?: string;
      headline?: string;
      areaDesc?: string;
      severity?: string;
      expires?: string | null;
      ends?: string | null;
    };
  }>;
};

type NwsObservationResponse = {
  properties?: {
    timestamp?: string;
    temperature?: {
      value?: number | null;
      unitCode?: string;
    };
  };
};

type RegionalForecast = {
  updatedAt: string;
  periods: PlayerWeatherPeriod[];
  locations: PlayerWeatherLocation[];
};

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function nwsJson<T>(url: string): Promise<T> {
  return retryTransientNwsRequest(async () => {
    const response = await fetch(url, {
      headers: NWS_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) throw new NwsHttpError(response.status);
    return response.json() as Promise<T>;
  });
}

function fahrenheit(value: number, unitCode: string) {
  return /degc$/iu.test(unitCode) ? (value * 9 / 5) + 32 : value;
}

async function requestRegionalTemperatures(): Promise<PlayerWeatherLocation[]> {
  return Promise.all(REGIONAL_WEATHER_STATIONS.map(async (location) => {
    for (const stationId of location.stationIds) {
      try {
        const observation = await nwsJson<NwsObservationResponse>(
          `https://api.weather.gov/stations/${stationId}/observations/latest`,
        );
        const observedAt = boundedText(observation.properties?.timestamp, 40);
        const observedAtMs = Date.parse(observedAt);
        const rawTemperature = observation.properties?.temperature?.value;
        const unitCode = boundedText(observation.properties?.temperature?.unitCode, 80);
        if (
          typeof rawTemperature !== "number"
          || !Number.isFinite(rawTemperature)
          || !Number.isFinite(observedAtMs)
          || Date.now() - observedAtMs > MAX_OBSERVATION_AGE_MS
        ) continue;
        return {
          name: location.name,
          temperature: Math.round(fahrenheit(rawTemperature, unitCode)),
          temperatureUnit: "F" as const,
          observedAt,
        };
      } catch (error) {
        console.warn(`NeuseCast could not refresh NWS station ${stationId} for ${location.name}`, error);
      }
    }
    return { name: location.name, temperature: null, temperatureUnit: "F" as const, observedAt: null };
  }));
}

async function requestRegionalForecast(): Promise<RegionalForecast> {
  const regionalTemperaturesPromise = requestRegionalTemperatures();
  const point = await nwsJson<NwsPointsResponse>(
    `https://api.weather.gov/points/${REGIONAL_POINT.latitude},${REGIONAL_POINT.longitude}`,
  );
  const forecastUrl = point.properties?.forecast;
  if (!forecastUrl?.startsWith("https://api.weather.gov/")) {
    throw new Error("NWS did not return a valid regional forecast endpoint.");
  }
  const [forecast, locations] = await Promise.all([
    nwsJson<NwsForecastResponse>(forecastUrl),
    regionalTemperaturesPromise,
  ]);
  const periods = (forecast.properties?.periods ?? []).slice(0, 6).flatMap((period) => {
    const name = boundedText(period.name, 40);
    const shortForecast = boundedText(period.shortForecast, 90);
    const startsAt = boundedText(period.startTime, 40);
    const endsAt = boundedText(period.endTime, 40);
    const temperature = Number(period.temperature);
    if (!name || !shortForecast || !startsAt || !endsAt || !Number.isFinite(temperature)) return [];
    return [{
      name,
      temperature,
      temperatureUnit: period.temperatureUnit === "C" ? "C" as const : "F" as const,
      shortForecast,
      windSpeed: boundedText(period.windSpeed, 40),
      windDirection: boundedText(period.windDirection, 12),
      precipitationChance: typeof period.probabilityOfPrecipitation?.value === "number"
        ? Math.max(0, Math.min(100, Math.round(period.probabilityOfPrecipitation.value)))
        : null,
      isDaytime: Boolean(period.isDaytime),
      startsAt,
      endsAt,
    }];
  });
  if (!periods.length) throw new Error("NWS returned no usable forecast periods.");
  return {
    updatedAt: boundedText(forecast.properties?.updated, 40) || periods[0].startsAt,
    periods,
    locations,
  };
}

async function requestRegionalAlerts(): Promise<PlayerAlert[]> {
  const alerts = await nwsJson<NwsAlertsResponse>(
    `https://api.weather.gov/alerts/active?point=${REGIONAL_POINT.latitude},${REGIONAL_POINT.longitude}&status=actual`,
  );
  const now = Date.now();
  return (alerts.features ?? []).flatMap((feature) => {
    const event = boundedText(feature.properties?.event, 90);
    const severity = boundedText(feature.properties?.severity, 30);
    if (!/warning/iu.test(event) || !["Extreme", "Severe"].includes(severity)) return [];
    const headline = boundedText(feature.properties?.headline, 300) || event;
    const area = boundedText(feature.properties?.areaDesc, 180) || REGIONAL_POINT.label;
    const expiresAt = boundedText(feature.properties?.ends, 40)
      || boundedText(feature.properties?.expires, 40);
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return [];
    return [{
      id: boundedText(feature.id, 300) || createHash("sha256").update(`${event}|${headline}`).digest("hex"),
      event,
      headline,
      area,
      severity,
      expiresAt,
    }];
  }).sort((left, right) => {
    const severity = Number(right.severity === "Extreme") - Number(left.severity === "Extreme");
    if (severity) return severity;
    const eventRank = (event: string) => {
      if (/tornado|hurricane|storm surge|flash flood/iu.test(event)) return 0;
      if (/severe thunderstorm/iu.test(event)) return 1;
      return 2;
    };
    const event = eventRank(left.event) - eventRank(right.event);
    if (event) return event;
    return Date.parse(left.expiresAt ?? "") - Date.parse(right.expiresAt ?? "")
      || left.id.localeCompare(right.id);
  }).slice(0, 4);
}

export const getRegionalForecast = unstable_cache(
  requestRegionalForecast,
  ["neusecast", "nws", "regional-forecast-v3", "eastern-north-carolina"],
  { revalidate: 300 },
);

const getCachedRegionalAlerts = unstable_cache(
  requestRegionalAlerts,
  ["neusecast", "nws", "regional-alerts", "new-bern"],
  { revalidate: 60 },
);

const lastKnownRegionalAlerts = createLastKnownAlertStore();

export async function getRegionalAlerts(): Promise<PlayerAlert[]> {
  try {
    const alerts = await getCachedRegionalAlerts();
    lastKnownRegionalAlerts.remember(alerts);
    return filterUnexpiredAlerts(alerts);
  } catch (error) {
    const fallback = lastKnownRegionalAlerts.current();
    if (fallback === null) throw error;
    console.warn("NeuseCast is retaining the last-known NWS warning state after a refresh failure", error);
    return fallback;
  }
}

export function regionalWeatherItem(forecast: RegionalForecast): PlayerItem {
  const current = forecast.periods[0];
  const next = forecast.periods[1];
  const id = createHash("sha256")
    .update(`${forecast.locations.map((location) => `${location.name}:${location.temperature}`).join("|")}::${forecast.periods.map((period) => (
      `${period.startsAt}:${period.name}:${period.temperature}:${period.shortForecast}:${period.precipitationChance}`
    )).join("|")}`)
    .digest("hex")
    .slice(0, 24);
  const wind = [current.windDirection, current.windSpeed].filter(Boolean).join(" ");
  const precipitation = current.precipitationChance === null ? "" : `${current.precipitationChance}% rain chance`;
  return {
    id: `nws-weather-${id}`,
    kind: "weather",
    source: "generated_content",
    campaignId: null,
    creativeId: null,
    durationSeconds: 60,
    eyebrow: "Captain 97.1 FM Weather Center",
    title: `${current.name}: ${current.shortForecast}`,
    body: [
      `${current.temperature}°${current.temperatureUnit}`,
      wind,
      precipitation,
      next ? `${next.name}: ${next.temperature}°${next.temperatureUnit}, ${next.shortForecast}` : "",
    ].filter(Boolean).join(" • "),
    callToAction: null,
    mediaUrl: null,
    theme: current.isDaytime ? "blue" : "navy",
    sponsor: "Captain 97.1 FM Weather Center · National Weather Service",
    contentCategory: "weather",
    mediaCredit: null,
    weatherPeriods: forecast.periods,
    weatherLocations: forecast.locations,
    expiresAt: current.endsAt,
  };
}
