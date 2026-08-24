ALTER TABLE "campaign_orders" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD COLUMN "terms_version" varchar(40);