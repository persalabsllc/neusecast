import {
  boolean,
  check,
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
import { sql } from "drizzle-orm";

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
export const radioBriefStatus = pgEnum("radio_brief_status", ["pending_payment", "submitted", "in_production", "approved", "active", "retired"]);
export const hostContentStatus = pgEnum("host_content_status", ["draft", "submitted", "approved", "scheduled", "expired", "rejected"]);
export const newsroomStoryStatus = pgEnum("newsroom_story_status", ["review", "approved", "rejected", "killed"]);
export const newsroomEditionStatus = pgEnum("newsroom_edition_status", ["draft", "review", "published", "withdrawn", "failed"]);
export const newsroomRiskLevel = pgEnum("newsroom_risk_level", ["low", "sensitive", "critical"]);
export const hostProspectPriority = pgEnum("host_prospect_priority", ["high", "medium", "low"]);
export const hostProspectStatus = pgEnum("host_prospect_status", [
  "researching",
  "ready",
  "queued",
  "contacted",
  "follow_up",
  "replied",
  "meeting",
  "committed",
  "converted",
  "not_interested",
  "do_not_contact",
]);
export const hostProspectActivityType = pgEnum("host_prospect_activity_type", [
  "research",
  "note",
  "email",
  "status_change",
  "meeting",
  "conversion",
]);
export const hostProspectDeliveryStatus = pgEnum("host_prospect_delivery_status", [
  "draft",
  "queued",
  "cancelled",
  "sent",
  "received",
  "failed",
  "bounced",
  "completed",
]);

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
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    stripeEventCreatedAt: timestamp("stripe_event_created_at", { withTimezone: true }),
    subscriptionStatus: varchar("subscription_status", { length: 32 }).default("inactive").notNull(),
    subscriptionPlanKey: varchar("subscription_plan_key", { length: 40 }),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("advertiser_owner_idx").on(table.ownerClerkUserId),
    uniqueIndex("advertiser_stripe_customer_idx").on(table.stripeCustomerId),
    uniqueIndex("advertiser_stripe_subscription_idx").on(table.stripeSubscriptionId),
    check("advertiser_subscription_plan_key_check", sql`${table.subscriptionPlanKey} is null or ${table.subscriptionPlanKey} in ('screens', 'hear_see', 'local_dominance')`),
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
    timeZone: varchar("time_zone", { length: 64 }).default("America/New_York").notNull(),
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

export const hostProspects = pgTable(
  "host_prospects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessName: varchar("business_name", { length: 200 }).notNull(),
    venueType: varchar("venue_type", { length: 80 }).notNull(),
    addressLine1: varchar("address_line_1", { length: 200 }),
    city: varchar("city", { length: 100 }).default("New Bern").notNull(),
    state: varchar("state", { length: 2 }).default("NC").notNull(),
    postalCode: varchar("postal_code", { length: 12 }),
    market: varchar("market", { length: 100 }).default("New Bern").notNull(),
    websiteUrl: text("website_url"),
    contactPageUrl: text("contact_page_url"),
    researchSourceUrl: text("research_source_url"),
    contactName: varchar("contact_name", { length: 160 }),
    contactTitle: varchar("contact_title", { length: 120 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    emailVerified: boolean("email_verified").default(false).notNull(),
    fitAngle: text("fit_angle"),
    priority: hostProspectPriority("priority").default("medium").notNull(),
    status: hostProspectStatus("status").default("researching").notNull(),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    lastRepliedAt: timestamp("last_replied_at", { withTimezone: true }),
    nextAction: text("next_action"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    convertedVenueId: uuid("converted_venue_id").references(() => venues.id, { onDelete: "set null" }),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("host_prospects_status_follow_up_idx").on(table.status, table.nextActionAt),
    index("host_prospects_market_priority_idx").on(table.market, table.priority),
    uniqueIndex("host_prospects_email_idx").on(table.email),
  ],
);

export const hostProspectActivities = pgTable(
  "host_prospect_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prospectId: uuid("prospect_id")
      .notNull()
      .references(() => hostProspects.id, { onDelete: "cascade" }),
    activityType: hostProspectActivityType("activity_type").notNull(),
    deliveryStatus: hostProspectDeliveryStatus("delivery_status").default("completed").notNull(),
    direction: varchar("direction", { length: 16 }),
    channel: varchar("channel", { length: 24 }),
    subject: varchar("subject", { length: 240 }),
    body: text("body"),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    providerThreadId: varchar("provider_thread_id", { length: 255 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("host_prospect_activities_timeline_idx").on(table.prospectId, table.occurredAt),
    uniqueIndex("host_prospect_activities_one_queued_email_idx")
      .on(table.prospectId)
      .where(sql`${table.activityType} = 'email' and ${table.deliveryStatus} = 'queued'`),
    uniqueIndex("host_prospect_activities_provider_message_idx").on(table.providerMessageId),
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
    provider: varchar("provider", { length: 60 }).default("neusecast").notNull(),
    providerScreenId: varchar("provider_screen_id", { length: 255 }),
    orientation: varchar("orientation", { length: 20 }).default("landscape").notNull(),
    monthlyPriceCents: integer("monthly_price_cents").notNull(),
    status: screenStatus("status").default("pending").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    deviceId: varchar("device_id", { length: 128 }),
    deviceCredentialHash: varchar("device_credential_hash", { length: 64 }),
    deviceClaimedAt: timestamp("device_claimed_at", { withTimezone: true }),
    pairingTokenHash: varchar("pairing_token_hash", { length: 64 }),
    pairingTokenExpiresAt: timestamp("pairing_token_expires_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    lastManifestAt: timestamp("last_manifest_at", { withTimezone: true }),
    lastManifestVersion: varchar("last_manifest_version", { length: 64 }),
    lastPlaybackAt: timestamp("last_playback_at", { withTimezone: true }),
    currentItemId: varchar("current_item_id", { length: 255 }),
    currentManifestVersion: varchar("current_manifest_version", { length: 64 }),
    playerVersion: varchar("player_version", { length: 80 }),
    sessionId: varchar("session_id", { length: 128 }),
    viewportWidth: integer("viewport_width"),
    viewportHeight: integer("viewport_height"),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    index("screens_venue_idx").on(table.venueId),
    index("screens_last_heartbeat_idx").on(table.lastHeartbeatAt),
    uniqueIndex("screens_provider_id_idx").on(table.provider, table.providerScreenId),
  ],
);

export const playerManifestSnapshots = pgTable(
  "player_manifest_snapshots",
  {
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 64 }).notNull(),
    items: jsonb("items").$type<Array<{
      id: string;
      source: "creative" | "host_content" | "generated_content" | "newsroom";
      campaignId: string | null;
      creativeId: string | null;
      durationSeconds: number;
    }>>().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.screenId, table.version] }),
    index("player_manifest_snapshots_delivery_idx").on(table.deliveredAt),
  ],
);

export const screenAdvertiserBlocks = pgTable(
  "screen_advertiser_blocks",
  {
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    advertiserAccountId: uuid("advertiser_account_id")
      .notNull()
      .references(() => advertiserAccounts.id, { onDelete: "cascade" }),
    blockedByClerkUserId: text("blocked_by_clerk_user_id")
      .notNull()
      .references(() => appUsers.clerkUserId, { onDelete: "restrict" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.screenId, table.advertiserAccountId] }),
    index("screen_advertiser_blocks_advertiser_idx").on(table.advertiserAccountId),
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
      .$type<{
        markets?: string[];
        venueTypes?: string[];
        notes?: string;
        houseAd?: {
          kind: string;
          sponsor: string;
          enteredBy: string;
          bypassBilling: true;
        };
      }>()
      .default({}),
    subtotalCents: integer("subtotal_cents").default(0).notNull(),
    totalCents: integer("total_cents").default(0).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    billingPaused: boolean("billing_paused").default(false).notNull(),
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
    planKey: varchar("plan_key", { length: 40 }).default("screens").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: varchar("terms_version", { length: 40 }),
    ...timestamps,
  },
  (table) => [
    index("orders_campaign_idx").on(table.campaignId),
    uniqueIndex("orders_checkout_session_idx").on(table.stripeCheckoutSessionId),
    uniqueIndex("orders_open_advertiser_idx")
      .on(table.advertiserAccountId)
      .where(sql`${table.status} in ('pending', 'failed') and ${table.stripePaymentIntentId} is null`),
    check("campaign_orders_plan_key_check", sql`${table.planKey} in ('screens', 'hear_see', 'local_dominance')`),
  ],
);

export const advertiserRadioBriefs = pgTable(
  "advertiser_radio_briefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    advertiserAccountId: uuid("advertiser_account_id")
      .notNull()
      .references(() => advertiserAccounts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    status: radioBriefStatus("status").default("pending_payment").notNull(),
    messageFocus: text("message_focus").notNull(),
    destination: varchar("destination", { length: 255 }).notNull(),
    pronunciationNotes: text("pronunciation_notes"),
    preferredTone: varchar("preferred_tone", { length: 80 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("advertiser_radio_briefs_advertiser_idx").on(table.advertiserAccountId),
    index("advertiser_radio_briefs_status_idx").on(table.status, table.updatedAt),
  ],
);

export const hostContent = pgTable(
  "host_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    screenId: uuid("screen_id").references(() => screens.id, { onDelete: "cascade" }),
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
  (table) => [index("host_content_venue_idx").on(table.venueId), index("host_content_screen_idx").on(table.screenId)],
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

export type NewsroomStoryPackage = {
  id: string;
  category: string;
  headline: string;
  summary: string;
  narration: string;
  ticker: string;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  locationLabel: string | null;
  imageUrl: string | null;
  imageCredit: string | null;
  imageSourceUrl: string | null;
  riskLevel: "low" | "sensitive" | "critical";
  durationSeconds: number;
  visualTemplate: string;
};

export const newsroomSources = pgTable(
  "newsroom_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    homepageUrl: text("homepage_url").notNull(),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    trustTier: varchar("trust_tier", { length: 40 }).notNull(),
    market: varchar("market", { length: 100 }),
    active: boolean("active").default(true).notNull(),
    attributionLabel: varchar("attribution_label", { length: 180 }).notNull(),
    mediaPolicy: varchar("media_policy", { length: 80 }).default("facts_only").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("newsroom_sources_homepage_idx").on(table.homepageUrl),
    index("newsroom_sources_market_idx").on(table.market, table.active),
  ],
);

export const newsroomEditions = pgTable(
  "newsroom_editions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    market: varchar("market", { length: 100 }).notNull(),
    slot: varchar("slot", { length: 24 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    headline: varchar("headline", { length: 180 }).notNull(),
    status: newsroomEditionStatus("status").default("draft").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").default(180).notNull(),
    stories: jsonb("stories").$type<NewsroomStoryPackage[]>().default([]).notNull(),
    script: text("script"),
    ticker: text("ticker"),
    videoUrl: text("video_url"),
    posterUrl: text("poster_url"),
    revision: integer("revision").default(1).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }),
    generatedBy: varchar("generated_by", { length: 80 }).default("openai_web_search").notNull(),
    approvedByClerkUserId: text("approved_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (table) => [
    index("newsroom_editions_air_idx").on(table.market, table.status, table.publishedAt, table.expiresAt),
    index("newsroom_editions_slot_idx").on(table.market, table.slot, table.scheduledAt),
  ],
);

export const newsroomStories = pgTable(
  "newsroom_stories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => newsroomEditions.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => newsroomSources.id, { onDelete: "set null" }),
    market: varchar("market", { length: 100 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    headline: varchar("headline", { length: 180 }).notNull(),
    summary: text("summary").notNull(),
    narration: text("narration").notNull(),
    ticker: varchar("ticker", { length: 300 }).notNull(),
    sourceName: varchar("source_name", { length: 180 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    sourcePublishedAt: timestamp("source_published_at", { withTimezone: true }),
    locationLabel: varchar("location_label", { length: 120 }),
    imageUrl: text("image_url"),
    imageCredit: varchar("image_credit", { length: 240 }),
    imageSourceUrl: text("image_source_url"),
    riskLevel: newsroomRiskLevel("risk_level").default("low").notNull(),
    status: newsroomStoryStatus("status").default("review").notNull(),
    durationSeconds: integer("duration_seconds").default(26).notNull(),
    visualTemplate: varchar("visual_template", { length: 40 }).default("headline").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    reviewedByClerkUserId: text("reviewed_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (table) => [
    index("newsroom_stories_edition_idx").on(table.editionId, table.status),
    index("newsroom_stories_review_idx").on(table.status, table.riskLevel, table.createdAt),
    index("newsroom_stories_fingerprint_idx").on(table.fingerprint),
  ],
);
