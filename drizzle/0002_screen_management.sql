ALTER TABLE "host_content" ADD COLUMN IF NOT EXISTS "screen_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.host_content'::regclass
      AND confrelid = 'public.screens'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE "host_content"
      ADD CONSTRAINT "host_content_screen_id_screens_id_fk"
      FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "host_content_screen_idx" ON "host_content" USING btree ("screen_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "screen_advertiser_blocks" (
  "screen_id" uuid NOT NULL,
  "advertiser_account_id" uuid NOT NULL,
  "blocked_by_clerk_user_id" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.screen_advertiser_blocks'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE "screen_advertiser_blocks"
      ADD CONSTRAINT "screen_advertiser_blocks_screen_id_advertiser_account_id_pk"
      PRIMARY KEY ("screen_id", "advertiser_account_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.screen_advertiser_blocks'::regclass
      AND confrelid = 'public.screens'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE "screen_advertiser_blocks"
      ADD CONSTRAINT "screen_advertiser_blocks_screen_id_screens_id_fk"
      FOREIGN KEY ("screen_id") REFERENCES "public"."screens"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.screen_advertiser_blocks'::regclass
      AND confrelid = 'public.advertiser_accounts'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE "screen_advertiser_blocks"
      ADD CONSTRAINT "screen_advertiser_blocks_advertiser_account_id_advertiser_accounts_id_fk"
      FOREIGN KEY ("advertiser_account_id") REFERENCES "public"."advertiser_accounts"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.screen_advertiser_blocks'::regclass
      AND confrelid = 'public.app_users'::regclass
      AND contype = 'f'
  ) THEN
    ALTER TABLE "screen_advertiser_blocks"
      ADD CONSTRAINT "screen_advertiser_blocks_blocked_by_clerk_user_id_app_users_clerk_user_id_fk"
      FOREIGN KEY ("blocked_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "screen_advertiser_blocks_advertiser_idx" ON "screen_advertiser_blocks" USING btree ("advertiser_account_id");
