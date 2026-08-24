import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const userRole = pgEnum("user_role", ["admin", "host", "advertiser"]);
export const userStatus = pgEnum("user_status", ["invited", "active", "suspended"]);
export const venueStatus = pgEnum("venue_status", ["lead", "approved", "installing", "active", "paused", "removed"]);
export const screenStatus = pgEnum("screen_status", ["pending", "online", "offline", "maintenance", "retired"]);
export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "payment_pending",
  "submitted",
  "approved",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
]);
export const creativeStatus = pgEnum("creative_status", ["draft", "processing", "review", "approved", "rejected", "archived"]);
export const creativeType = pgEnum("creative_type", ["image", "video", "generated_slide"]);
export const orderStatus = pgEnum("order_status", ["pending", "paid", "failed", "refunded", "cancelled"]);
export const hostContentStatus = pgEnum("host_content_status", ["draft", "submitted", "approved", "scheduled", "expired", "rejected"]);

export const appUsers = pgTable(
  "app_users",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 160 }),
    role: userRole("role").notNull(),
    status: userStatus("status").default("active").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("app_users_email_idx").on(table.email)],
);

export const advertiserAccounts = pgTable(
  "advertiser_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerClerkUserId: text("owner_clerk_user_id")
      .notNull()
      .references(() => appUsers.clerkUserId, { onDelete: "restrict" }),
    businessName: varchar("business_name", { length: 200 }).notNull(),
    billingEmail: varchar("billing_email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    website: text("website"),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index("advertiser_owner_idx").on(table.ownerClerkUserId),
    uniqueIndex("advertiser_stripe_customer_idx").on(table.stripeCustomerId),
  ],
);

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hostClerkUserId: text("host_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    venueType: varchar("venue_type", { length: 80 }).notNull(),
    addressLine1: varchar("address_line_1", { length: 200 }).notNull(),
    addressLine2: varchar("address_line_2", { length: 200 }),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 2 }).default("NC").notNull(),
    postalCode: varchar("postal_code", { length: 12 }).notNull(),
    market: varchar("market", { length: 100 }).notNull(),
    audienceDescription: text("audience_description"),
    estimatedDailyViews: integer("estimated_daily_views"),
    status: venueStatus("status").default("lead").notNull(),
    ...timestamps,
  },
  (table) => [
    index("venues_market_idx").on(table.market),
    index("venues_host_idx").on(table.hostClerkUserId),
  ],
);

export const screens = pgTable(
  "screens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    provider: varchar("provider", { length: 60 }).default("yodeck").notNull(),
    providerScreenId: varchar("provider_screen_id", { length: 255 }),
    orientation: varchar("orientation", { length: 20 }).default("landscape").notNull(),
    monthlyPriceCents: integer("monthly_price_cents").notNull(),
    status: screenStatus("status").default("pending").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index("screens_venue_idx").on(table.venueId),
    uniqueIndex("screens_provider_id_idx").on(table.provider, table.providerScreenId),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    advertiserAccountId: uuid("advertiser_account_id")
      .notNull()
      .references(() => advertiserAccounts.id, { onDelete: "cascade" }),
    createdByClerkUserId: text("created_by_clerk_user_id")
      .notNull()
      .references(() => appUsers.clerkUserId, { onDelete: "restrict" }),
    name: varchar("name", { length: 180 }).notNull(),
    objective: text("objective"),
    status: campaignStatus("status").default("draft").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").default(15).notNull(),
    targeting: jsonb("targeting")
      .$type<{ markets?: string[]; venueTypes?: string[]; notes?: string }>()
      .default({}),
    subtotalCents: integer("subtotal_cents").default(0).notNull(),
    totalCents: integer("total_cents").default(0).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    ...timestamps,
  },
  (table) => [
    index("campaigns_advertiser_idx").on(table.advertiserAccountId),
    index("campaigns_status_idx").on(table.status),
  ],
);

export const campaignScreens = pgTable(
  "campaign_screens",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "restrict" }),
    priceCents: integer("price_cents").notNull(),
    scheduledPlaysPerDay: integer("scheduled_plays_per_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.screenId] }),
    index("campaign_screens_screen_idx").on(table.screenId),
  ],
);

export const creatives = pgTable(
  "creatives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    createdByClerkUserId: text("created_by_clerk_user_id")
      .notNull()
      .references(() => appUsers.clerkUserId, { onDelete: "restrict" }),
    type: creativeType("type").notNull(),
    status: creativeStatus("status").default("draft").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    headline: varchar("headline", { length: 120 }),
    body: text("body"),
    callToAction: varchar("call_to_action", { length: 120 }),
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds").default(15).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (table) => [index("creatives_campaign_idx").on(table.campaignId)],
);

export const campaignOrders = pgTable(
  "campaign_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    advertiserAccountId: uuid("advertiser_account_id")
      .notNull()
      .references(() => advertiserAccounts.id, { onDelete: "restrict" }),
    status: orderStatus("status").default("pending").notNull(),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("orders_campaign_idx").on(table.campaignId),
    uniqueIndex("orders_checkout_session_idx").on(table.stripeCheckoutSessionId),
  ],
);

export const hostContent = pgTable(
  "host_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    submittedByClerkUserId: text("submitted_by_clerk_user_id")
      .notNull()
      .references(() => appUsers.clerkUserId, { onDelete: "restrict" }),
    status: hostContentStatus("status").default("draft").notNull(),
    template: varchar("template", { length: 60 }).notNull(),
    headline: varchar("headline", { length: 120 }).notNull(),
    body: text("body"),
    callToAction: varchar("call_to_action", { length: 120 }),
    mediaUrl: text("media_url"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("host_content_venue_idx").on(table.venueId)],
);

export const playbackEvents = pgTable(
  "playback_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    creativeId: uuid("creative_id").references(() => creatives.id, { onDelete: "set null" }),
    providerEventId: varchar("provider_event_id", { length: 255 }),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("playback_screen_time_idx").on(table.screenId, table.playedAt),
    index("playback_campaign_time_idx").on(table.campaignId, table.playedAt),
    uniqueIndex("playback_provider_event_idx").on(table.providerEventId),
  ],
);

export const generatedContent = pgTable(
  "generated_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    category: varchar("category", { length: 40 }).notNull(),
    market: varchar("market", { length: 100 }),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    sourceName: varchar("source_name", { length: 160 }),
    sourceUrl: text("source_url"),
    artworkUrl: text("artwork_url"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    approved: boolean("approved").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (table) => [index("generated_content_market_idx").on(table.market, table.category)],
);
