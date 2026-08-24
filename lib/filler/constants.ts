export const FILLER_CATEGORIES = [
  "did_you_know",
  "history",
  "weather",
  "news",
  "event",
  "fact",
  "on_this_day",
] as const;

export type FillerCategory = (typeof FILLER_CATEGORIES)[number];

export const AUTOMATIC_FILLER_CATEGORIES = [
  "did_you_know",
  "history",
  "news",
  "event",
  "fact",
  "on_this_day",
] as const satisfies readonly FillerCategory[];

export const FILLER_CATEGORY_LABELS: Record<FillerCategory, string> = {
  did_you_know: "Did you know?",
  history: "Local history",
  weather: "Local weather",
  news: "Local news",
  event: "Local event",
  fact: "Random fact",
  on_this_day: "On this day",
};

export const FILLER_THEMES = ["aqua", "navy", "coral", "gold", "blue", "green"] as const;
export type FillerTheme = (typeof FILLER_THEMES)[number];

export const HOUSE_AD_ID = "neusecast-house-ad";
