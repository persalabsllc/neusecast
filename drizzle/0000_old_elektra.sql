CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'payment_pending', 'submitted', 'approved', 'scheduled', 'active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('draft', 'processing', 'review', 'approved', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."creative_type" AS ENUM('image', 'video', 'generated_slide');--> statement-breakpoint
CREATE TYPE "public"."host_content_status" AS ENUM('draft', 'submitted', 'approved', 'scheduled', 'expired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'failed', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."screen_status" AS ENUM('pending', 'online', 'offline', 'maintenance', 'retired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'host', 'advertiser');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."venue_status" AS ENUM('lead', 'approved', 'installing', 'active', 'paused', 'removed');--> statement-breakpoint
CREATE TABLE "advertiser_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_clerk_user_id" text NOT NULL,
	"business_name" varchar(200) NOT NULL,
	"billing_email" varchar(320) NOT NULL,
	"phone" varchar(40),
	"website" text,
	"stripe_customer_id" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(160),
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"advertiser_account_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"stripe_checkout_session_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_screens" (
	"campaign_id" uuid NOT NULL,
	"screen_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"scheduled_plays_per_day" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_screens_campaign_id_screen_id_pk" PRIMARY KEY("campaign_id","screen_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_account_id" uuid NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"name" varchar(180) NOT NULL,
	"objective" text,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 15 NOT NULL,
	"targeting" jsonb DEFAULT '{}'::jsonb,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"type" "creative_type" NOT NULL,
	"status" "creative_status" DEFAULT 'draft' NOT NULL,
	"name" varchar(180) NOT NULL,
	"headline" varchar(120),
	"body" text,
	"call_to_action" varchar(120),
	"media_url" text,
	"thumbnail_url" text,
	"duration_seconds" integer DEFAULT 15 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(40) NOT NULL,
	"market" varchar(100),
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"source_name" varchar(160),
	"source_url" text,
	"artwork_url" text,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"approved" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"submitted_by_clerk_user_id" text NOT NULL,
	"status" "host_content_status" DEFAULT 'draft' NOT NULL,
	"template" varchar(60) NOT NULL,
	"headline" varchar(120) NOT NULL,
	"body" text,
	"call_to_action" varchar(120),
	"media_url" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playback_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"screen_id" uuid NOT NULL,
	"campaign_id" uuid,
	"creative_id" uuid,
	"provider_event_id" varchar(255),
	"played_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider" varchar(60) DEFAULT 'yodeck' NOT NULL,
	"provider_screen_id" varchar(255),
	"orientation" varchar(20) DEFAULT 'landscape' NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"status" "screen_status" DEFAULT 'pending' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_clerk_user_id" text,
	"name" varchar(200) NOT NULL,
	"venue_type" varchar(80) NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"city" varchar(100) NOT NULL,
	"state" varchar(2) DEFAULT 'NC' NOT NULL,
	"postal_code" varchar(12) NOT NULL,
	"market" varchar(100) NOT NULL,
	"audience_description" text,
	"estimated_daily_views" integer,
	"status" "venue_status" DEFAULT 'lead' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advertiser_accounts" ADD CONSTRAINT "advertiser_accounts_owner_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("owner_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD CONSTRAINT "campaign_orders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD CONSTRAINT "campaign_orders_advertiser_account_id_advertiser_accounts_id_fk" FOREIGN KEY ("advertiser_account_id") REFERENCES "public"."advertiser_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_screens" ADD CONSTRAINT "campaign_screens_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_screens" ADD CONSTRAINT "campaign_screens_screen_id_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiser_account_id_advertiser_accounts_id_fk" FOREIGN KEY ("advertiser_account_id") REFERENCES "public"."advertiser_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("created_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_created_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("created_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_content" ADD CONSTRAINT "host_content_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_content" ADD CONSTRAINT "host_content_submitted_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("submitted_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_events" ADD CONSTRAINT "playback_events_screen_id_screens_id_fk" FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_events" ADD CONSTRAINT "playback_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_events" ADD CONSTRAINT "playback_events_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screens" ADD CONSTRAINT "screens_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_host_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("host_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advertiser_owner_idx" ON "advertiser_accounts" USING btree ("owner_clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "advertiser_stripe_customer_idx" ON "advertiser_accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_idx" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "orders_campaign_idx" ON "campaign_orders" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_session_idx" ON "campaign_orders" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "campaign_screens_screen_idx" ON "campaign_screens" USING btree ("screen_id");--> statement-breakpoint
CREATE INDEX "campaigns_advertiser_idx" ON "campaigns" USING btree ("advertiser_account_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creatives_campaign_idx" ON "creatives" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "generated_content_market_idx" ON "generated_content" USING btree ("market","category");--> statement-breakpoint
CREATE INDEX "host_content_venue_idx" ON "host_content" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "playback_screen_time_idx" ON "playback_events" USING btree ("screen_id","played_at");--> statement-breakpoint
CREATE INDEX "playback_campaign_time_idx" ON "playback_events" USING btree ("campaign_id","played_at");--> statement-breakpoint
CREATE UNIQUE INDEX "playback_provider_event_idx" ON "playback_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "screens_venue_idx" ON "screens" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "screens_provider_id_idx" ON "screens" USING btree ("provider","provider_screen_id");--> statement-breakpoint
CREATE INDEX "venues_market_idx" ON "venues" USING btree ("market");--> statement-breakpoint
CREATE INDEX "venues_host_idx" ON "venues" USING btree ("host_clerk_user_id");