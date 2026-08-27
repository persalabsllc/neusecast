export const BROADCAST_MEDIA_CATEGORIES = [
  "program",
  "news",
  "weather",
  "events",
  "segment_intro",
  "segment_tease",
  "segment_outro",
  "commercial",
  "promo",
  "bumper",
  "station_id",
  "psa",
  "filler",
  "emergency",
  "live_recording",
  "other",
] as const;

export type BroadcastMediaCategory = (typeof BROADCAST_MEDIA_CATEGORIES)[number];

export const BROADCAST_MEDIA_CATEGORY_LABELS: Record<BroadcastMediaCategory, string> = {
  program: "Program",
  news: "News",
  weather: "Weather",
  events: "Events",
  segment_intro: "Segment Intro",
  segment_tease: "Segment Tease",
  segment_outro: "Segment Outro",
  commercial: "Commercial",
  promo: "Promo",
  bumper: "Bumper",
  station_id: "Station ID",
  psa: "PSA",
  filler: "Filler",
  emergency: "Emergency",
  live_recording: "Live recording",
  other: "Other",
};

export const BROADCAST_SEGMENTS = [
  "weather",
  "local_news",
  "community_calendar",
  "sports",
  "special_programming",
] as const;

export type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number];

export const BROADCAST_SEGMENT_LABELS: Record<BroadcastSegment, string> = {
  weather: "Weather",
  local_news: "Local News",
  community_calendar: "Community Calendar",
  sports: "Sports",
  special_programming: "Special Programming",
};

export const SEGMENT_MEDIA_CATEGORIES = ["segment_intro", "segment_tease", "segment_outro"] as const;

export function isBroadcastMediaCategory(value: string): value is BroadcastMediaCategory {
  return (BROADCAST_MEDIA_CATEGORIES as readonly string[]).includes(value);
}

export function isBroadcastSegment(value: string): value is BroadcastSegment {
  return (BROADCAST_SEGMENTS as readonly string[]).includes(value);
}

export function isSegmentMediaCategory(value: string): value is (typeof SEGMENT_MEDIA_CATEGORIES)[number] {
  return (SEGMENT_MEDIA_CATEGORIES as readonly string[]).includes(value);
}

export function mediaClassification(
  categoryValue: string,
  segmentValue?: string | null,
): { category: BroadcastMediaCategory; segment: BroadcastSegment | null } | null {
  if (!isBroadcastMediaCategory(categoryValue)) return null;
  if (!isSegmentMediaCategory(categoryValue)) return { category: categoryValue, segment: null };
  if (!segmentValue || !isBroadcastSegment(segmentValue)) return null;
  return { category: categoryValue, segment: segmentValue };
}
