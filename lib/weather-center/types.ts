export const WEATHER_CENTER_SCENES = [
  "open",
  "current",
  "hourly",
  "seven-day",
  "regional",
  "radar",
  "alerts",
  "marine",
  "tides",
  "tropical",
  "close",
] as const;

export type WeatherCenterScene = typeof WEATHER_CENTER_SCENES[number];

export type WeatherCenterPeriod = {
  name: string;
  startsAt: string;
  endsAt: string;
  temperature: number;
  temperatureUnit: "F" | "C";
  shortForecast: string;
  detailedForecast: string;
  precipitationChance: number | null;
  windSpeed: string;
  windDirection: string;
  iconUrl: string | null;
  isDaytime: boolean;
};

export type WeatherCenterSnapshot = {
  version: 1;
  issuedAt: string;
  validUntil: string;
  market: string;
  primaryLocation: string;
  sponsorLabel: string;
  current: {
    temperature: number | null;
    feelsLike: number | null;
    humidity: number | null;
    condition: string;
    windSpeed: string;
    windDirection: string;
    observedAt: string | null;
  };
  forecast: WeatherCenterPeriod[];
  hourly: WeatherCenterPeriod[];
  locations: Array<{ name: string; temperature: number | null; observedAt: string | null }>;
  alerts: Array<{ id: string; event: string; headline: string; area: string; severity: string; expiresAt: string }>;
  marine: Array<{ name: string; forecast: string; wind: string }>;
  tides: Array<{ time: string; type: "high" | "low"; heightFeet: number | null }>;
  radar: {
    imageUrl: string;
    sourceUrl: string;
    updatedEveryMinutes: number;
  };
  tropical: {
    message: string;
    sourceUrl: string;
  };
  sources: Array<{ name: string; url: string; updatedAt: string | null }>;
};

export type WeatherCenterRunView = {
  id: string;
  status: "generating" | "ready" | "expired" | "failed";
  issuedAt: string;
  validFrom: string;
  validUntil: string;
  severeWeatherReviewed: boolean;
  presenterScript: string;
  errorMessage: string | null;
  data: WeatherCenterSnapshot;
};
