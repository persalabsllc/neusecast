export type PlayerSlideKind = "host" | "advertiser" | "weather" | "event" | "local";

export type PlayerSlide = {
  id: string;
  kind: PlayerSlideKind;
  eyebrow: string;
  title: string;
  body: string;
  detail: string;
  footer: string;
  duration: number;
  accent: "tide" | "coral" | "sun" | "sky";
  meta?: string;
};

export const demoPlayerSlides: PlayerSlide[] = [
  {
    id: "host-breakfast",
    kind: "host",
    eyebrow: "Good morning, New Bern",
    title: "Breakfast tastes better downtown.",
    body: "Fresh biscuits, local eggs, and hot coffee are waiting just around the corner.",
    detail: "Ask about today’s cinnamon roll",
    footer: "Presented by Baker’s Kitchen",
    duration: 12,
    accent: "tide",
    meta: "Host special",
  },
  {
    id: "advertiser-carolina-colors",
    kind: "advertiser",
    eyebrow: "Built for life on the coast",
    title: "Come home to Carolina Colours.",
    body: "Discover connected neighborhoods, beautiful trails, and room to make Eastern Carolina home.",
    detail: "Tour available homes this weekend",
    footer: "Carolina Colours · New Bern, NC",
    duration: 15,
    accent: "coral",
    meta: "Local sponsor",
  },
  {
    id: "weather-new-bern",
    kind: "weather",
    eyebrow: "Your coastal forecast",
    title: "84° and bright on the Neuse.",
    body: "A warm afternoon with a light southwest breeze. Sunset arrives at 7:42 PM.",
    detail: "High tide · 4:18 PM",
    footer: "New Bern weather & tides",
    duration: 10,
    accent: "sky",
    meta: "Updated 7:30 AM",
  },
  {
    id: "event-artwalk",
    kind: "event",
    eyebrow: "This weekend",
    title: "ArtWalk fills downtown Friday night.",
    body: "Meet local artists, hear live music, and explore galleries throughout historic New Bern.",
    detail: "Friday · 5–8 PM · Free",
    footer: "Community calendar",
    duration: 12,
    accent: "sun",
    meta: "Downtown New Bern",
  },
  {
    id: "local-history",
    kind: "local",
    eyebrow: "Did you know?",
    title: "New Bern gave the world Pepsi-Cola.",
    body: "Pharmacist Caleb Bradham created the original drink downtown in 1893—just a few blocks from here.",
    detail: "Visit the birthplace on Middle Street",
    footer: "Local stories, powered by NeuseCast",
    duration: 12,
    accent: "tide",
    meta: "Eastern Carolina history",
  },
];

