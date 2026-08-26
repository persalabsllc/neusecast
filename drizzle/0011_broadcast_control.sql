CREATE TYPE "public"."broadcast_agent_command_status" AS ENUM('queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."broadcast_agent_kind" AS ENUM('casparcg', 'playout', 'ingest', 'renderer');--> statement-breakpoint
CREATE TYPE "public"."broadcast_agent_status" AS ENUM('offline', 'starting', 'ready', 'degraded', 'stopping');--> statement-breakpoint
CREATE TYPE "public"."broadcast_as_run_event_type" AS ENUM('started', 'completed', 'skipped', 'failed', 'interrupted', 'resumed', 'live_taken', 'automation_resumed', 'graphics_changed');--> statement-breakpoint
CREATE TYPE "public"."broadcast_clock_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."broadcast_graphic_kind" AS ENUM('logo', 'clock', 'weather', 'ticker', 'lower_third', 'emergency', 'custom');--> statement-breakpoint
CREATE TYPE "public"."broadcast_live_protocol" AS ENUM('rtmp', 'rtmps', 'srt', 'rtsp', 'webrtc', 'ndi', 'decklink', 'test');--> statement-breakpoint
CREATE TYPE "public"."broadcast_live_source_status" AS ENUM('disabled', 'offline', 'connecting', 'ready', 'live', 'error');--> statement-breakpoint
CREATE TYPE "public"."broadcast_media_category" AS ENUM('program', 'news', 'weather', 'events', 'commercial', 'promo', 'bumper', 'psa', 'filler', 'emergency', 'live_recording', 'other');--> statement-breakpoint
CREATE TYPE "public"."broadcast_media_kind" AS ENUM('video', 'audio', 'image', 'caption', 'graphic');--> statement-breakpoint
CREATE TYPE "public"."broadcast_media_status" AS ENUM('uploading', 'processing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."broadcast_media_version_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."broadcast_output_kind" AS ENUM('preview', 'program', 'stream', 'recording');--> statement-breakpoint
CREATE TYPE "public"."broadcast_output_status" AS ENUM('disabled', 'standby', 'starting', 'live', 'degraded', 'offline', 'error');--> statement-breakpoint
CREATE TYPE "public"."broadcast_program_item_status" AS ENUM('scheduled', 'ready', 'playing', 'played', 'skipped', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."broadcast_program_log_status" AS ENUM('draft', 'published', 'on_air', 'completed', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."broadcast_program_source" AS ENUM('asset', 'category', 'dynamic', 'live', 'break');--> statement-breakpoint
CREATE TYPE "public"."broadcast_ticker_priority" AS ENUM('routine', 'important', 'urgent', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."broadcast_ticker_status" AS ENUM('draft', 'approved', 'scheduled', 'active', 'expired', 'cancelled', 'archived');--> statement-breakpoint
CREATE TABLE "broadcast_agent_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"output_id" uuid,
	"program_item_id" uuid,
	"command_type" varchar(80) NOT NULL,
	"status" "broadcast_agent_command_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"requested_by_clerk_user_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_agent_commands_attempts_check" CHECK ("broadcast_agent_commands"."attempt_count" >= 0 and "broadcast_agent_commands"."max_attempts" > 0),
	CONSTRAINT "broadcast_agent_commands_expiry_check" CHECK ("broadcast_agent_commands"."expires_at" is null or "broadcast_agent_commands"."expires_at" > "broadcast_agent_commands"."created_at")
);
--> statement-breakpoint
CREATE TABLE "broadcast_agent_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"output_id" uuid,
	"current_program_item_id" uuid,
	"status" "broadcast_agent_status" NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "broadcast_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_key" varchar(120) NOT NULL,
	"name" varchar(180) NOT NULL,
	"kind" "broadcast_agent_kind" DEFAULT 'casparcg' NOT NULL,
	"status" "broadcast_agent_status" DEFAULT 'offline' NOT NULL,
	"credential_hash" varchar(64),
	"hostname" varchar(255),
	"software_version" varchar(80),
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_as_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"output_id" uuid NOT NULL,
	"log_id" uuid,
	"program_item_id" uuid,
	"media_version_id" uuid,
	"live_source_id" uuid,
	"agent_id" uuid,
	"event_type" "broadcast_as_run_event_type" NOT NULL,
	"provider_event_id" varchar(255),
	"label" varchar(240),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"planned_start_at" timestamp with time zone,
	"duration_ms" integer,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_as_run_events_duration_check" CHECK ("broadcast_as_run_events"."duration_ms" is null or "broadcast_as_run_events"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "broadcast_clock_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"offset_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"label" varchar(180) NOT NULL,
	"source_kind" "broadcast_program_source" NOT NULL,
	"media_asset_id" uuid,
	"media_category" "broadcast_media_category",
	"dynamic_key" varchar(120),
	"live_source_id" uuid,
	"selection_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"transition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overlay_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hard_start" boolean DEFAULT false NOT NULL,
	"allow_ticker" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_clock_slots_position_check" CHECK ("broadcast_clock_slots"."position" >= 0),
	CONSTRAINT "broadcast_clock_slots_offset_check" CHECK ("broadcast_clock_slots"."offset_ms" >= 0),
	CONSTRAINT "broadcast_clock_slots_duration_check" CHECK ("broadcast_clock_slots"."duration_ms" > 0),
	CONSTRAINT "broadcast_clock_slots_source_check" CHECK (("broadcast_clock_slots"."source_kind" = 'asset' and "broadcast_clock_slots"."media_asset_id" is not null)
        or ("broadcast_clock_slots"."source_kind" = 'category' and "broadcast_clock_slots"."media_category" is not null)
        or ("broadcast_clock_slots"."source_kind" = 'dynamic' and "broadcast_clock_slots"."dynamic_key" is not null)
        or ("broadcast_clock_slots"."source_kind" = 'live' and "broadcast_clock_slots"."live_source_id" is not null)
        or "broadcast_clock_slots"."source_kind" = 'break')
);
--> statement-breakpoint
CREATE TABLE "broadcast_clock_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"name" varchar(180) NOT NULL,
	"status" "broadcast_clock_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer DEFAULT 3600000 NOT NULL,
	"time_zone" varchar(64) DEFAULT 'America/New_York' NOT NULL,
	"notes" text,
	"created_by_clerk_user_id" text,
	"activated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_clock_templates_revision_check" CHECK ("broadcast_clock_templates"."revision" > 0),
	CONSTRAINT "broadcast_clock_templates_duration_check" CHECK ("broadcast_clock_templates"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "broadcast_graphic_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"output_id" uuid,
	"name" varchar(180) NOT NULL,
	"kind" "broadcast_graphic_kind" NOT NULL,
	"layer" integer NOT NULL,
	"template_key" varchar(160) NOT NULL,
	"media_asset_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"persistent" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_by_clerk_user_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_graphic_layers_layer_check" CHECK ("broadcast_graphic_layers"."layer" >= 0),
	CONSTRAINT "broadcast_graphic_layers_revision_check" CHECK ("broadcast_graphic_layers"."revision" > 0),
	CONSTRAINT "broadcast_graphic_layers_schedule_check" CHECK ("broadcast_graphic_layers"."ends_at" is null or "broadcast_graphic_layers"."starts_at" is null or "broadcast_graphic_layers"."ends_at" > "broadcast_graphic_layers"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "broadcast_live_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"name" varchar(240) NOT NULL,
	"protocol" "broadcast_live_protocol" NOT NULL,
	"status" "broadcast_live_source_status" DEFAULT 'offline' NOT NULL,
	"endpoint_url" text,
	"credential_secret_ref" varchar(255),
	"assigned_agent_id" uuid,
	"failover_asset_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_record" boolean DEFAULT false NOT NULL,
	"reconnect_timeout_seconds" integer DEFAULT 10 NOT NULL,
	"last_signal_at" timestamp with time zone,
	"last_taken_live_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_live_sources_timeout_check" CHECK ("broadcast_live_sources"."reconnect_timeout_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "broadcast_media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(180) NOT NULL,
	"name" varchar(240) NOT NULL,
	"description" text,
	"kind" "broadcast_media_kind" NOT NULL,
	"category" "broadcast_media_category" DEFAULT 'other' NOT NULL,
	"status" "broadcast_media_status" DEFAULT 'uploading' NOT NULL,
	"duration_ms" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rights_owner" varchar(240),
	"rights_notes" text,
	"rights_expires_at" timestamp with time zone,
	"available_from" timestamp with time zone,
	"available_until" timestamp with time zone,
	"created_by_clerk_user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_media_assets_duration_check" CHECK ("broadcast_media_assets"."duration_ms" is null or "broadcast_media_assets"."duration_ms" > 0),
	CONSTRAINT "broadcast_media_assets_availability_check" CHECK ("broadcast_media_assets"."available_until" is null or "broadcast_media_assets"."available_from" is null or "broadcast_media_assets"."available_until" > "broadcast_media_assets"."available_from")
);
--> statement-breakpoint
CREATE TABLE "broadcast_media_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" "broadcast_media_version_status" DEFAULT 'pending' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"original_file_name" varchar(255),
	"mime_type" varchar(160),
	"file_size_bytes" bigint,
	"checksum_sha256" varchar(64),
	"storage_provider" varchar(60),
	"storage_key" text,
	"source_url" text,
	"playback_url" text,
	"thumbnail_url" text,
	"caption_url" text,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"frame_rate_numerator" integer,
	"frame_rate_denominator" integer,
	"audio_channels" integer,
	"audio_sample_rate" integer,
	"technical_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_media_versions_revision_check" CHECK ("broadcast_media_versions"."revision" > 0),
	CONSTRAINT "broadcast_media_versions_file_size_check" CHECK ("broadcast_media_versions"."file_size_bytes" is null or "broadcast_media_versions"."file_size_bytes" >= 0),
	CONSTRAINT "broadcast_media_versions_duration_check" CHECK ("broadcast_media_versions"."duration_ms" is null or "broadcast_media_versions"."duration_ms" > 0),
	CONSTRAINT "broadcast_media_versions_dimensions_check" CHECK (("broadcast_media_versions"."width" is null or "broadcast_media_versions"."width" > 0) and ("broadcast_media_versions"."height" is null or "broadcast_media_versions"."height" > 0)),
	CONSTRAINT "broadcast_media_versions_frame_rate_check" CHECK (("broadcast_media_versions"."frame_rate_numerator" is null or "broadcast_media_versions"."frame_rate_numerator" > 0) and ("broadcast_media_versions"."frame_rate_denominator" is null or "broadcast_media_versions"."frame_rate_denominator" > 0))
);
--> statement-breakpoint
CREATE TABLE "broadcast_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(180) NOT NULL,
	"kind" "broadcast_output_kind" DEFAULT 'program' NOT NULL,
	"status" "broadcast_output_status" DEFAULT 'disabled' NOT NULL,
	"assigned_agent_id" uuid,
	"caspar_channel" integer DEFAULT 1 NOT NULL,
	"delivery_provider" varchar(80) DEFAULT 'casparcg' NOT NULL,
	"delivery_protocol" varchar(24),
	"destination_url" text,
	"credential_secret_ref" varchar(255),
	"provider_input_id" varchar(255),
	"width" integer DEFAULT 1920 NOT NULL,
	"height" integer DEFAULT 1080 NOT NULL,
	"frame_rate_numerator" integer DEFAULT 30 NOT NULL,
	"frame_rate_denominator" integer DEFAULT 1 NOT NULL,
	"audio_sample_rate" integer DEFAULT 48000 NOT NULL,
	"time_zone" varchar(64) DEFAULT 'America/New_York' NOT NULL,
	"always_on" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"control_revision" integer DEFAULT 1 NOT NULL,
	"consumer_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overlay_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"last_error" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_outputs_channel_check" CHECK ("broadcast_outputs"."caspar_channel" > 0),
	CONSTRAINT "broadcast_outputs_dimensions_check" CHECK ("broadcast_outputs"."width" > 0 and "broadcast_outputs"."height" > 0),
	CONSTRAINT "broadcast_outputs_frame_rate_check" CHECK ("broadcast_outputs"."frame_rate_numerator" > 0 and "broadcast_outputs"."frame_rate_denominator" > 0),
	CONSTRAINT "broadcast_outputs_audio_rate_check" CHECK ("broadcast_outputs"."audio_sample_rate" > 0),
	CONSTRAINT "broadcast_outputs_control_revision_check" CHECK ("broadcast_outputs"."control_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "broadcast_program_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"clock_slot_id" uuid,
	"position" integer NOT NULL,
	"label" varchar(240) NOT NULL,
	"source_kind" "broadcast_program_source" NOT NULL,
	"media_category" "broadcast_media_category",
	"media_version_id" uuid,
	"dynamic_key" varchar(120),
	"live_source_id" uuid,
	"status" "broadcast_program_item_status" DEFAULT 'scheduled' NOT NULL,
	"planned_start_at" timestamp with time zone NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"hard_start" boolean DEFAULT false NOT NULL,
	"allow_ticker" boolean DEFAULT true NOT NULL,
	"transition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overlay_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_program_items_position_check" CHECK ("broadcast_program_items"."position" >= 0),
	CONSTRAINT "broadcast_program_items_duration_check" CHECK ("broadcast_program_items"."duration_ms" > 0),
	CONSTRAINT "broadcast_program_items_window_check" CHECK ("broadcast_program_items"."planned_end_at" > "broadcast_program_items"."planned_start_at"),
	CONSTRAINT "broadcast_program_items_source_check" CHECK (("broadcast_program_items"."source_kind" = 'asset' and "broadcast_program_items"."media_version_id" is not null)
        or ("broadcast_program_items"."source_kind" = 'category' and "broadcast_program_items"."media_category" is not null)
        or ("broadcast_program_items"."source_kind" = 'dynamic' and "broadcast_program_items"."dynamic_key" is not null)
        or ("broadcast_program_items"."source_kind" = 'live' and "broadcast_program_items"."live_source_id" is not null)
        or "broadcast_program_items"."source_kind" = 'break')
);
--> statement-breakpoint
CREATE TABLE "broadcast_program_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"output_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"name" varchar(180) NOT NULL,
	"status" "broadcast_program_log_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"time_zone" varchar(64) DEFAULT 'America/New_York' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"clock_template_id" uuid,
	"generated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"locked_through" timestamp with time zone,
	"approved_by_clerk_user_id" text,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_program_logs_revision_check" CHECK ("broadcast_program_logs"."revision" > 0),
	CONSTRAINT "broadcast_program_logs_window_check" CHECK ("broadcast_program_logs"."ends_at" > "broadcast_program_logs"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "broadcast_ticker_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"output_id" uuid,
	"message" text NOT NULL,
	"priority" "broadcast_ticker_priority" DEFAULT 'routine' NOT NULL,
	"status" "broadcast_ticker_status" DEFAULT 'draft' NOT NULL,
	"source_name" varchar(180),
	"source_url" text,
	"automation_key" varchar(255),
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"minimum_interval_seconds" integer DEFAULT 0 NOT NULL,
	"maximum_plays" integer,
	"play_count" integer DEFAULT 0 NOT NULL,
	"approved_by_clerk_user_id" text,
	"approved_at" timestamp with time zone,
	"created_by_clerk_user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_ticker_items_message_check" CHECK (char_length("broadcast_ticker_items"."message") > 0),
	CONSTRAINT "broadcast_ticker_items_schedule_check" CHECK ("broadcast_ticker_items"."expires_at" is null or "broadcast_ticker_items"."starts_at" is null or "broadcast_ticker_items"."expires_at" > "broadcast_ticker_items"."starts_at"),
	CONSTRAINT "broadcast_ticker_items_interval_check" CHECK ("broadcast_ticker_items"."minimum_interval_seconds" >= 0),
	CONSTRAINT "broadcast_ticker_items_play_count_check" CHECK ("broadcast_ticker_items"."play_count" >= 0 and ("broadcast_ticker_items"."maximum_plays" is null or "broadcast_ticker_items"."maximum_plays" > 0))
);
--> statement-breakpoint
ALTER TABLE "broadcast_agent_commands" ADD CONSTRAINT "broadcast_agent_commands_agent_id_broadcast_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."broadcast_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_agent_commands" ADD CONSTRAINT "broadcast_agent_commands_output_id_broadcast_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."broadcast_outputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_agent_commands" ADD CONSTRAINT "broadcast_agent_commands_program_item_id_broadcast_program_items_id_fk" FOREIGN KEY ("program_item_id") REFERENCES "public"."broadcast_program_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_agent_commands" ADD CONSTRAINT "broadcast_agent_commands_requested_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("requested_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_agent_heartbeats" ADD CONSTRAINT "broadcast_agent_heartbeats_agent_id_broadcast_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."broadcast_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_agent_heartbeats" ADD CONSTRAINT "broadcast_agent_heartbeats_output_id_broadcast_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."broadcast_outputs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_agent_heartbeats" ADD CONSTRAINT "broadcast_agent_heartbeats_current_program_item_id_broadcast_program_items_id_fk" FOREIGN KEY ("current_program_item_id") REFERENCES "public"."broadcast_program_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_as_run_events" ADD CONSTRAINT "broadcast_as_run_events_output_id_broadcast_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."broadcast_outputs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_as_run_events" ADD CONSTRAINT "broadcast_as_run_events_log_id_broadcast_program_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."broadcast_program_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_as_run_events" ADD CONSTRAINT "broadcast_as_run_events_program_item_id_broadcast_program_items_id_fk" FOREIGN KEY ("program_item_id") REFERENCES "public"."broadcast_program_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_as_run_events" ADD CONSTRAINT "broadcast_as_run_events_media_version_id_broadcast_media_versions_id_fk" FOREIGN KEY ("media_version_id") REFERENCES "public"."broadcast_media_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_as_run_events" ADD CONSTRAINT "broadcast_as_run_events_live_source_id_broadcast_live_sources_id_fk" FOREIGN KEY ("live_source_id") REFERENCES "public"."broadcast_live_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_as_run_events" ADD CONSTRAINT "broadcast_as_run_events_agent_id_broadcast_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."broadcast_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_clock_slots" ADD CONSTRAINT "broadcast_clock_slots_template_id_broadcast_clock_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."broadcast_clock_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_clock_slots" ADD CONSTRAINT "broadcast_clock_slots_media_asset_id_broadcast_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."broadcast_media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_clock_slots" ADD CONSTRAINT "broadcast_clock_slots_live_source_id_broadcast_live_sources_id_fk" FOREIGN KEY ("live_source_id") REFERENCES "public"."broadcast_live_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_clock_templates" ADD CONSTRAINT "broadcast_clock_templates_created_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("created_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_graphic_layers" ADD CONSTRAINT "broadcast_graphic_layers_output_id_broadcast_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."broadcast_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_graphic_layers" ADD CONSTRAINT "broadcast_graphic_layers_media_asset_id_broadcast_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."broadcast_media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_graphic_layers" ADD CONSTRAINT "broadcast_graphic_layers_created_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("created_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_live_sources" ADD CONSTRAINT "broadcast_live_sources_assigned_agent_id_broadcast_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."broadcast_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_live_sources" ADD CONSTRAINT "broadcast_live_sources_failover_asset_id_broadcast_media_assets_id_fk" FOREIGN KEY ("failover_asset_id") REFERENCES "public"."broadcast_media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_media_assets" ADD CONSTRAINT "broadcast_media_assets_created_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("created_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_media_versions" ADD CONSTRAINT "broadcast_media_versions_asset_id_broadcast_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."broadcast_media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_outputs" ADD CONSTRAINT "broadcast_outputs_assigned_agent_id_broadcast_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."broadcast_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_program_items" ADD CONSTRAINT "broadcast_program_items_log_id_broadcast_program_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."broadcast_program_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_program_items" ADD CONSTRAINT "broadcast_program_items_clock_slot_id_broadcast_clock_slots_id_fk" FOREIGN KEY ("clock_slot_id") REFERENCES "public"."broadcast_clock_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_program_items" ADD CONSTRAINT "broadcast_program_items_media_version_id_broadcast_media_versions_id_fk" FOREIGN KEY ("media_version_id") REFERENCES "public"."broadcast_media_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_program_items" ADD CONSTRAINT "broadcast_program_items_live_source_id_broadcast_live_sources_id_fk" FOREIGN KEY ("live_source_id") REFERENCES "public"."broadcast_live_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_program_logs" ADD CONSTRAINT "broadcast_program_logs_output_id_broadcast_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."broadcast_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_program_logs" ADD CONSTRAINT "broadcast_program_logs_clock_template_id_broadcast_clock_templates_id_fk" FOREIGN KEY ("clock_template_id") REFERENCES "public"."broadcast_clock_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_program_logs" ADD CONSTRAINT "broadcast_program_logs_approved_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("approved_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_ticker_items" ADD CONSTRAINT "broadcast_ticker_items_output_id_broadcast_outputs_id_fk" FOREIGN KEY ("output_id") REFERENCES "public"."broadcast_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_ticker_items" ADD CONSTRAINT "broadcast_ticker_items_approved_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("approved_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_ticker_items" ADD CONSTRAINT "broadcast_ticker_items_created_by_clerk_user_id_app_users_clerk_user_id_fk" FOREIGN KEY ("created_by_clerk_user_id") REFERENCES "public"."app_users"("clerk_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_agent_commands_idempotency_idx" ON "broadcast_agent_commands" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "broadcast_agent_commands_claim_idx" ON "broadcast_agent_commands" USING btree ("agent_id","status","not_before","expires_at");--> statement-breakpoint
CREATE INDEX "broadcast_agent_commands_output_idx" ON "broadcast_agent_commands" USING btree ("output_id","created_at");--> statement-breakpoint
CREATE INDEX "broadcast_agent_heartbeats_agent_time_idx" ON "broadcast_agent_heartbeats" USING btree ("agent_id","received_at");--> statement-breakpoint
CREATE INDEX "broadcast_agent_heartbeats_output_time_idx" ON "broadcast_agent_heartbeats" USING btree ("output_id","received_at");--> statement-breakpoint
CREATE INDEX "broadcast_agent_heartbeats_received_idx" ON "broadcast_agent_heartbeats" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_agents_key_idx" ON "broadcast_agents" USING btree ("agent_key");--> statement-breakpoint
CREATE INDEX "broadcast_agents_health_idx" ON "broadcast_agents" USING btree ("enabled","status","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_as_run_events_provider_idx" ON "broadcast_as_run_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "broadcast_as_run_events_output_time_idx" ON "broadcast_as_run_events" USING btree ("output_id","occurred_at");--> statement-breakpoint
CREATE INDEX "broadcast_as_run_events_item_time_idx" ON "broadcast_as_run_events" USING btree ("program_item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "broadcast_as_run_events_media_time_idx" ON "broadcast_as_run_events" USING btree ("media_version_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_clock_slots_position_idx" ON "broadcast_clock_slots" USING btree ("template_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_clock_slots_offset_idx" ON "broadcast_clock_slots" USING btree ("template_id","offset_ms");--> statement-breakpoint
CREATE INDEX "broadcast_clock_slots_source_idx" ON "broadcast_clock_slots" USING btree ("source_kind","media_category","dynamic_key");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_clock_templates_revision_idx" ON "broadcast_clock_templates" USING btree ("slug","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_clock_templates_active_idx" ON "broadcast_clock_templates" USING btree ("slug") WHERE "broadcast_clock_templates"."status" = 'active' and "broadcast_clock_templates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "broadcast_clock_templates_status_idx" ON "broadcast_clock_templates" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "broadcast_graphic_layers_output_idx" ON "broadcast_graphic_layers" USING btree ("output_id","enabled","layer");--> statement-breakpoint
CREATE INDEX "broadcast_graphic_layers_schedule_idx" ON "broadcast_graphic_layers" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_live_sources_slug_idx" ON "broadcast_live_sources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "broadcast_live_sources_health_idx" ON "broadcast_live_sources" USING btree ("enabled","status","last_signal_at");--> statement-breakpoint
CREATE INDEX "broadcast_live_sources_agent_idx" ON "broadcast_live_sources" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_media_assets_slug_idx" ON "broadcast_media_assets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "broadcast_media_assets_library_idx" ON "broadcast_media_assets" USING btree ("status","category","kind","created_at");--> statement-breakpoint
CREATE INDEX "broadcast_media_assets_availability_idx" ON "broadcast_media_assets" USING btree ("available_from","available_until");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_media_versions_revision_idx" ON "broadcast_media_versions" USING btree ("asset_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_media_versions_current_idx" ON "broadcast_media_versions" USING btree ("asset_id") WHERE "broadcast_media_versions"."is_current" = true and "broadcast_media_versions"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "broadcast_media_versions_processing_idx" ON "broadcast_media_versions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_outputs_slug_idx" ON "broadcast_outputs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "broadcast_outputs_health_idx" ON "broadcast_outputs" USING btree ("enabled","status","last_heartbeat_at");--> statement-breakpoint
CREATE INDEX "broadcast_outputs_agent_idx" ON "broadcast_outputs" USING btree ("assigned_agent_id","caspar_channel");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_program_items_position_idx" ON "broadcast_program_items" USING btree ("log_id","position");--> statement-breakpoint
CREATE INDEX "broadcast_program_items_start_idx" ON "broadcast_program_items" USING btree ("log_id","planned_start_at");--> statement-breakpoint
CREATE INDEX "broadcast_program_items_up_next_idx" ON "broadcast_program_items" USING btree ("log_id","status","planned_start_at");--> statement-breakpoint
CREATE INDEX "broadcast_program_items_media_idx" ON "broadcast_program_items" USING btree ("media_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_program_logs_revision_idx" ON "broadcast_program_logs" USING btree ("output_id","service_date","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_program_logs_current_idx" ON "broadcast_program_logs" USING btree ("output_id","service_date") WHERE "broadcast_program_logs"."status" in ('published', 'on_air') and "broadcast_program_logs"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "broadcast_program_logs_air_idx" ON "broadcast_program_logs" USING btree ("output_id","status","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_ticker_items_automation_idx" ON "broadcast_ticker_items" USING btree ("automation_key");--> statement-breakpoint
CREATE INDEX "broadcast_ticker_items_air_idx" ON "broadcast_ticker_items" USING btree ("output_id","status","priority","starts_at","expires_at");--> statement-breakpoint
INSERT INTO "broadcast_agents" ("agent_key", "name", "kind", "status", "capabilities", "enabled")
VALUES ('neusecast-playout-01', 'NeuseCast Playout 01', 'casparcg', 'offline', '["casparcg", "playout", "graphics", "stream"]'::jsonb, true)
ON CONFLICT ("agent_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "broadcast_outputs" ("slug", "name", "kind", "status", "assigned_agent_id", "caspar_channel", "delivery_provider", "width", "height", "frame_rate_numerator", "frame_rate_denominator", "audio_sample_rate", "time_zone", "always_on", "enabled")
VALUES ('main', 'NeuseCast Main', 'program', 'disabled', (SELECT "id" FROM "broadcast_agents" WHERE "agent_key" = 'neusecast-playout-01'), 1, 'casparcg', 1920, 1080, 30, 1, 48000, 'America/New_York', false, false)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "broadcast_graphic_layers" ("output_id", "name", "kind", "layer", "template_key", "enabled", "persistent", "data")
SELECT "id", 'NeuseCast bug', 'logo', 80, 'neusecast/logo', true, true, '{"position":"top-right"}'::jsonb
FROM "broadcast_outputs" WHERE "slug" = 'main'
  AND NOT EXISTS (SELECT 1 FROM "broadcast_graphic_layers" WHERE "output_id" = "broadcast_outputs"."id" AND "kind" = 'logo');--> statement-breakpoint
INSERT INTO "broadcast_graphic_layers" ("output_id", "name", "kind", "layer", "template_key", "enabled", "persistent", "data")
SELECT "id", 'Eastern time', 'clock', 81, 'neusecast/clock', true, true, '{"timeZone":"America/New_York"}'::jsonb
FROM "broadcast_outputs" WHERE "slug" = 'main'
  AND NOT EXISTS (SELECT 1 FROM "broadcast_graphic_layers" WHERE "output_id" = "broadcast_outputs"."id" AND "kind" = 'clock');--> statement-breakpoint
INSERT INTO "broadcast_graphic_layers" ("output_id", "name", "kind", "layer", "template_key", "enabled", "persistent", "data")
SELECT "id", 'Regional weather', 'weather', 82, 'neusecast/weather', true, true, '{"source":"nws","market":"Eastern North Carolina"}'::jsonb
FROM "broadcast_outputs" WHERE "slug" = 'main'
  AND NOT EXISTS (SELECT 1 FROM "broadcast_graphic_layers" WHERE "output_id" = "broadcast_outputs"."id" AND "kind" = 'weather');--> statement-breakpoint
INSERT INTO "broadcast_graphic_layers" ("output_id", "name", "kind", "layer", "template_key", "enabled", "persistent", "data")
SELECT "id", 'News and alerts ticker', 'ticker', 90, 'neusecast/ticker', true, true, '{"speed":"normal"}'::jsonb
FROM "broadcast_outputs" WHERE "slug" = 'main'
  AND NOT EXISTS (SELECT 1 FROM "broadcast_graphic_layers" WHERE "output_id" = "broadcast_outputs"."id" AND "kind" = 'ticker');
