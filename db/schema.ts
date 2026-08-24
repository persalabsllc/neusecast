import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const memberRole = pgEnum("member_role", ["owner", "admin", "sales", "host", "advertiser"]);
export const organizationType = pgEnum("organization_type", ["network", "host", "advertiser"]);
export const contentKind = pgEnum("content_kind", ["host", "advertiser", "weather", "event", "news", "local"]);
export const contentStatus = pgEnum("content_status", ["draft", "review", "approved", "scheduled", "archived"]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "pending", "active", "paused", "completed", "cancelled"]);
export const screenStatus = pgEnum("screen_status", ["pending", "online", "attention", "offline"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  ...timestamps,
}, (table) => [uniqueIndex("users_clerk_user_id_idx").on(table.clerkUserId), uniqueIndex("users_email_idx").on(table.email)]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: organizationType("type").notNull(),
  clerkOrganizationId: text("clerk_organization_id"),
  stripeCustomerId: text("stripe_customer_id"),
  ...timestamps,
}, (table) => [uniqueIndex("organizations_slug_idx").on(table.slug), uniqueIndex("organizations_clerk_id_idx").on(table.clerkOrganizationId)]);

export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: memberRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("organization_member_idx").on(table.organizationId, table.userId)]);

export const venues = pgTable("venues", {
  id: uuid("id").defaultRandom().primaryKey(),
  hostOrganizationId: uuid("host_organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city").notNull(),
  state: text("state").default("NC").notNull(),
  postalCode: text("postal_code"),
  timezone: text("timezone").default("America/New_York").notNull(),
  latitude: numeric("latitude", { precision: 9, scale: 6 }),
  longitude: numeric("longitude", { precision: 9, scale: 6 }),
  ...timestamps,
}, (table) => [index("venues_host_idx").on(table.hostOrganizationId)]);

export const screens = pgTable("screens", {
  id: uuid("id").defaultRandom().primaryKey(),
  venueId: uuid("venue_id").references(() => venues.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull(),
  status: screenStatus("status").default("pending").notNull(),
  orientation: text("orientation").default("landscape").notNull(),
  playerProvider: text("player_provider").default("neusecast").notNull(),
  externalPlayerId: text("external_player_id"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("screens_public_key_idx").on(table.publicKey), index("screens_venue_idx").on(table.venueId)]);

export const contentItems = pgTable("content_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  kind: contentKind("kind").notNull(),
  status: contentStatus("status").default("draft").notNull(),
  title: text("title").notNull(),
  templateKey: text("template_key").notNull(),
  mediaUrl: text("media_url"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("content_status_kind_idx").on(table.status, table.kind), index("content_organization_idx").on(table.organizationId)]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  advertiserOrganizationId: uuid("advertiser_organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  status: campaignStatus("status").default("draft").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  targetPlays: integer("target_plays"),
  bookedAmountCents: integer("booked_amount_cents").default(0).notNull(),
  stripePriceId: text("stripe_price_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  paymentStatus: text("payment_status").default("unpaid").notNull(),
  ...timestamps,
}, (table) => [index("campaigns_advertiser_idx").on(table.advertiserOrganizationId), index("campaigns_status_idx").on(table.status)]);

export const campaignContent = pgTable("campaign_content", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }).notNull(),
}, (table) => [uniqueIndex("campaign_content_idx").on(table.campaignId, table.contentItemId)]);

export const playlists = pgTable("playlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
});

export const playlistItems = pgTable("playlist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  playlistId: uuid("playlist_id").references(() => playlists.id, { onDelete: "cascade" }).notNull(),
  contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  durationSeconds: integer("duration_seconds").default(12).notNull(),
  weight: integer("weight").default(1).notNull(),
}, (table) => [uniqueIndex("playlist_position_idx").on(table.playlistId, table.position)]);

export const screenAssignments = pgTable("screen_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  screenId: uuid("screen_id").references(() => screens.id, { onDelete: "cascade" }).notNull(),
  playlistId: uuid("playlist_id").references(() => playlists.id, { onDelete: "cascade" }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  priority: integer("priority").default(0).notNull(),
}, (table) => [index("screen_assignments_screen_idx").on(table.screenId)]);

export const playbackEvents = pgTable("playback_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  screenId: uuid("screen_id").references(() => screens.id, { onDelete: "cascade" }).notNull(),
  contentItemId: uuid("content_item_id").references(() => contentItems.id, { onDelete: "cascade" }).notNull(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  playedAt: timestamp("played_at", { withTimezone: true }).defaultNow().notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  completed: boolean("completed").default(true).notNull(),
  playerVersion: text("player_version"),
}, (table) => [index("playback_campaign_time_idx").on(table.campaignId, table.playedAt), index("playback_screen_time_idx").on(table.screenId, table.playedAt)]);

export const advertiserLeads = pgTable("advertiser_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  message: text("message"),
  status: text("status").default("new").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("audit_entity_idx").on(table.entityType, table.entityId)]);

