import { sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db";

let setupPromise: Promise<void> | null = null;

export function ensureScreenManagementSchema() {
  if (!setupPromise) {
    setupPromise = (async () => {
      const database = getDatabase();
      await database.execute(sql`
        ALTER TABLE "host_content"
        ADD COLUMN IF NOT EXISTS "screen_id" uuid REFERENCES "screens"("id") ON DELETE cascade
      `);
      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS "host_content_screen_idx" ON "host_content" ("screen_id")
      `);
      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS "screen_advertiser_blocks" (
          "screen_id" uuid NOT NULL REFERENCES "screens"("id") ON DELETE cascade,
          "advertiser_account_id" uuid NOT NULL REFERENCES "advertiser_accounts"("id") ON DELETE cascade,
          "blocked_by_clerk_user_id" text NOT NULL REFERENCES "app_users"("clerk_user_id") ON DELETE restrict,
          "reason" text,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          CONSTRAINT "screen_advertiser_blocks_screen_id_advertiser_account_id_pk"
            PRIMARY KEY ("screen_id", "advertiser_account_id")
        )
      `);
      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS "screen_advertiser_blocks_advertiser_idx"
        ON "screen_advertiser_blocks" ("advertiser_account_id")
      `);
      await database.execute(sql`
        UPDATE "host_content"
        SET "status" = 'scheduled', "updated_at" = now()
        WHERE "screen_id" IS NOT NULL AND "status" IN ('submitted', 'approved')
      `);
      await database.execute(sql`
        DELETE FROM "generated_content"
        WHERE "id" IN (
          '77777777-7777-4777-8777-777777777771',
          '77777777-7777-4777-8777-777777777772',
          '77777777-7777-4777-8777-777777777773',
          '77777777-7777-4777-8777-777777777774'
        )
      `);
      await database.execute(sql`
        DELETE FROM "campaign_orders"
        WHERE "campaign_id" = '44444444-4444-4444-8444-444444444444'
      `);
      await database.execute(sql`
        DELETE FROM "advertiser_accounts"
        WHERE "id" = '33333333-3333-4333-8333-333333333333'
      `);
      await database.execute(sql`
        DELETE FROM "venues"
        WHERE "id" = '11111111-1111-4111-8111-111111111111'
      `);
      await database.execute(sql`
        DELETE FROM "app_users"
        WHERE "clerk_user_id" IN ('demo-advertiser', 'demo-host')
      `);
    })().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }

  return setupPromise;
}
