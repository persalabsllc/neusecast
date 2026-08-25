export const NEWSROOM_CATEGORIES = [
  "breaking",
  "public_safety",
  "city_hall",
  "county_government",
  "education",
  "elections",
  "roads",
  "business",
  "community",
  "weather",
] as const;

export type NewsroomCategory = typeof NEWSROOM_CATEGORIES[number];
export type NewsroomRiskLevel = "low" | "sensitive" | "critical";
export type NewsroomSlot = "morning" | "afternoon" | "manual" | "breaking";

export const NEWSROOM_VISUAL_TEMPLATES = ["lead", "headline", "map", "civic", "numbers", "photo"] as const;
export type NewsroomVisualTemplate = typeof NEWSROOM_VISUAL_TEMPLATES[number];

export const NEWSROOM_CATEGORY_LABELS: Record<NewsroomCategory, string> = {
  breaking: "Developing",
  public_safety: "Public Safety",
  city_hall: "New Bern City Hall",
  county_government: "Craven County",
  education: "Education",
  elections: "Elections",
  roads: "Traffic & Roads",
  business: "Local Economy",
  community: "Around Town",
  weather: "Weather",
};
