CREATE TYPE "public"."newsroom_edition_status" AS ENUM('draft', 'review', 'published', 'withdrawn', 'failed');--> statement-breakpoint
CREATE TYPE "public"."newsroom_risk_level" AS ENUM('low', 'sensitive', 'critical');--> statement-breakpoint
CREATE TYPE "public"."newsroom_story_status" AS ENUM('review', 'approved', 'rejected', 'killed');--> statement-breakpoint
CREATE TABLE "newsroom_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market" varchar(100) NOT NULL,
	"slot" varchar(24) NOT NULL,
	"label" varchar(120) NOT NULL,
	"headline" varchar(180) NOT NULL,
	"status" "newsroom_edition_status" DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer DEFAULT 180 NOT NULL,
	"stories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"script" text,
	"ticker" text,
	"video_url" text,
	"poster_url" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_hash" varchar(64),
	"generated_by" varchar(80) DEFAULT 'openai_web_search' NOT NULL,
	"approved_by_clerk_user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsroom_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"homepage_url" text NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"trust_tier" varchar(40) NOT NULL,
	"market" varchar(100),
	"active" boolean DEFAULT true NOT NULL,
	"attribution_label" varchar(180) NOT NULL,
	"media_policy" varchar(80) DEFAULT 'facts_only' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsroom_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition_id" uuid NOT NULL,
	"source_id" uuid,
	"market" varchar(100) NOT NULL,
	"category" varchar(40) NOT NULL,
	"headline" varchar(180) NOT NULL,
	"summary" text NOT NULL,
	"narration" text NOT NULL,
	"ticker" varchar(300) NOT NULL,
	"source_name" varchar(180) NOT NULL,
	"source_url" text NOT NULL,
	"source_published_at" timestamp with time zone,
	"location_label" varchar(120),
	"image_url" text,
	"image_credit" varchar(240),
	"image_source_url" text,
	"risk_level" "newsroom_risk_level" DEFAULT 'low' NOT NULL,
	"status" "newsroom_story_status" DEFAULT 'review' NOT NULL,
	"duration_seconds" integer DEFAULT 26 NOT NULL,
	"visual_template" varchar(40) DEFAULT 'headline' NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"reviewed_by_clerk_user_id" text,
	"reviewed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "newsroom_editions" ADD CONSTRAINT "newsroom_editions_approved_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("approved_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsroom_stories" ADD CONSTRAINT "newsroom_stories_edition_id_newsroom_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."newsroom_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsroom_stories" ADD CONSTRAINT "newsroom_stories_source_id_newsroom_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."newsroom_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsroom_stories" ADD CONSTRAINT "newsroom_stories_reviewed_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("reviewed_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsroom_editions_air_idx" ON "newsroom_editions" USING btree ("market","status","published_at","expires_at");--> statement-breakpoint
CREATE INDEX "newsroom_editions_slot_idx" ON "newsroom_editions" USING btree ("market","slot","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsroom_sources_homepage_idx" ON "newsroom_sources" USING btree ("homepage_url");--> statement-breakpoint
CREATE INDEX "newsroom_sources_market_idx" ON "newsroom_sources" USING btree ("market","active");--> statement-breakpoint
CREATE INDEX "newsroom_stories_edition_idx" ON "newsroom_stories" USING btree ("edition_id","status");--> statement-breakpoint
CREATE INDEX "newsroom_stories_review_idx" ON "newsroom_stories" USING btree ("status","risk_level","created_at");--> statement-breakpoint
CREATE INDEX "newsroom_stories_fingerprint_idx" ON "newsroom_stories" USING btree ("fingerprint");