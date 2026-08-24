export type ScreenStatus = "online" | "attention" | "offline";

export type Screen = {
  id: string;
  name: string;
  venue: string;
  city: "New Bern" | "Havelock" | "Morehead City" | "Kinston";
  zone: string;
  status: ScreenStatus;
  lastSeen: string;
  uptime: number;
  player: string;
  orientation: "Landscape" | "Portrait";
  currentSlot: string;
  connection: string;
};

export type ContentStatus = "approved" | "pending" | "revision" | "scheduled";
export type ContentType =
  | "Host message"
  | "Advertisement"
  | "Weather"
  | "Community"
  | "Local news"
  | "Filler";

export type ContentItem = {
  id: string;
  title: string;
  type: ContentType;
  owner: string;
  submitted: string;
  duration: number;
  destinations: string;
  status: ContentStatus;
  note?: string;
  accent: "teal" | "coral" | "blue" | "gold" | "violet" | "slate";
};

export type CampaignStatus = "active" | "scheduled" | "draft" | "paused";

export type Campaign = {
  id: string;
  advertiser: string;
  name: string;
  status: CampaignStatus;
  flight: string;
  weeklyRate: number;
  screenCount: number;
  creativeCount: number;
  plays: number;
  playGoal: number;
  primaryMarket: string;
};

export type ScheduleKind =
  | "Host"
  | "Ad"
  | "Weather"
  | "Events"
  | "News"
  | "Filler";

export type ScheduleSlot = {
  id: string;
  time: string;
  title: string;
  source: string;
  kind: ScheduleKind;
  duration: number;
  destinations: string;
  locked?: boolean;
};

export const screens: readonly Screen[] = [
  {
    id: "NBN-001",
    name: "Front counter",
    venue: "Baker's Kitchen",
    city: "New Bern",
    zone: "Downtown New Bern",
    status: "online",
    lastSeen: "18 seconds ago",
    uptime: 99.9,
    player: "NeuseCast Mini 01",
    orientation: "Landscape",
    currentSlot: "CarolinaEast Orthopedics",
    connection: "Ethernet",
  },
  {
    id: "NBN-002",
    name: "Dining room",
    venue: "Persimmons Waterfront Restaurant",
    city: "New Bern",
    zone: "Downtown New Bern",
    status: "online",
    lastSeen: "31 seconds ago",
    uptime: 99.7,
    player: "NeuseCast Mini 02",
    orientation: "Landscape",
    currentSlot: "Weekend on the Waterfront",
    connection: "Wi-Fi · Strong",
  },
  {
    id: "NBN-003",
    name: "Waiting area",
    venue: "Coastal Carolina Health Care",
    city: "New Bern",
    zone: "Medical district",
    status: "attention",
    lastSeen: "9 minutes ago",
    uptime: 98.2,
    player: "NeuseCast Mini 03",
    orientation: "Landscape",
    currentSlot: "Weather + river conditions",
    connection: "Wi-Fi · Weak",
  },
  {
    id: "HVL-001",
    name: "Customer lounge",
    venue: "Cella Ford",
    city: "Havelock",
    zone: "US-70 corridor",
    status: "online",
    lastSeen: "44 seconds ago",
    uptime: 99.4,
    player: "NeuseCast Mini 04",
    orientation: "Landscape",
    currentSlot: "Tryon Palace fall calendar",
    connection: "Ethernet",
  },
  {
    id: "MHC-001",
    name: "Checkout wall",
    venue: "SoundSide Outfitters",
    city: "Morehead City",
    zone: "Crystal Coast",
    status: "online",
    lastSeen: "2 minutes ago",
    uptime: 98.8,
    player: "NeuseCast Mini 05",
    orientation: "Portrait",
    currentSlot: "Last cached playlist",
    connection: "Wi-Fi · Strong",
  },
];

export const contentItems: readonly ContentItem[] = [
  {
    id: "CNT-1042",
    title: "Tonight: half-price appetizers",
    type: "Host message",
    owner: "Persimmons Waterfront Restaurant",
    submitted: "8 minutes ago",
    duration: 12,
    destinations: "Persimmons only",
    status: "pending",
    note: "Offer ends at 7 PM; host supplied photo and menu text.",
    accent: "coral",
  },
  {
    id: "CNT-1039",
    title: "Urgent care — no appointment needed",
    type: "Advertisement",
    owner: "CarolinaEast Health System",
    submitted: "Today, 8:42 AM",
    duration: 15,
    destinations: "All 5 screens",
    status: "approved",
    accent: "blue",
  },
  {
    id: "CNT-1037",
    title: "Neuse River forecast",
    type: "Weather",
    owner: "Automated · NWS Newport/Morehead City",
    submitted: "Updated 11 minutes ago",
    duration: 10,
    destinations: "All screens",
    status: "scheduled",
    accent: "teal",
  },
  {
    id: "CNT-1035",
    title: "ArtWalk downtown Friday evening",
    type: "Community",
    owner: "New Bern Area Chamber of Commerce",
    submitted: "Yesterday, 4:16 PM",
    duration: 12,
    destinations: "New Bern zone",
    status: "revision",
    note: "Confirm event time before approving.",
    accent: "gold",
  },
  {
    id: "CNT-1032",
    title: "Three things happening around town",
    type: "Local news",
    owner: "Captain 97 editorial feed",
    submitted: "Today, 7:30 AM",
    duration: 18,
    destinations: "New Bern + Havelock",
    status: "approved",
    accent: "violet",
  },
  {
    id: "CNT-1028",
    title: "Did you know? The Pepsi birthplace",
    type: "Filler",
    owner: "NeuseCast local history",
    submitted: "Aug 22",
    duration: 10,
    destinations: "New Bern zone",
    status: "approved",
    accent: "slate",
  },
];

export const campaigns: readonly Campaign[] = [
  {
    id: "CMP-2608",
    advertiser: "CarolinaEast Health System",
    name: "Fall urgent care awareness",
    status: "active",
    flight: "Aug 12 – Sep 30",
    weeklyRate: 295,
    screenCount: 5,
    creativeCount: 2,
    plays: 7_842,
    playGoal: 10_500,
    primaryMarket: "Craven County",
  },
  {
    id: "CMP-2611",
    advertiser: "Cella Ford",
    name: "Labor Day truck event",
    status: "active",
    flight: "Aug 19 – Sep 7",
    weeklyRate: 225,
    screenCount: 4,
    creativeCount: 3,
    plays: 3_180,
    playGoal: 5_200,
    primaryMarket: "New Bern + Havelock",
  },
  {
    id: "CMP-2614",
    advertiser: "Tryon Palace",
    name: "Fall heritage weekends",
    status: "scheduled",
    flight: "Sep 1 – Oct 31",
    weeklyRate: 180,
    screenCount: 5,
    creativeCount: 1,
    plays: 0,
    playGoal: 8_600,
    primaryMarket: "Regional",
  },
  {
    id: "CMP-2617",
    advertiser: "Mitchell Hardware",
    name: "Storm season essentials",
    status: "draft",
    flight: "Dates not set",
    weeklyRate: 150,
    screenCount: 3,
    creativeCount: 0,
    plays: 0,
    playGoal: 3_600,
    primaryMarket: "New Bern",
  },
  {
    id: "CMP-2604",
    advertiser: "SoundSide Outfitters",
    name: "Late-summer fishing gear",
    status: "paused",
    flight: "Aug 1 – Aug 31",
    weeklyRate: 175,
    screenCount: 3,
    creativeCount: 2,
    plays: 4_216,
    playGoal: 5_000,
    primaryMarket: "Crystal Coast",
  },
];

export const scheduleSlots: readonly ScheduleSlot[] = [
  {
    id: "PL-001",
    time: "00:00",
    title: "Venue welcome + today's special",
    source: "Host content",
    kind: "Host",
    duration: 12,
    destinations: "Per-venue",
    locked: true,
  },
  {
    id: "PL-002",
    time: "00:12",
    title: "Fall urgent care awareness",
    source: "CarolinaEast Health System",
    kind: "Ad",
    duration: 15,
    destinations: "Network-wide",
  },
  {
    id: "PL-003",
    time: "00:27",
    title: "Current weather + Neuse River outlook",
    source: "NWS Newport/Morehead City",
    kind: "Weather",
    duration: 10,
    destinations: "Regional feed",
    locked: true,
  },
  {
    id: "PL-004",
    time: "00:37",
    title: "Weekend around town",
    source: "New Bern events feed",
    kind: "Events",
    duration: 12,
    destinations: "New Bern zone",
  },
  {
    id: "PL-005",
    time: "00:49",
    title: "Labor Day truck event",
    source: "Cella Ford",
    kind: "Ad",
    duration: 15,
    destinations: "4 selected screens",
  },
  {
    id: "PL-006",
    time: "01:04",
    title: "Captain 97 local headlines",
    source: "Captain 97 editorial feed",
    kind: "News",
    duration: 18,
    destinations: "New Bern + Havelock",
  },
  {
    id: "PL-007",
    time: "01:22",
    title: "Eastern NC trivia",
    source: "NeuseCast auto-fill",
    kind: "Filler",
    duration: 10,
    destinations: "Network-wide",
  },
  {
    id: "PL-008",
    time: "01:32",
    title: "Venue menu or service spotlight",
    source: "Host content",
    kind: "Host",
    duration: 12,
    destinations: "Per-venue",
  },
];

export const networkSummary = {
  online: screens.filter((screen) => screen.status === "online").length,
  needsAttention: screens.filter((screen) => screen.status !== "online").length,
  pendingApprovals: contentItems.filter((item) => item.status === "pending").length,
  activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
  weeklyBooked: campaigns
    .filter((campaign) => campaign.status === "active")
    .reduce((total, campaign) => total + campaign.weeklyRate, 0),
} as const;
