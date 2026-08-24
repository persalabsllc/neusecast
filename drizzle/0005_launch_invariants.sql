ALTER TABLE "advertiser_accounts"
  ADD COLUMN IF NOT EXISTS "stripe_event_created_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "advertiser_accounts"
SET
  "stripe_subscription_id" = NULL,
  "subscription_status" = 'inactive',
  "updated_at" = now()
WHERE "stripe_subscription_id" IS NOT NULL
  AND "stripe_subscription_id" NOT LIKE 'sub\_%' ESCAPE '\';
--> statement-breakpoint
UPDATE "advertiser_accounts"
SET "stripe_event_created_at" = "updated_at"
WHERE "stripe_subscription_id" IS NOT NULL
  AND "stripe_event_created_at" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "advertiser_accounts"
    GROUP BY "owner_clerk_user_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one advertiser account per Clerk user while duplicate owners exist.';
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "advertiser_owner_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertiser_owner_idx"
  ON "advertiser_accounts" USING btree ("owner_clerk_user_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "campaign_orders"
    WHERE "status" IN ('pending', 'failed')
      AND "stripe_payment_intent_id" IS NULL
    GROUP BY "advertiser_account_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one open checkout per advertiser while duplicate open orders exist.';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_open_advertiser_idx"
  ON "campaign_orders" USING btree ("advertiser_account_id")
  WHERE "status" IN ('pending', 'failed')
    AND "stripe_payment_intent_id" IS NULL;
