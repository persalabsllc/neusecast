ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "time_zone" varchar(64) DEFAULT 'America/New_York' NOT NULL;
--> statement-breakpoint
ALTER TABLE "advertiser_accounts" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "advertiser_accounts" ADD COLUMN IF NOT EXISTS "subscription_status" varchar(32) DEFAULT 'inactive' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertiser_stripe_subscription_idx" ON "advertiser_accounts" USING btree ("stripe_subscription_id");
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "billing_paused" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "advertiser_accounts" AS "advertiser"
SET
  "stripe_subscription_id" = "latest_paid_order"."stripe_payment_intent_id",
  "subscription_status" = 'active',
  "updated_at" = now()
FROM (
  SELECT DISTINCT ON ("advertiser_account_id")
    "advertiser_account_id",
    "stripe_payment_intent_id"
  FROM "campaign_orders"
  WHERE
    "status" = 'paid'
    AND "stripe_payment_intent_id" IS NOT NULL
  ORDER BY "advertiser_account_id", "paid_at" DESC NULLS LAST, "created_at" DESC
) AS "latest_paid_order"
WHERE
  "advertiser"."id" = "latest_paid_order"."advertiser_account_id"
  AND "advertiser"."stripe_subscription_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "device_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "device_credential_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "device_claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "pairing_token_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "pairing_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "last_manifest_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "last_manifest_version" varchar(64);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "last_playback_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "current_item_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "current_manifest_version" varchar(64);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "player_version" varchar(80);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "session_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "viewport_width" integer;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "viewport_height" integer;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "last_error_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "screens_last_heartbeat_idx" ON "screens" USING btree ("last_heartbeat_at");
--> statement-breakpoint
ALTER TABLE "screens" ALTER COLUMN "provider" SET DEFAULT 'neusecast';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_manifest_snapshots" (
  "screen_id" uuid NOT NULL REFERENCES "screens"("id") ON DELETE cascade,
  "version" varchar(64) NOT NULL,
  "items" jsonb NOT NULL,
  "delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "player_manifest_snapshots_screen_id_version_pk" PRIMARY KEY ("screen_id", "version")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_manifest_snapshots_delivery_idx"
ON "player_manifest_snapshots" USING btree ("delivered_at");
