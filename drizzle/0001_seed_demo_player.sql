INSERT INTO "app_users" ("clerk_user_id", "email", "display_name", "role", "status")
VALUES
  ('demo-advertiser', 'advertiser-demo@neusecast.local', 'NeuseCast Demo Advertiser', 'advertiser', 'active'),
  ('demo-host', 'host-demo@neusecast.local', 'NeuseCast Demo Host', 'host', 'active')
ON CONFLICT ("clerk_user_id") DO UPDATE SET "display_name" = EXCLUDED."display_name", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "venues" (
  "id", "host_clerk_user_id", "name", "venue_type", "address_line_1", "city", "state",
  "postal_code", "market", "audience_description", "estimated_daily_views", "status"
)
VALUES (
  '11111111-1111-4111-8111-111111111111', 'demo-host', 'NeuseCast Test Venue', 'Restaurant',
  'Downtown New Bern', 'New Bern', 'NC', '28560', 'New Bern',
  'A live browser-based preview of the founding NeuseCast network.', 425, 'active'
)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "status" = 'active', "updated_at" = now();
--> statement-breakpoint
INSERT INTO "screens" (
  "id", "venue_id", "name", "provider", "provider_screen_id", "orientation",
  "monthly_price_cents", "status", "active"
)
VALUES (
  '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
  'New Bern Browser Player', 'neusecast', 'demo-new-bern', 'landscape', 9700, 'online', true
)
ON CONFLICT ("id") DO UPDATE SET "provider_screen_id" = 'demo-new-bern', "active" = true, "updated_at" = now();
--> statement-breakpoint
INSERT INTO "advertiser_accounts" (
  "id", "owner_clerk_user_id", "business_name", "billing_email", "active"
)
VALUES (
  '33333333-3333-4333-8333-333333333333', 'demo-advertiser', 'Founding Advertiser Demo',
  'advertiser-demo@neusecast.local', true
)
ON CONFLICT ("id") DO UPDATE SET "business_name" = EXCLUDED."business_name", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "campaigns" (
  "id", "advertiser_account_id", "created_by_clerk_user_id", "name", "objective", "status",
  "starts_at", "ends_at", "duration_seconds", "targeting", "subtotal_cents", "total_cents"
)
VALUES (
  '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333',
  'demo-advertiser', 'Founding Network Test Campaign', 'Prove the complete NeuseCast playback pipeline.',
  'active', now() - interval '1 day', now() + interval '1 year', 12,
  '{"markets":["New Bern"],"notes":"Browser player validation"}'::jsonb, 9700, 9700
)
ON CONFLICT ("id") DO UPDATE SET "status" = 'active', "starts_at" = EXCLUDED."starts_at", "ends_at" = EXCLUDED."ends_at", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "campaign_screens" ("campaign_id", "screen_id", "price_cents", "scheduled_plays_per_day")
VALUES ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 9700, 120)
ON CONFLICT ("campaign_id", "screen_id") DO UPDATE SET "price_cents" = EXCLUDED."price_cents", "scheduled_plays_per_day" = EXCLUDED."scheduled_plays_per_day";
--> statement-breakpoint
INSERT INTO "creatives" (
  "id", "campaign_id", "created_by_clerk_user_id", "type", "status", "name", "headline", "body",
  "call_to_action", "duration_seconds", "metadata"
)
VALUES
  (
    '55555555-5555-4555-8555-555555555551', '44444444-4444-4444-8444-444444444444',
    'demo-advertiser', 'generated_slide', 'approved', 'Captain 97.1 Station Promo',
    'Carolina’s Dock Rock.', 'Cruise through the workday with smooth favorites and the local voices you know.',
    'Listen at Captain97.com', 12,
    '{"theme":"aqua","eyebrow":"Captain 97.1 · New Bern","sponsor":"Captain 97.1"}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555552', '44444444-4444-4444-8444-444444444444',
    'demo-advertiser', 'generated_slide', 'approved', 'Founding Advertiser Example',
    'Your business belongs here.', 'Reach customers while they eat, shop, wait, work out, and explore Eastern Carolina.',
    'Advertise with NeuseCast', 12,
    '{"theme":"coral","eyebrow":"Founding advertiser opportunity","sponsor":"NeuseCast"}'::jsonb
  )
ON CONFLICT ("id") DO UPDATE SET "status" = 'approved', "headline" = EXCLUDED."headline", "body" = EXCLUDED."body", "metadata" = EXCLUDED."metadata", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "host_content" (
  "id", "venue_id", "submitted_by_clerk_user_id", "status", "template", "headline", "body",
  "call_to_action", "starts_at", "ends_at"
)
VALUES (
  '66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
  'demo-host', 'scheduled', 'gold', 'Today’s local special.',
  'Hosts can update menus, specials, events, and announcements from their NeuseCast portal.',
  'Ask us what’s new today', now() - interval '1 day', now() + interval '1 year'
)
ON CONFLICT ("id") DO UPDATE SET "status" = 'scheduled', "headline" = EXCLUDED."headline", "body" = EXCLUDED."body", "updated_at" = now();
--> statement-breakpoint
INSERT INTO "generated_content" (
  "id", "category", "market", "title", "body", "source_name", "approved", "starts_at", "expires_at", "metadata"
)
VALUES
  (
    '77777777-7777-4777-8777-777777777771', 'weather', 'New Bern', '84° and breezy on the Neuse.',
    'A warm Eastern Carolina afternoon with light southwest winds. Sunset is just after 7:40 PM.',
    'NeuseCast Weather', true, now() - interval '1 day', now() + interval '1 year',
    '{"theme":"blue","eyebrow":"New Bern weather","durationSeconds":12}'::jsonb
  ),
  (
    '77777777-7777-4777-8777-777777777772', 'history', 'New Bern', 'A city shaped by two rivers.',
    'New Bern was founded in 1710 where the Neuse and Trent Rivers meet—and served as North Carolina’s first permanent capital.',
    'NeuseCast Local History', true, now() - interval '1 day', now() + interval '1 year',
    '{"theme":"gold","eyebrow":"Did you know?","durationSeconds":14}'::jsonb
  ),
  (
    '77777777-7777-4777-8777-777777777773', 'trivia', 'New Bern', 'How long is the Neuse River?',
    'At roughly 275 miles, the Neuse is the longest river contained entirely within North Carolina.',
    'NeuseCast Trivia', true, now() - interval '1 day', now() + interval '1 year',
    '{"theme":"green","eyebrow":"Eastern Carolina trivia","durationSeconds":13}'::jsonb
  ),
  (
    '77777777-7777-4777-8777-777777777774', 'community', 'New Bern', 'Shop local. Stay connected.',
    'Every local purchase helps keep Eastern Carolina’s neighborhoods distinctive, resilient, and growing.',
    'NeuseCast', true, now() - interval '1 day', now() + interval '1 year',
    '{"theme":"navy","eyebrow":"Around town","durationSeconds":12}'::jsonb
  )
ON CONFLICT ("id") DO UPDATE SET "approved" = true, "title" = EXCLUDED."title", "body" = EXCLUDED."body", "metadata" = EXCLUDED."metadata", "updated_at" = now();
