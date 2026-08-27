import "server-only";

import type { WeatherCenterPeriod, WeatherCenterSnapshot } from "./types";

const PRIMARY_POINT = { latitude: 35.1085, longitude: -77.0441 };
const WEATHER_STATIONS = [
  ["Greenville", "KPGV"],
  ["Washington", "KOCW"],
  ["Kinston", "KISO"],
  ["New Bern", "KEWN"],
  ["Jacksonville", "KOAJ"],
  ["Morehead City", "KMRH"],
] as const;
const NWS_HEADERS = {
  Accept: "application/geo+json",
  "User-Agent": "NeuseCast Weather Center (hello@neusecast.com)",
};
const RADAR_IMAGE_URL = "https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer/exportImage?bbox=-78.6%2C33.9%2C-75.1%2C36.5&bboxSR=4326&imageSR=4326&size=1280%2C720&format=png32&transparent=true&f=image";

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown, maximum = 1_000) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, maximum) : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function json(url: string, timeout = 8_000) {
  const response = await fetch(url, {
    headers: url.startsWith("https://api.weather.gov/") ? NWS_HEADERS : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}.`);
  return response.json() as Promise<unknown>;
}

function fahrenheit(value: number | null, unitCode: string) {
  if (value === null) return null;
  return Math.round(/degc$/iu.test(unitCode) ? (value * 9 / 5) + 32 : value);
}

function percent(value: number | null) {
  return value === null ? null : Math.max(0, Math.min(100, Math.round(value)));
}

function periods(payload: unknown, maximum: number): WeatherCenterPeriod[] {
  return list(object(payload).properties && object(object(payload).properties).periods)
    .slice(0, maximum)
    .flatMap((raw) => {
      const period = object(raw);
      const temperature = number(period.temperature);
      const startsAt = string(period.startTime, 64);
      const endsAt = string(period.endTime, 64);
      if (temperature === null || !startsAt || !endsAt) return [];
      return [{
        name: string(period.name, 60) || "Forecast",
        startsAt,
        endsAt,
        temperature: Math.round(temperature),
        temperatureUnit: period.temperatureUnit === "C" ? "C" as const : "F" as const,
        shortForecast: string(period.shortForecast, 120) || "Forecast unavailable",
        detailedForecast: string(period.detailedForecast, 800),
        precipitationChance: percent(number(object(period.probabilityOfPrecipitation).value)),
        windSpeed: string(period.windSpeed, 60),
        windDirection: string(period.windDirection, 20),
        iconUrl: string(period.icon, 500) || null,
        isDaytime: period.isDaytime === true,
      }];
    });
}

async function observation(stationId: string) {
  const payload = object(await json(`https://api.weather.gov/stations/${stationId}/observations/latest`));
  const properties = object(payload.properties);
  const temperature = object(properties.temperature);
  const heatIndex = object(properties.heatIndex);
  const windChill = object(properties.windChill);
  const humidity = object(properties.relativeHumidity);
  const windSpeed = object(properties.windSpeed);
  const windDirection = object(properties.windDirection);
  const temp = fahrenheit(number(temperature.value), string(temperature.unitCode));
  const apparent = fahrenheit(number(heatIndex.value) ?? number(windChill.value), string(heatIndex.unitCode) || string(windChill.unitCode));
  const speedMps = number(windSpeed.value);
  const directionDegrees = number(windDirection.value);
  const compass = directionDegrees === null ? "" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(directionDegrees / 45) % 8];
  return {
    temperature: temp,
    feelsLike: apparent ?? temp,
    humidity: percent(number(humidity.value)),
    condition: string(properties.textDescription, 100) || "Current conditions",
    windSpeed: speedMps === null ? "" : `${Math.round(speedMps * 2.23694)} mph`,
    windDirection: compass,
    observedAt: string(properties.timestamp, 64) || null,
  };
}

async function locationTemperatures() {
  return Promise.all(WEATHER_STATIONS.map(async ([name, stationId]) => {
    try {
      const current = await observation(stationId);
      return { name, temperature: current.temperature, observedAt: current.observedAt };
    } catch {
      return { name, temperature: null, observedAt: null };
    }
  }));
}

async function alerts() {
  const payload = object(await json(`https://api.weather.gov/alerts/active?point=${PRIMARY_POINT.latitude},${PRIMARY_POINT.longitude}`));
  return list(payload.features).slice(0, 8).flatMap((raw) => {
    const feature = object(raw);
    const properties = object(feature.properties);
    const event = string(properties.event, 100);
    const expiresAt = string(properties.ends, 64) || string(properties.expires, 64);
    if (!event || !expiresAt || Date.parse(expiresAt) <= Date.now()) return [];
    return [{
      id: string(feature.id, 500) || `${event}-${expiresAt}`,
      event,
      headline: string(properties.headline, 360) || event,
      area: string(properties.areaDesc, 240) || "Eastern North Carolina",
      severity: string(properties.severity, 40) || "Unknown",
      expiresAt,
    }];
  });
}

async function marineForecast() {
  try {
    const payload = object(await json("https://api.weather.gov/zones/forecast/AMZ137/forecast"));
    return list(object(payload.properties).periods).slice(0, 4).map((raw) => {
      const period = object(raw);
      const forecast = string(period.detailedForecast, 700) || string(period.shortForecast, 700);
      const windMatch = forecast.match(/(?:winds?|wind)\s+([^.;]+)/iu);
      return {
        name: string(period.name, 80) || "Neuse and Pamlico waters",
        forecast,
        wind: windMatch?.[1]?.trim().slice(0, 100) ?? "See marine forecast",
      };
    });
  } catch {
    return [];
  }
}

async function tidePredictions() {
  try {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
    const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=NeuseCast&begin_date=${today}&end_date=${today}&datum=MLLW&station=8655133&time_zone=lst_ldt&units=english&interval=hilo&format=json`;
    const payload = object(await json(url));
    return list(payload.predictions).slice(0, 6).flatMap((raw) => {
      const prediction = object(raw);
      const type = prediction.type === "H" ? "high" as const : prediction.type === "L" ? "low" as const : null;
      if (!type) return [];
      return [{ time: string(prediction.t, 40), type, heightFeet: number(Number(prediction.v)) }];
    });
  } catch {
    return [];
  }
}

export async function fetchWeatherCenterSnapshot(input: {
  market: string;
  primaryLocation: string;
  sponsorLabel: string;
  now?: Date;
}): Promise<WeatherCenterSnapshot> {
  const now = input.now ?? new Date();
  const pointPayload = object(await json(`https://api.weather.gov/points/${PRIMARY_POINT.latitude},${PRIMARY_POINT.longitude}`));
  const point = object(pointPayload.properties);
  const forecastUrl = string(point.forecast, 500);
  const hourlyUrl = string(point.forecastHourly, 500);
  if (!forecastUrl.startsWith("https://api.weather.gov/") || !hourlyUrl.startsWith("https://api.weather.gov/")) {
    throw new Error("The National Weather Service did not provide forecast endpoints.");
  }
  const [forecastPayload, hourlyPayload, current, locations, activeAlerts, marine, tides] = await Promise.all([
    json(forecastUrl),
    json(hourlyUrl),
    observation("KEWN"),
    locationTemperatures(),
    alerts(),
    marineForecast(),
    tidePredictions(),
  ]);
  const forecast = periods(forecastPayload, 14);
  const hourly = periods(hourlyPayload, 12);
  if (!forecast.length || !hourly.length) throw new Error("The National Weather Service returned an empty forecast.");
  const forecastUpdatedAt = string(object(object(forecastPayload).properties).updated, 64) || forecast[0].startsAt;
  const candidateExpiry = Date.parse(forecast[0].endsAt);
  const validUntil = new Date(Math.min(
    Number.isFinite(candidateExpiry) ? candidateExpiry : now.getTime() + 3 * 60 * 60_000,
    now.getTime() + 6 * 60 * 60_000,
  ));
  return {
    version: 1,
    issuedAt: now.toISOString(),
    validUntil: validUntil.toISOString(),
    market: input.market,
    primaryLocation: input.primaryLocation,
    sponsorLabel: input.sponsorLabel,
    current,
    forecast,
    hourly,
    locations,
    alerts: activeAlerts,
    marine,
    tides,
    radar: {
      imageUrl: RADAR_IMAGE_URL,
      sourceUrl: "https://radar.weather.gov/",
      updatedEveryMinutes: 5,
    },
    tropical: {
      message: "Official tropical outlooks and storm information are supplied by the National Hurricane Center.",
      sourceUrl: "https://www.nhc.noaa.gov/",
    },
    sources: [
      { name: "National Weather Service", url: "https://www.weather.gov/mhx/", updatedAt: forecastUpdatedAt },
      { name: "NOAA MRMS Radar", url: "https://radar.weather.gov/", updatedAt: now.toISOString() },
      { name: "NOAA Tides & Currents · Oriental, Neuse River", url: "https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=8655133", updatedAt: now.toISOString() },
    ],
  };
}

export function generatePresenterScript(snapshot: WeatherCenterSnapshot) {
  const currentPeriod = snapshot.forecast[0];
  const nextPeriod = snapshot.forecast[1];
  const regional = snapshot.locations.filter((location) => location.temperature !== null)
    .map((location) => `${location.name}, ${location.temperature} degrees`)
    .join("; ");
  const alertCopy = snapshot.alerts.length
    ? `We are tracking ${snapshot.alerts.length === 1 ? "one active alert" : `${snapshot.alerts.length} active alerts`}. ${snapshot.alerts.map((alert) => alert.headline).join(" ")}`
    : "There are no active National Weather Service alerts for New Bern at this update.";
  const marine = snapshot.marine[0]?.forecast
    ? `On the water, ${snapshot.marine[0].forecast}`
    : "Boaters should check the latest National Weather Service marine forecast before leaving shore.";
  return [
    `Hello, Eastern North Carolina. Here is your NeuseCast Weather Center update for ${snapshot.primaryLocation}.`,
    `Right now it is ${snapshot.current.temperature ?? currentPeriod.temperature} degrees with ${snapshot.current.condition.toLowerCase()}. Winds are ${[snapshot.current.windDirection, snapshot.current.windSpeed].filter(Boolean).join(" at ") || "light"}.`,
    `${currentPeriod.name} brings ${currentPeriod.shortForecast.toLowerCase()}, with a high near ${currentPeriod.temperature}. ${currentPeriod.precipitationChance === null ? "" : `The rain chance is ${currentPeriod.precipitationChance} percent.`}`.trim(),
    nextPeriod ? `${nextPeriod.name}, look for ${nextPeriod.shortForecast.toLowerCase()} and a temperature near ${nextPeriod.temperature}.` : "",
    regional ? `Across the region: ${regional}.` : "",
    alertCopy,
    marine,
    `That is your latest forecast from the ${snapshot.sponsorLabel}. Keep it here on NeuseCast TV.`,
  ].filter(Boolean).join("\n\n");
}
