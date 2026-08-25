CREATE TYPE "public"."host_prospect_activity_type" AS ENUM('research', 'note', 'email', 'status_change', 'meeting', 'conversion');--> statement-breakpoint
CREATE TYPE "public"."host_prospect_delivery_status" AS ENUM('draft', 'queued', 'cancelled', 'sent', 'received', 'failed', 'bounced', 'completed');--> statement-breakpoint
CREATE TYPE "public"."host_prospect_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."host_prospect_status" AS ENUM('researching', 'ready', 'queued', 'contacted', 'follow_up', 'replied', 'meeting', 'committed', 'converted', 'not_interested', 'do_not_contact');--> statement-breakpoint
CREATE TABLE "host_prospect_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"activity_type" "host_prospect_activity_type" NOT NULL,
	"delivery_status" "host_prospect_delivery_status" DEFAULT 'completed' NOT NULL,
	"direction" varchar(16),
	"channel" varchar(24),
	"subject" varchar(240),
	"body" text,
	"provider_message_id" varchar(255),
	"provider_thread_id" varchar(255),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_clerk_user_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" varchar(200) NOT NULL,
	"venue_type" varchar(80) NOT NULL,
	"address_line_1" varchar(200),
	"city" varchar(100) DEFAULT 'New Bern' NOT NULL,
	"state" varchar(2) DEFAULT 'NC' NOT NULL,
	"postal_code" varchar(12),
	"market" varchar(100) DEFAULT 'New Bern' NOT NULL,
	"website_url" text,
	"contact_page_url" text,
	"research_source_url" text,
	"contact_name" varchar(160),
	"contact_title" varchar(120),
	"email" varchar(320),
	"phone" varchar(40),
	"email_verified" boolean DEFAULT false NOT NULL,
	"fit_angle" text,
	"priority" "host_prospect_priority" DEFAULT 'medium' NOT NULL,
	"status" "host_prospect_status" DEFAULT 'researching' NOT NULL,
	"last_contacted_at" timestamp with time zone,
	"last_replied_at" timestamp with time zone,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"converted_venue_id" uuid,
	"created_by_clerk_user_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "host_prospect_activities" ADD CONSTRAINT "host_prospect_activities_prospect_id_host_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."host_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_prospects" ADD CONSTRAINT "host_prospects_converted_venue_id_venues_id_fk" FOREIGN KEY ("converted_venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "host_prospect_activities_timeline_idx" ON "host_prospect_activities" USING btree ("prospect_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "host_prospect_activities_one_queued_email_idx" ON "host_prospect_activities" USING btree ("prospect_id") WHERE "host_prospect_activities"."activity_type" = 'email' and "host_prospect_activities"."delivery_status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "host_prospect_activities_provider_message_idx" ON "host_prospect_activities" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "host_prospects_status_follow_up_idx" ON "host_prospects" USING btree ("status","next_action_at");--> statement-breakpoint
CREATE INDEX "host_prospects_market_priority_idx" ON "host_prospects" USING btree ("market","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "host_prospects_email_idx" ON "host_prospects" USING btree ("email");