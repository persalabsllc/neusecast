CREATE TYPE "public"."radio_brief_status" AS ENUM('pending_payment', 'submitted', 'in_production', 'approved', 'active', 'retired');--> statement-breakpoint
CREATE TABLE "advertiser_radio_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"advertiser_account_id" uuid NOT NULL,
	"campaign_id" uuid,
	"status" "radio_brief_status" DEFAULT 'pending_payment' NOT NULL,
	"message_focus" text NOT NULL,
	"destination" varchar(255) NOT NULL,
	"pronunciation_notes" text,
	"preferred_tone" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advertiser_accounts" ADD COLUMN "subscription_plan_key" varchar(40);--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD COLUMN "plan_key" varchar(40) DEFAULT 'screens' NOT NULL;--> statement-breakpoint
UPDATE "advertiser_accounts"
SET "subscription_plan_key" = 'screens'
WHERE "stripe_subscription_id" IS NOT NULL
   OR "subscription_status" <> 'inactive';--> statement-breakpoint
ALTER TABLE "advertiser_radio_briefs" ADD CONSTRAINT "advertiser_radio_briefs_advertiser_account_id_advertiser_accounts_id_fk" FOREIGN KEY ("advertiser_account_id") REFERENCES "public"."advertiser_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertiser_radio_briefs" ADD CONSTRAINT "advertiser_radio_briefs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advertiser_radio_briefs_advertiser_idx" ON "advertiser_radio_briefs" USING btree ("advertiser_account_id");--> statement-breakpoint
CREATE INDEX "advertiser_radio_briefs_status_idx" ON "advertiser_radio_briefs" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "advertiser_accounts" ADD CONSTRAINT "advertiser_subscription_plan_key_check" CHECK ("advertiser_accounts"."subscription_plan_key" is null or "advertiser_accounts"."subscription_plan_key" in ('screens', 'hear_see', 'local_dominance'));--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD CONSTRAINT "campaign_orders_plan_key_check" CHECK ("campaign_orders"."plan_key" in ('screens', 'hear_see', 'local_dominance'));
