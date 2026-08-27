CREATE TYPE "public"."broadcast_weather_run_status" AS ENUM('generating', 'ready', 'expired', 'failed');--> statement-breakpoint
CREATE TABLE "broadcast_weather_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"output_id" uuid NOT NULL,
	"name" varchar(180) DEFAULT 'NeuseCast Weather Center' NOT NULL,
	"sponsor_label" varchar(180) DEFAULT 'Captain 97.1 FM Weather Center' NOT NULL,
	"market" varchar(120) DEFAULT 'Eastern North Carolina' NOT NULL,
	"primary_location" varchar(120) DEFAULT 'New Bern' NOT NULL,
	"auto_refresh" boolean DEFAULT true NOT NULL,
	"graphics_only_fallback" boolean DEFAULT true NOT NULL,
	"presenter_mode" boolean DEFAULT true NOT NULL,
	"report_duration_seconds" integer DEFAULT 90 NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_clerk_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_weather_centers_duration_check" CHECK ("broadcast_weather_centers"."report_duration_seconds" between 30 and 600)
);
--> statement-breakpoint
CREATE TABLE "broadcast_weather_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"status" "broadcast_weather_run_status" DEFAULT 'generating' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"forecast_updated_at" timestamp with time zone,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"presenter_script" text NOT NULL,
	"source_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"severe_weather_reviewed" boolean DEFAULT false NOT NULL,
	"generated_asset_id" uuid,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_weather_runs_window_check" CHECK ("broadcast_weather_runs"."valid_until" > "broadcast_weather_runs"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "broadcast_weather_centers" ADD CONSTRAINT "broadcast_weather_centers_output_id_broadcast_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."broadcast_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_weather_centers" ADD CONSTRAINT "broadcast_weather_centers_created_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("created_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_weather_runs" ADD CONSTRAINT "broadcast_weather_runs_center_id_broadcast_weather_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."broadcast_weather_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_weather_runs" ADD CONSTRAINT "broadcast_weather_runs_generated_asset_id_broadcast_media_assets_id_fk" FOREIGN KEY ("generated_asset_id") REFERENCES "public"."broadcast_media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_weather_centers_output_idx" ON "broadcast_weather_centers" USING btree ("output_id");--> statement-breakpoint
CREATE INDEX "broadcast_weather_runs_current_idx" ON "broadcast_weather_runs" USING btree ("center_id","status","valid_until","issued_at");--> statement-breakpoint
