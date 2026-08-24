export type PlayerItemKind = "advertisement" | "host" | "weather" | "event" | "history" | "trivia" | "community";

export type PlayerTheme = "aqua" | "navy" | "coral" | "gold" | "blue" | "green";

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
};

export type PlayerManifest = {
  generatedAt: string;
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
  };
  items: PlayerItem[];
};
