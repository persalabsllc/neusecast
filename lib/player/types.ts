export type PlayerItemKind = "advertisement" | "host" | "weather" | "news" | "event" | "history" | "trivia" | "community" | "ident";

export type PlayerTheme = "aqua" | "navy" | "coral" | "gold" | "blue" | "green";

export type PlayerWeatherPeriod = {
  name: string;
  temperature: number;
  temperatureUnit: "F" | "C";
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  precipitationChance: number | null;
  isDaytime: boolean;
  startsAt: string;
  endsAt: string;
};

export type PlayerAlert = {
  id: string;
  event: string;
  headline: string;
  area: string;
  severity: string;
  expiresAt: string | null;
};

export type PlayerItem = {
  id: string;
  kind: PlayerItemKind;
  source: "creative" | "host_content" | "generated_content";
  campaignId: string | null;
  creativeId: string | null;
  durationSeconds: number;
  eyebrow: string;
  title: string;
  body: string;
  callToAction: string | null;
  mediaUrl: string | null;
  theme: PlayerTheme;
  sponsor: string | null;
  contentCategory?: string | null;
  mediaCredit?: string | null;
  weatherPeriods?: PlayerWeatherPeriod[];
  expiresAt?: string | null;
};

export type PlayerManifest = {
  generatedAt: string;
  serverTime: string;
  version: string;
  refreshAfterSeconds: number;
  screen: {
    id: string;
    name: string;
    orientation: string;
  };
  venue: {
    name: string;
    city: string;
    state: string;
    market: string;
    timeZone: string;
  };
  alerts?: PlayerAlert[];
  items: PlayerItem[];
};
