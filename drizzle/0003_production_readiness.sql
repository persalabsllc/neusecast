UPDATE "host_content"
SET "status" = 'scheduled', "updated_at" = now()
WHERE "screen_id" IS NOT NULL AND "status" IN ('submitted', 'approved');
--> statement-breakpoint
DELETE FROM "generated_content"
WHERE "id" IN (
  '77777777-7777-4777-8777-777777777771',
  '77777777-7777-4777-8777-777777777772',
  '77777777-7777-4777-8777-777777777773',
  '77777777-7777-4777-8777-777777777774'
);
--> statement-breakpoint
DELETE FROM "campaign_orders" WHERE "campaign_id" = '44444444-4444-4444-8444-444444444444';
--> statement-breakpoint
DELETE FROM "advertiser_accounts" WHERE "id" = '33333333-3333-4333-8333-333333333333';
--> statement-breakpoint
DELETE FROM "venues" WHERE "id" = '11111111-1111-4111-8111-111111111111';
--> statement-breakpoint
DELETE FROM "app_users" WHERE "clerk_user_id" IN ('demo-advertiser', 'demo-host');
