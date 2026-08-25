import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import type { PlayerAlert, PlayerItem, PlayerWeatherLocation, PlayerWeatherPeriod } from "./types";

const REGIONAL_POINT = {
  latitude: 35.1085,
  longitude: -77.0441,
  label: "Eastern North Carolina",
} as const;

const REGIONAL_WEATHER_STATIONS = [
  { name: "Greenville", stationId: "KPGV" },
  { name: "Washington", stationId: "KOCW" },
  { name: "Kinston", stationId: "KISO" },
  { name: "New Bern", stationId: "KEWN" },
  { name: "Jacksonville", stationId: "KOAJ" },
  { name: "Morehead City", stationId: "KMRH" },
] as const;

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
  const response = await fetch(url, {
    headers: NWS_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`NWS request failed with ${response.status}.`);
  return response.json() as Promise<T>;
}

function fahrenheit(value: number, unitCode: string) {
  return /degc$/iu.test(unitCode) ? (value * 9 / 5) + 32 : value;
}

async function requestRegionalTemperatures(): Promise<PlayerWeatherLocation[]> {
  return Promise.all(REGIONAL_WEATHER_STATIONS.map(async (location) => {
    try {
      const observation = await nwsJson<NwsObservationResponse>(
        `https://api.weather.gov/stations/${location.stationId}/observations/latest`,
      );
      const rawTemperature = observation.properties?.temperature?.value;
      const unitCode = boundedText(observation.properties?.temperature?.unitCode, 80);
      const temperature = typeof rawTemperature === "number" && Number.isFinite(rawTemperature)
        ? Math.round(fahrenheit(rawTemperature, unitCode))
        : null;
      return {
        name: location.name,
        temperature,
        temperatureUnit: "F" as const,
        observedAt: boundedText(observation.properties?.timestamp, 40) || null,
      };
    } catch (error) {
      console.warn(`NeuseCast could not refresh the ${location.name} NWS observation`, error);
      return { name: location.name, temperature: null, temperatureUnit: "F" as const, observedAt: null };
    }
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
  return (alerts.features ?? []).flatMap((feature) => {
    const event = boundedText(feature.properties?.event, 90);
    const severity = boundedText(feature.properties?.severity, 30);
    if (!/warning/iu.test(event) || !["Extreme", "Severe"].includes(severity)) return [];
    const headline = boundedText(feature.properties?.headline, 300) || event;
    const area = boundedText(feature.properties?.areaDesc, 180) || REGIONAL_POINT.label;
    return [{
      id: boundedText(feature.id, 300) || createHash("sha256").update(`${event}|${headline}`).digest("hex"),
      event,
      headline,
      area,
      severity,
      expiresAt: boundedText(feature.properties?.ends, 40)
        || boundedText(feature.properties?.expires, 40)
        || null,
    }];
  }).slice(0, 4);
}

export const getRegionalForecast = unstable_cache(
  requestRegionalForecast,
  ["neusecast", "nws", "regional-forecast-v2", "eastern-north-carolina"],
  { revalidate: 300 },
);

export const getRegionalAlerts = unstable_cache(
  requestRegionalAlerts,
  ["neusecast", "nws", "regional-alerts", "new-bern"],
  { revalidate: 60 },
);

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
    eyebrow: "Eastern North Carolina forecast",
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
    sponsor: "National Weather Service",
    contentCategory: "weather",
    mediaCredit: null,
    weatherPeriods: forecast.periods,
    weatherLocations: forecast.locations,
    expiresAt: current.endsAt,
  };
}
