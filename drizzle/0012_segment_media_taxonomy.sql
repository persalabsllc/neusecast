ALTER TYPE "public"."broadcast_media_category" ADD VALUE IF NOT EXISTS 'segment_intro';--> statement-breakpoint
ALTER TYPE "public"."broadcast_media_category" ADD VALUE IF NOT EXISTS 'segment_tease';--> statement-breakpoint
ALTER TYPE "public"."broadcast_media_category" ADD VALUE IF NOT EXISTS 'segment_outro';--> statement-breakpoint
ALTER TYPE "public"."broadcast_media_category" ADD VALUE IF NOT EXISTS 'station_id';--> statement-breakpoint
CREATE TYPE "public"."broadcast_segment" AS ENUM('weather', 'local_news', 'community_calendar', 'sports', 'special_programming');--> statement-breakpoint
ALTER TABLE "broadcast_media_assets" ADD COLUMN "segment" "broadcast_segment";--> statement-breakpoint
ALTER TABLE "broadcast_media_assets" ADD CONSTRAINT "broadcast_media_assets_segment_check" CHECK (
  ("category"::text in ('segment_intro', 'segment_tease', 'segment_outro') and "segment" is not null)
  or
  ("category"::text not in ('segment_intro', 'segment_tease', 'segment_outro') and "segment" is null)
);--> statement-breakpoint
CREATE INDEX "broadcast_media_assets_segment_idx" ON "broadcast_media_assets" USING btree ("category", "segment", "status", "created_at");
