export const FILLER_CATEGORIES = [
  "did_you_know",
  "history",
  "place_spotlight",
  "then_and_now",
  "river_and_coast",
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
  "place_spotlight",
  "then_and_now",
  "river_and_coast",
  "news",
  "event",
  "fact",
  "on_this_day",
] as const satisfies readonly FillerCategory[];

export const EVERGREEN_AUTOMATIC_FILLER_CATEGORIES = [
  "place_spotlight",
  "did_you_know",
  "history",
  "then_and_now",
  "river_and_coast",
  "fact",
] as const satisfies readonly FillerCategory[];

export const FILLER_CATEGORY_LABELS: Record<FillerCategory, string> = {
  did_you_know: "Did you know?",
  history: "Local history",
  place_spotlight: "Place spotlight",
  then_and_now: "Then & now",
  river_and_coast: "River & coast",
  weather: "Local weather",
  news: "Local news",
  event: "Local event",
  fact: "Random fact",
  on_this_day: "On this day",
};

export const FILLER_THEMES = ["aqua", "navy", "coral", "gold", "blue", "green"] as const;
export type FillerTheme = (typeof FILLER_THEMES)[number];

export const FILLER_VISUAL_TEMPLATES = [
  "editorial_split",
  "photo_feature",
  "place_card",
  "archival",
  "fact_reveal",
] as const;

export type FillerVisualTemplate = (typeof FILLER_VISUAL_TEMPLATES)[number];

export const FILLER_VISUAL_TEMPLATE_LABELS: Record<FillerVisualTemplate, string> = {
  editorial_split: "Editorial split",
  photo_feature: "Full-screen photo",
  place_card: "Place spotlight",
  archival: "Archival story",
  fact_reveal: "Animated fact reveal",
};

export const FILLER_GENERATION_PROGRAMS = {
  photo_rich: {
    label: "Photo-rich local programming",
    categories: ["place_spotlight", "did_you_know", "history", "then_and_now", "river_and_coast", "fact"],
  },
  places: { label: "Place spotlights", categories: ["place_spotlight"] },
  facts: { label: "Did you know + random facts", categories: ["did_you_know", "fact"] },
  history: { label: "Local history + then & now", categories: ["history", "then_and_now", "on_this_day"] },
  river: { label: "River & coast", categories: ["river_and_coast"] },
  timely: { label: "News + local events", categories: ["news", "event"] },
} as const satisfies Record<string, { label: string; categories: readonly FillerCategory[] }>;

export type FillerGenerationProgram = keyof typeof FILLER_GENERATION_PROGRAMS;

export const HOUSE_AD_ID = "neusecast-house-ad";
