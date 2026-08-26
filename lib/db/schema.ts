import {
  bigint,
  boolean,
  check,
  date,
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

export const broadcastMediaKind = pgEnum("broadcast_media_kind", ["video", "audio", "image", "caption", "graphic"]);
export const broadcastMediaCategory = pgEnum("broadcast_media_category", [
  "program",
  "news",
  "weather",
  "events",
  "commercial",
  "promo",
  "bumper",
  "psa",
  "filler",
  "emergency",
  "live_recording",
  "other",
]);
export const broadcastMediaStatus = pgEnum("broadcast_media_status", ["uploading", "processing", "ready", "failed", "archived"]);
export const broadcastMediaVersionStatus = pgEnum("broadcast_media_version_status", [
  "pending",
  "processing",
  "ready",
  "failed",
  "archived",
]);
export const broadcastLiveProtocol = pgEnum("broadcast_live_protocol", [
  "rtmp",
  "rtmps",
  "srt",
  "rtsp",
  "webrtc",
  "ndi",
  "decklink",
  "test",
]);
export const broadcastLiveSourceStatus = pgEnum("broadcast_live_source_status", [
  "disabled",
  "offline",
  "connecting",
  "ready",
  "live",
  "error",
]);
export const broadcastAgentKind = pgEnum("broadcast_agent_kind", ["casparcg", "playout", "ingest", "renderer"]);
export const broadcastAgentStatus = pgEnum("broadcast_agent_status", ["offline", "starting", "ready", "degraded", "stopping"]);
export const broadcastAgentCommandStatus = pgEnum("broadcast_agent_command_status", [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
]);
export const broadcastOutputKind = pgEnum("broadcast_output_kind", ["preview", "program", "stream", "recording"]);
export const broadcastOutputStatus = pgEnum("broadcast_output_status", [
  "disabled",
  "standby",
  "starting",
  "live",
  "degraded",
  "offline",
  "error",
]);
export const broadcastGraphicKind = pgEnum("broadcast_graphic_kind", [
  "logo",
  "clock",
  "weather",
  "ticker",
  "lower_third",
  "emergency",
  "custom",
]);
export const broadcastTickerPriority = pgEnum("broadcast_ticker_priority", ["routine", "important", "urgent", "emergency"]);
export const broadcastTickerStatus = pgEnum("broadcast_ticker_status", [
  "draft",
  "approved",
  "scheduled",
  "active",
  "expired",
  "cancelled",
  "archived",
]);
export const broadcastClockStatus = pgEnum("broadcast_clock_status", ["draft", "active", "retired"]);
export const broadcastProgramSource = pgEnum("broadcast_program_source", ["asset", "category", "dynamic", "live", "break"]);
export const broadcastProgramLogStatus = pgEnum("broadcast_program_log_status", [
  "draft",
  "published",
  "on_air",
  "completed",
  "cancelled",
  "archived",
]);
export const broadcastProgramItemStatus = pgEnum("broadcast_program_item_status", [
  "scheduled",
  "ready",
  "playing",
  "played",
  "skipped",
  "failed",
  "cancelled",
]);
export const broadcastAsRunEventType = pgEnum("broadcast_as_run_event_type", [
  "started",
  "completed",
  "skipped",
  "failed",
  "interrupted",
  "resumed",
  "live_taken",
  "automation_resumed",
  "graphics_changed",
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

export const broadcastMediaAssets = pgTable(
  "broadcast_media_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    description: text("description"),
    kind: broadcastMediaKind("kind").notNull(),
    category: broadcastMediaCategory("category").default("other").notNull(),
    status: broadcastMediaStatus("status").default("uploading").notNull(),
    durationMs: integer("duration_ms"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    rightsOwner: varchar("rights_owner", { length: 240 }),
    rightsNotes: text("rights_notes"),
    rightsExpiresAt: timestamp("rights_expires_at", { withTimezone: true }),
    availableFrom: timestamp("available_from", { withTimezone: true }),
    availableUntil: timestamp("available_until", { withTimezone: true }),
    createdByClerkUserId: text("created_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_media_assets_slug_idx").on(table.slug),
    index("broadcast_media_assets_library_idx").on(table.status, table.category, table.kind, table.createdAt),
    index("broadcast_media_assets_availability_idx").on(table.availableFrom, table.availableUntil),
    check("broadcast_media_assets_duration_check", sql`${table.durationMs} is null or ${table.durationMs} > 0`),
    check(
      "broadcast_media_assets_availability_check",
      sql`${table.availableUntil} is null or ${table.availableFrom} is null or ${table.availableUntil} > ${table.availableFrom}`,
    ),
  ],
);

export const broadcastMediaVersions = pgTable(
  "broadcast_media_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => broadcastMediaAssets.id, { onDelete: "cascade" }),
    revision: integer("revision").default(1).notNull(),
    status: broadcastMediaVersionStatus("status").default("pending").notNull(),
    isCurrent: boolean("is_current").default(false).notNull(),
    originalFileName: varchar("original_file_name", { length: 255 }),
    mimeType: varchar("mime_type", { length: 160 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    storageProvider: varchar("storage_provider", { length: 60 }),
    storageKey: text("storage_key"),
    sourceUrl: text("source_url"),
    playbackUrl: text("playback_url"),
    thumbnailUrl: text("thumbnail_url"),
    captionUrl: text("caption_url"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    frameRateNumerator: integer("frame_rate_numerator"),
    frameRateDenominator: integer("frame_rate_denominator"),
    audioChannels: integer("audio_channels"),
    audioSampleRate: integer("audio_sample_rate"),
    technicalMetadata: jsonb("technical_metadata").$type<Record<string, unknown>>().default({}).notNull(),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("broadcast_media_versions_revision_idx").on(table.assetId, table.revision),
    uniqueIndex("broadcast_media_versions_current_idx")
      .on(table.assetId)
      .where(sql`${table.isCurrent} = true and ${table.archivedAt} is null`),
    index("broadcast_media_versions_processing_idx").on(table.status, table.createdAt),
    check("broadcast_media_versions_revision_check", sql`${table.revision} > 0`),
    check("broadcast_media_versions_file_size_check", sql`${table.fileSizeBytes} is null or ${table.fileSizeBytes} >= 0`),
    check("broadcast_media_versions_duration_check", sql`${table.durationMs} is null or ${table.durationMs} > 0`),
    check(
      "broadcast_media_versions_dimensions_check",
      sql`(${table.width} is null or ${table.width} > 0) and (${table.height} is null or ${table.height} > 0)`,
    ),
    check(
      "broadcast_media_versions_frame_rate_check",
      sql`(${table.frameRateNumerator} is null or ${table.frameRateNumerator} > 0) and (${table.frameRateDenominator} is null or ${table.frameRateDenominator} > 0)`,
    ),
  ],
);

export const broadcastAgents = pgTable(
  "broadcast_agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentKey: varchar("agent_key", { length: 120 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    kind: broadcastAgentKind("kind").default("casparcg").notNull(),
    status: broadcastAgentStatus("status").default("offline").notNull(),
    credentialHash: varchar("credential_hash", { length: 64 }),
    hostname: varchar("hostname", { length: 255 }),
    softwareVersion: varchar("software_version", { length: 80 }),
    capabilities: jsonb("capabilities").$type<string[]>().default([]).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_agents_key_idx").on(table.agentKey),
    index("broadcast_agents_health_idx").on(table.enabled, table.status, table.lastHeartbeatAt),
  ],
);

export const broadcastLiveSources = pgTable(
  "broadcast_live_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull(),
    name: varchar("name", { length: 240 }).notNull(),
    protocol: broadcastLiveProtocol("protocol").notNull(),
    status: broadcastLiveSourceStatus("status").default("offline").notNull(),
    endpointUrl: text("endpoint_url"),
    credentialSecretRef: varchar("credential_secret_ref", { length: 255 }),
    assignedAgentId: uuid("assigned_agent_id").references(() => broadcastAgents.id, { onDelete: "set null" }),
    failoverAssetId: uuid("failover_asset_id").references(() => broadcastMediaAssets.id, { onDelete: "set null" }),
    enabled: boolean("enabled").default(true).notNull(),
    autoRecord: boolean("auto_record").default(false).notNull(),
    reconnectTimeoutSeconds: integer("reconnect_timeout_seconds").default(10).notNull(),
    lastSignalAt: timestamp("last_signal_at", { withTimezone: true }),
    lastTakenLiveAt: timestamp("last_taken_live_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_live_sources_slug_idx").on(table.slug),
    index("broadcast_live_sources_health_idx").on(table.enabled, table.status, table.lastSignalAt),
    index("broadcast_live_sources_agent_idx").on(table.assignedAgentId),
    check("broadcast_live_sources_timeout_check", sql`${table.reconnectTimeoutSeconds} > 0`),
  ],
);

export const broadcastOutputs = pgTable(
  "broadcast_outputs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    kind: broadcastOutputKind("kind").default("program").notNull(),
    status: broadcastOutputStatus("status").default("disabled").notNull(),
    assignedAgentId: uuid("assigned_agent_id").references(() => broadcastAgents.id, { onDelete: "set null" }),
    casparChannel: integer("caspar_channel").default(1).notNull(),
    deliveryProvider: varchar("delivery_provider", { length: 80 }).default("casparcg").notNull(),
    deliveryProtocol: varchar("delivery_protocol", { length: 24 }),
    destinationUrl: text("destination_url"),
    credentialSecretRef: varchar("credential_secret_ref", { length: 255 }),
    providerInputId: varchar("provider_input_id", { length: 255 }),
    width: integer("width").default(1920).notNull(),
    height: integer("height").default(1080).notNull(),
    frameRateNumerator: integer("frame_rate_numerator").default(30).notNull(),
    frameRateDenominator: integer("frame_rate_denominator").default(1).notNull(),
    audioSampleRate: integer("audio_sample_rate").default(48000).notNull(),
    timeZone: varchar("time_zone", { length: 64 }).default("America/New_York").notNull(),
    alwaysOn: boolean("always_on").default(false).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    controlRevision: integer("control_revision").default(1).notNull(),
    consumerConfig: jsonb("consumer_config").$type<Record<string, unknown>>().default({}).notNull(),
    overlayConfig: jsonb("overlay_config").$type<Record<string, unknown>>().default({}).notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    lastError: text("last_error"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_outputs_slug_idx").on(table.slug),
    index("broadcast_outputs_health_idx").on(table.enabled, table.status, table.lastHeartbeatAt),
    index("broadcast_outputs_agent_idx").on(table.assignedAgentId, table.casparChannel),
    check("broadcast_outputs_channel_check", sql`${table.casparChannel} > 0`),
    check("broadcast_outputs_dimensions_check", sql`${table.width} > 0 and ${table.height} > 0`),
    check(
      "broadcast_outputs_frame_rate_check",
      sql`${table.frameRateNumerator} > 0 and ${table.frameRateDenominator} > 0`,
    ),
    check("broadcast_outputs_audio_rate_check", sql`${table.audioSampleRate} > 0`),
    check("broadcast_outputs_control_revision_check", sql`${table.controlRevision} > 0`),
  ],
);

export const broadcastGraphicLayers = pgTable(
  "broadcast_graphic_layers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    outputId: uuid("output_id").references(() => broadcastOutputs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    kind: broadcastGraphicKind("kind").notNull(),
    layer: integer("layer").notNull(),
    templateKey: varchar("template_key", { length: 160 }).notNull(),
    mediaAssetId: uuid("media_asset_id").references(() => broadcastMediaAssets.id, { onDelete: "set null" }),
    enabled: boolean("enabled").default(true).notNull(),
    persistent: boolean("persistent").default(false).notNull(),
    revision: integer("revision").default(1).notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().default({}).notNull(),
    style: jsonb("style").$type<Record<string, unknown>>().default({}).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdByClerkUserId: text("created_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("broadcast_graphic_layers_output_idx").on(table.outputId, table.enabled, table.layer),
    index("broadcast_graphic_layers_schedule_idx").on(table.startsAt, table.endsAt),
    check("broadcast_graphic_layers_layer_check", sql`${table.layer} >= 0`),
    check("broadcast_graphic_layers_revision_check", sql`${table.revision} > 0`),
    check(
      "broadcast_graphic_layers_schedule_check",
      sql`${table.endsAt} is null or ${table.startsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const broadcastTickerItems = pgTable(
  "broadcast_ticker_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    outputId: uuid("output_id").references(() => broadcastOutputs.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    priority: broadcastTickerPriority("priority").default("routine").notNull(),
    status: broadcastTickerStatus("status").default("draft").notNull(),
    sourceName: varchar("source_name", { length: 180 }),
    sourceUrl: text("source_url"),
    automationKey: varchar("automation_key", { length: 255 }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    minimumIntervalSeconds: integer("minimum_interval_seconds").default(0).notNull(),
    maximumPlays: integer("maximum_plays"),
    playCount: integer("play_count").default(0).notNull(),
    approvedByClerkUserId: text("approved_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdByClerkUserId: text("created_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_ticker_items_automation_idx").on(table.automationKey),
    index("broadcast_ticker_items_air_idx").on(table.outputId, table.status, table.priority, table.startsAt, table.expiresAt),
    check("broadcast_ticker_items_message_check", sql`char_length(${table.message}) > 0`),
    check(
      "broadcast_ticker_items_schedule_check",
      sql`${table.expiresAt} is null or ${table.startsAt} is null or ${table.expiresAt} > ${table.startsAt}`,
    ),
    check("broadcast_ticker_items_interval_check", sql`${table.minimumIntervalSeconds} >= 0`),
    check(
      "broadcast_ticker_items_play_count_check",
      sql`${table.playCount} >= 0 and (${table.maximumPlays} is null or ${table.maximumPlays} > 0)`,
    ),
  ],
);

export const broadcastClockTemplates = pgTable(
  "broadcast_clock_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 160 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    status: broadcastClockStatus("status").default("draft").notNull(),
    revision: integer("revision").default(1).notNull(),
    durationMs: integer("duration_ms").default(3600000).notNull(),
    timeZone: varchar("time_zone", { length: 64 }).default("America/New_York").notNull(),
    notes: text("notes"),
    createdByClerkUserId: text("created_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_clock_templates_revision_idx").on(table.slug, table.revision),
    uniqueIndex("broadcast_clock_templates_active_idx")
      .on(table.slug)
      .where(sql`${table.status} = 'active' and ${table.archivedAt} is null`),
    index("broadcast_clock_templates_status_idx").on(table.status, table.updatedAt),
    check("broadcast_clock_templates_revision_check", sql`${table.revision} > 0`),
    check("broadcast_clock_templates_duration_check", sql`${table.durationMs} > 0`),
  ],
);

export const broadcastClockSlots = pgTable(
  "broadcast_clock_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => broadcastClockTemplates.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    offsetMs: integer("offset_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    label: varchar("label", { length: 180 }).notNull(),
    sourceKind: broadcastProgramSource("source_kind").notNull(),
    mediaAssetId: uuid("media_asset_id").references(() => broadcastMediaAssets.id, { onDelete: "set null" }),
    mediaCategory: broadcastMediaCategory("media_category"),
    dynamicKey: varchar("dynamic_key", { length: 120 }),
    liveSourceId: uuid("live_source_id").references(() => broadcastLiveSources.id, { onDelete: "set null" }),
    selectionRules: jsonb("selection_rules").$type<Record<string, unknown>>().default({}).notNull(),
    transition: jsonb("transition").$type<Record<string, unknown>>().default({}).notNull(),
    overlayPolicy: jsonb("overlay_policy").$type<Record<string, unknown>>().default({}).notNull(),
    hardStart: boolean("hard_start").default(false).notNull(),
    allowTicker: boolean("allow_ticker").default(true).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_clock_slots_position_idx").on(table.templateId, table.position),
    uniqueIndex("broadcast_clock_slots_offset_idx").on(table.templateId, table.offsetMs),
    index("broadcast_clock_slots_source_idx").on(table.sourceKind, table.mediaCategory, table.dynamicKey),
    check("broadcast_clock_slots_position_check", sql`${table.position} >= 0`),
    check("broadcast_clock_slots_offset_check", sql`${table.offsetMs} >= 0`),
    check("broadcast_clock_slots_duration_check", sql`${table.durationMs} > 0`),
    check(
      "broadcast_clock_slots_source_check",
      sql`(${table.sourceKind} = 'asset' and ${table.mediaAssetId} is not null)
        or (${table.sourceKind} = 'category' and ${table.mediaCategory} is not null)
        or (${table.sourceKind} = 'dynamic' and ${table.dynamicKey} is not null)
        or (${table.sourceKind} = 'live' and ${table.liveSourceId} is not null)
        or ${table.sourceKind} = 'break'`,
    ),
  ],
);

export const broadcastProgramLogs = pgTable(
  "broadcast_program_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    outputId: uuid("output_id")
      .notNull()
      .references(() => broadcastOutputs.id, { onDelete: "cascade" }),
    serviceDate: date("service_date").notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    status: broadcastProgramLogStatus("status").default("draft").notNull(),
    revision: integer("revision").default(1).notNull(),
    timeZone: varchar("time_zone", { length: 64 }).default("America/New_York").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    clockTemplateId: uuid("clock_template_id").references(() => broadcastClockTemplates.id, { onDelete: "set null" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lockedThrough: timestamp("locked_through", { withTimezone: true }),
    approvedByClerkUserId: text("approved_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_program_logs_revision_idx").on(table.outputId, table.serviceDate, table.revision),
    uniqueIndex("broadcast_program_logs_current_idx")
      .on(table.outputId, table.serviceDate)
      .where(sql`${table.status} in ('published', 'on_air') and ${table.archivedAt} is null`),
    index("broadcast_program_logs_air_idx").on(table.outputId, table.status, table.startsAt, table.endsAt),
    check("broadcast_program_logs_revision_check", sql`${table.revision} > 0`),
    check("broadcast_program_logs_window_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);

export const broadcastProgramItems = pgTable(
  "broadcast_program_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    logId: uuid("log_id")
      .notNull()
      .references(() => broadcastProgramLogs.id, { onDelete: "cascade" }),
    clockSlotId: uuid("clock_slot_id").references(() => broadcastClockSlots.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    label: varchar("label", { length: 240 }).notNull(),
    sourceKind: broadcastProgramSource("source_kind").notNull(),
    mediaCategory: broadcastMediaCategory("media_category"),
    mediaVersionId: uuid("media_version_id").references(() => broadcastMediaVersions.id, { onDelete: "restrict" }),
    dynamicKey: varchar("dynamic_key", { length: 120 }),
    liveSourceId: uuid("live_source_id").references(() => broadcastLiveSources.id, { onDelete: "set null" }),
    status: broadcastProgramItemStatus("status").default("scheduled").notNull(),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }).notNull(),
    plannedEndAt: timestamp("planned_end_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    hardStart: boolean("hard_start").default(false).notNull(),
    allowTicker: boolean("allow_ticker").default(true).notNull(),
    transition: jsonb("transition").$type<Record<string, unknown>>().default({}).notNull(),
    overlayPolicy: jsonb("overlay_policy").$type<Record<string, unknown>>().default({}).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_program_items_position_idx").on(table.logId, table.position),
    index("broadcast_program_items_start_idx").on(table.logId, table.plannedStartAt),
    index("broadcast_program_items_up_next_idx").on(table.logId, table.status, table.plannedStartAt),
    index("broadcast_program_items_media_idx").on(table.mediaVersionId),
    check("broadcast_program_items_position_check", sql`${table.position} >= 0`),
    check("broadcast_program_items_duration_check", sql`${table.durationMs} > 0`),
    check("broadcast_program_items_window_check", sql`${table.plannedEndAt} > ${table.plannedStartAt}`),
    check(
      "broadcast_program_items_source_check",
      sql`(${table.sourceKind} = 'asset' and ${table.mediaVersionId} is not null)
        or (${table.sourceKind} = 'category' and ${table.mediaCategory} is not null)
        or (${table.sourceKind} = 'dynamic' and ${table.dynamicKey} is not null)
        or (${table.sourceKind} = 'live' and ${table.liveSourceId} is not null)
        or ${table.sourceKind} = 'break'`,
    ),
  ],
);

export const broadcastAsRunEvents = pgTable(
  "broadcast_as_run_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    outputId: uuid("output_id")
      .notNull()
      .references(() => broadcastOutputs.id, { onDelete: "restrict" }),
    logId: uuid("log_id").references(() => broadcastProgramLogs.id, { onDelete: "set null" }),
    programItemId: uuid("program_item_id").references(() => broadcastProgramItems.id, { onDelete: "set null" }),
    mediaVersionId: uuid("media_version_id").references(() => broadcastMediaVersions.id, { onDelete: "set null" }),
    liveSourceId: uuid("live_source_id").references(() => broadcastLiveSources.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => broadcastAgents.id, { onDelete: "set null" }),
    eventType: broadcastAsRunEventType("event_type").notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }),
    label: varchar("label", { length: 240 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("broadcast_as_run_events_provider_idx").on(table.providerEventId),
    index("broadcast_as_run_events_output_time_idx").on(table.outputId, table.occurredAt),
    index("broadcast_as_run_events_item_time_idx").on(table.programItemId, table.occurredAt),
    index("broadcast_as_run_events_media_time_idx").on(table.mediaVersionId, table.occurredAt),
    check("broadcast_as_run_events_duration_check", sql`${table.durationMs} is null or ${table.durationMs} >= 0`),
  ],
);

export const broadcastAgentHeartbeats = pgTable(
  "broadcast_agent_heartbeats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => broadcastAgents.id, { onDelete: "cascade" }),
    outputId: uuid("output_id").references(() => broadcastOutputs.id, { onDelete: "set null" }),
    currentProgramItemId: uuid("current_program_item_id").references(() => broadcastProgramItems.id, { onDelete: "set null" }),
    status: broadcastAgentStatus("status").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().default({}).notNull(),
    diagnostics: jsonb("diagnostics").$type<Record<string, unknown>>().default({}).notNull(),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("broadcast_agent_heartbeats_agent_time_idx").on(table.agentId, table.receivedAt),
    index("broadcast_agent_heartbeats_output_time_idx").on(table.outputId, table.receivedAt),
    index("broadcast_agent_heartbeats_received_idx").on(table.receivedAt),
  ],
);

export const broadcastAgentCommands = pgTable(
  "broadcast_agent_commands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => broadcastAgents.id, { onDelete: "cascade" }),
    outputId: uuid("output_id").references(() => broadcastOutputs.id, { onDelete: "set null" }),
    programItemId: uuid("program_item_id").references(() => broadcastProgramItems.id, { onDelete: "set null" }),
    commandType: varchar("command_type", { length: 80 }).notNull(),
    status: broadcastAgentCommandStatus("status").default("queued").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    notBefore: timestamp("not_before", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    requestedByClerkUserId: text("requested_by_clerk_user_id").references(() => appUsers.clerkUserId, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("broadcast_agent_commands_idempotency_idx").on(table.idempotencyKey),
    index("broadcast_agent_commands_claim_idx").on(table.agentId, table.status, table.notBefore, table.expiresAt),
    index("broadcast_agent_commands_output_idx").on(table.outputId, table.createdAt),
    check("broadcast_agent_commands_attempts_check", sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0`),
    check(
      "broadcast_agent_commands_expiry_check",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
