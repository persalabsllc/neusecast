import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  BroadcastAgentAuthError,
  authenticateBroadcastAgent,
  broadcastAgentErrorResponse,
  resolveBroadcastAgentContext,
} from "@/lib/broadcast/agent-auth";
import {
  BROADCAST_AGENT_CONTRACT_VERSION,
  BroadcastAgentContractError,
  type BroadcastAgentEvent,
  broadcastAgentContractErrorResponse,
  readAgentEventsEnvelope,
} from "@/lib/broadcast/agent-contract";
import {
  broadcastAgentCommands,
  broadcastAgentHeartbeats,
  broadcastAgents,
  broadcastLiveSources,
  broadcastMediaAssets,
  broadcastMediaVersions,
  broadcastOutputs,
  broadcastProgramItems,
  broadcastProgramLogs,
} from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Database = ReturnType<typeof import("@/lib/db").getDatabase>;
type AgentContext = Awaited<ReturnType<typeof resolveBroadcastAgentContext>>;

function collectEventIds(events: BroadcastAgentEvent[]) {
  const programItemIds = new Set<string>();
  const logIds = new Set<string>();
  const mediaVersionIds = new Set<string>();
  const liveSourceIds = new Set<string>();
  const commandIds = new Set<string>();

  for (const event of events) {
    if (event.type === "heartbeat" && event.currentProgramItemId) {
      programItemIds.add(event.currentProgramItemId);
    }
    if (event.type === "now_playing") {
      if (event.logId) logIds.add(event.logId);
      if (event.programItemId) programItemIds.add(event.programItemId);
      if (event.mediaVersionId) mediaVersionIds.add(event.mediaVersionId);
      if (event.liveSourceId) liveSourceIds.add(event.liveSourceId);
    }
    if (event.type === "as_run") {
      if (event.logId) logIds.add(event.logId);
      if (event.programItemId) programItemIds.add(event.programItemId);
      if (event.mediaVersionId) mediaVersionIds.add(event.mediaVersionId);
      if (event.liveSourceId) liveSourceIds.add(event.liveSourceId);
    }
    if (event.type === "error" && event.programItemId) {
      programItemIds.add(event.programItemId);
    }
    if (event.type === "live_source_status") liveSourceIds.add(event.liveSourceId);
    if (event.type === "command_ack") commandIds.add(event.commandId);
    if (event.type === "media_ready" || event.type === "media_failed") {
      mediaVersionIds.add(event.mediaVersionId);
    }
  }

  return { programItemIds, logIds, mediaVersionIds, liveSourceIds, commandIds };
}

async function assertEventScope(
  database: Database,
  agentId: string,
  outputId: string,
  events: BroadcastAgentEvent[],
) {
  const ids = collectEventIds(events);
  const [programItems, logs, mediaVersions, liveSources, commands] = await Promise.all([
    ids.programItemIds.size
      ? database
          .select({
            id: broadcastProgramItems.id,
            mediaVersionId: broadcastProgramItems.mediaVersionId,
          })
          .from(broadcastProgramItems)
          .innerJoin(broadcastProgramLogs, eq(broadcastProgramItems.logId, broadcastProgramLogs.id))
          .where(and(
            inArray(broadcastProgramItems.id, [...ids.programItemIds]),
            eq(broadcastProgramLogs.outputId, outputId),
          ))
      : Promise.resolve([]),
    ids.logIds.size
      ? database
          .select({ id: broadcastProgramLogs.id })
          .from(broadcastProgramLogs)
          .where(and(
            inArray(broadcastProgramLogs.id, [...ids.logIds]),
            eq(broadcastProgramLogs.outputId, outputId),
          ))
      : Promise.resolve([]),
    ids.mediaVersionIds.size
      ? database
          .select({
            id: broadcastMediaVersions.id,
            assetId: broadcastMediaVersions.assetId,
            versionArchivedAt: broadcastMediaVersions.archivedAt,
            assetArchivedAt: broadcastMediaAssets.archivedAt,
          })
          .from(broadcastMediaVersions)
          .innerJoin(broadcastMediaAssets, eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id))
          // Published logs intentionally retain pinned versions after an
          // operator archives their library entries. Accept their telemetry;
          // ingest mutations below safely no-op when the version is archived.
          .where(inArray(broadcastMediaVersions.id, [...ids.mediaVersionIds]))
      : Promise.resolve([]),
    ids.liveSourceIds.size
      ? database
          .select({ id: broadcastLiveSources.id })
          .from(broadcastLiveSources)
          .where(and(
            inArray(broadcastLiveSources.id, [...ids.liveSourceIds]),
            eq(broadcastLiveSources.assignedAgentId, agentId),
            isNull(broadcastLiveSources.archivedAt),
          ))
      : Promise.resolve([]),
    ids.commandIds.size
      ? database
          .select({ id: broadcastAgentCommands.id, idempotencyKey: broadcastAgentCommands.idempotencyKey })
          .from(broadcastAgentCommands)
          .where(and(
            inArray(broadcastAgentCommands.id, [...ids.commandIds]),
            eq(broadcastAgentCommands.agentId, agentId),
            eq(broadcastAgentCommands.outputId, outputId),
          ))
      : Promise.resolve([]),
  ]);

  const allFound = (
    programItems.length === ids.programItemIds.size
    && logs.length === ids.logIds.size
    && mediaVersions.length === ids.mediaVersionIds.size
    && liveSources.length === ids.liveSourceIds.size
    && commands.length === ids.commandIds.size
  );
  if (!allFound) {
    throw new BroadcastAgentAuthError("An event references a resource outside this agent output.", 403);
  }

  const commandKeysById = new Map(commands.map((command) => [command.id, command.idempotencyKey]));
  for (const event of events) {
    if (
      event.type === "command_ack"
      && event.idempotencyKey
      && commandKeysById.get(event.commandId) !== event.idempotencyKey
    ) {
      throw new BroadcastAgentAuthError("A command acknowledgement has the wrong idempotency key.", 403);
    }
  }

  const mediaAssetsByVersion = new Map(mediaVersions.map((version) => [version.id, version.assetId]));
  const itemMediaVersions = new Map(programItems.map((item) => [item.id, item.mediaVersionId]));
  for (const event of events) {
    if (
      (event.type === "now_playing" || event.type === "as_run")
      && event.mediaVersionId
      && (!event.programItemId || itemMediaVersions.get(event.programItemId) !== event.mediaVersionId)
    ) {
      throw new BroadcastAgentAuthError("Playback media is not pinned to the reported output item.", 403);
    }
    if (
      event.type === "media_ready"
      && event.assetId
      && mediaAssetsByVersion.get(event.mediaVersionId) !== event.assetId
    ) {
      throw new BroadcastAgentAuthError("A media event does not match its asset.", 403);
    }
  }
}

async function recordHeartbeat(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "heartbeat" }>, receivedAt: Date) {
  const leaseExpiresAt = new Date(receivedAt.getTime() + event.leaseSeconds * 1_000);
  await context.database.batch([
    context.database.insert(broadcastAgentHeartbeats).values({
      agentId: context.agent.id,
      outputId: context.output.id,
      currentProgramItemId: event.currentProgramItemId,
      status: event.status,
      receivedAt,
      metrics: event.metrics,
      diagnostics: event.diagnostics,
      errorMessage: event.errorMessage,
    }),
    context.database
      .update(broadcastAgents)
      .set({
        status: event.status,
        hostname: event.hostname ?? context.agent.hostname,
        softwareVersion: event.softwareVersion ?? context.agent.softwareVersion,
        lastHeartbeatAt: receivedAt,
        leaseExpiresAt,
        lastError: event.errorMessage,
        updatedAt: receivedAt,
      })
      .where(eq(broadcastAgents.id, context.agent.id)),
    context.database
      .update(broadcastOutputs)
      .set({
        ...(event.outputStatus ? { status: event.outputStatus } : {}),
        lastHeartbeatAt: receivedAt,
        lastError: event.errorMessage,
        updatedAt: receivedAt,
      })
      .where(and(
        eq(broadcastOutputs.id, context.output.id),
        eq(broadcastOutputs.assignedAgentId, context.agent.id),
      )),
  ]);
}

async function recordNowPlaying(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "now_playing" }>, receivedAt: Date) {
  const mode = typeof event.metadata.mode === "string" ? event.metadata.mode : "automation";
  if (mode === "standby") {
    await context.database
      .update(broadcastOutputs)
      .set({
        status: "standby",
        lastHeartbeatAt: receivedAt,
        lastError: null,
        updatedAt: receivedAt,
      })
      .where(and(
        eq(broadcastOutputs.id, context.output.id),
        eq(broadcastOutputs.assignedAgentId, context.agent.id),
      ));

    // A standby transition has no aired media and therefore must not create
    // a misleading `started` as-run record.
    return true;
  }
  const outputStatus = mode === "fallback" ? "degraded" : "live";
  const asRunType = event.liveSourceId ? "live_taken" : "started";
  const result = await context.database.execute(sql<{ inserted: boolean }>`
    with inserted_event as (
      insert into "broadcast_as_run_events" (
        "output_id", "log_id", "program_item_id", "media_version_id", "live_source_id",
        "agent_id", "event_type", "provider_event_id", "label", "occurred_at",
        "planned_start_at", "duration_ms", "metadata"
      ) values (
        ${context.output.id}, ${event.logId}, ${event.programItemId}, ${event.mediaVersionId}, ${event.liveSourceId},
        ${context.agent.id}, ${asRunType}::broadcast_as_run_event_type, ${event.eventId}, ${event.label}, ${event.occurredAt},
        ${event.plannedStartAt}, ${event.durationMs}, ${JSON.stringify(event.metadata)}::jsonb
      )
      on conflict ("provider_event_id") do nothing
      returning "id"
    ), updated_item as (
      update "broadcast_program_items"
      set "status" = 'playing', "updated_at" = ${receivedAt}
      where "id" = ${event.programItemId}
      returning "id"
    ), updated_output as (
      update "broadcast_outputs"
      set
        "status" = ${outputStatus}::broadcast_output_status,
        "last_heartbeat_at" = ${receivedAt},
        "last_error" = null,
        "updated_at" = ${receivedAt}
      where "id" = ${context.output.id}
        and "assigned_agent_id" = ${context.agent.id}
      returning "id"
    )
    select exists(select 1 from inserted_event) as "inserted"
  `);
  return Boolean((result.rows[0] as { inserted?: boolean } | undefined)?.inserted);
}

function programItemStatus(eventType: Extract<BroadcastAgentEvent, { type: "as_run" }>["eventType"]) {
  if (eventType === "completed") return "played";
  if (eventType === "skipped") return "skipped";
  if (eventType === "failed") return "failed";
  if (eventType === "started" || eventType === "resumed" || eventType === "live_taken") return "playing";
  return null;
}

async function recordAsRun(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "as_run" }>, receivedAt: Date) {
  const nextItemStatus = programItemStatus(event.eventType);
  const result = await context.database.execute(sql<{ inserted: boolean }>`
    with inserted_event as (
      insert into "broadcast_as_run_events" (
        "output_id", "log_id", "program_item_id", "media_version_id", "live_source_id",
        "agent_id", "event_type", "provider_event_id", "label", "occurred_at",
        "planned_start_at", "duration_ms", "error_message", "metadata"
      ) values (
        ${context.output.id}, ${event.logId}, ${event.programItemId}, ${event.mediaVersionId}, ${event.liveSourceId},
        ${context.agent.id}, ${event.eventType}::broadcast_as_run_event_type, ${event.eventId}, ${event.label}, ${event.occurredAt},
        ${event.plannedStartAt}, ${event.durationMs}, ${event.errorMessage}, ${JSON.stringify(event.metadata)}::jsonb
      )
      on conflict ("provider_event_id") do nothing
      returning "id"
    ), updated_item as (
      update "broadcast_program_items"
      set
        "status" = coalesce(${nextItemStatus}::broadcast_program_item_status, "status"),
        "updated_at" = ${receivedAt}
      where "id" = ${event.programItemId}
      returning "id"
    )
    select exists(select 1 from inserted_event) as "inserted"
  `);
  return Boolean((result.rows[0] as { inserted?: boolean } | undefined)?.inserted);
}

async function acknowledgeCommand(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "command_ack" }>) {
  await context.database
    .update(broadcastAgentCommands)
    .set({
      status: event.status,
      result: event.result,
      errorMessage: event.errorMessage,
      ...(event.status === "running" ? { startedAt: event.occurredAt } : {}),
      ...(event.status !== "running" ? { completedAt: event.occurredAt } : {}),
      updatedAt: event.occurredAt,
    })
    .where(and(
      eq(broadcastAgentCommands.id, event.commandId),
      eq(broadcastAgentCommands.agentId, context.agent.id),
      eq(broadcastAgentCommands.outputId, context.output.id),
    ));
}

async function recordAgentError(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "error" }>, receivedAt: Date) {
  await context.database.batch([
    context.database
      .update(broadcastAgents)
      .set({ status: "degraded", lastError: event.message, updatedAt: receivedAt })
      .where(eq(broadcastAgents.id, context.agent.id)),
    context.database
      .update(broadcastOutputs)
      .set({ status: "degraded", lastError: event.message, updatedAt: receivedAt })
      .where(and(
        eq(broadcastOutputs.id, context.output.id),
        eq(broadcastOutputs.assignedAgentId, context.agent.id),
      )),
    context.database.execute(sql`
      insert into "broadcast_as_run_events" (
        "output_id", "program_item_id", "agent_id", "event_type", "provider_event_id",
        "occurred_at", "error_message", "metadata"
      )
      select
        ${context.output.id}, ${event.programItemId}, ${context.agent.id}, 'failed', ${event.eventId},
        ${event.occurredAt}, ${event.message}, ${JSON.stringify(event.metadata)}::jsonb
      where ${event.programItemId}::uuid is not null
      on conflict ("provider_event_id") do nothing
    `),
  ]);
}

async function updateLiveSource(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "live_source_status" }>, receivedAt: Date) {
  await context.database.execute(sql`
    update "broadcast_live_sources"
    set
      "status" = ${event.status}::broadcast_live_source_status,
      "last_signal_at" = case when ${event.status} in ('ready', 'live') then ${event.occurredAt} else "last_signal_at" end,
      "last_taken_live_at" = case when ${event.status} = 'live' then ${event.occurredAt} else "last_taken_live_at" end,
      "last_error" = ${event.errorMessage},
      "metadata" = "metadata" || ${JSON.stringify(event.metadata)}::jsonb,
      "updated_at" = ${receivedAt}
    where "id" = ${event.liveSourceId}
      and "assigned_agent_id" = ${context.agent.id}
  `);
}

async function markMediaReady(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "media_ready" }>, receivedAt: Date) {
  const result = await context.database.execute(sql<{ updated: boolean }>`
    with target as (
      select versions."id", versions."asset_id"
      from "broadcast_media_versions" versions
      inner join "broadcast_media_assets" assets on assets."id" = versions."asset_id"
      where versions."id" = ${event.mediaVersionId}
        and versions."status" in ('pending', 'processing')
        and versions."is_current" = true
        and versions."archived_at" is null
        and assets."archived_at" is null
      for update
    ), demoted_versions as (
      update "broadcast_media_versions" versions
      set "is_current" = false
      from target
      where versions."asset_id" = target."asset_id"
        and versions."id" <> target."id"
        and versions."is_current" = true
      returning versions."id"
    ), demotion_barrier as (
      select count(*) as "count" from demoted_versions
    ), updated_version as (
      update "broadcast_media_versions" versions
      set
        "status" = 'ready',
        "is_current" = true,
        "duration_ms" = coalesce(${event.durationMs}, versions."duration_ms"),
        "width" = coalesce(${event.width}, versions."width"),
        "height" = coalesce(${event.height}, versions."height"),
        "mime_type" = coalesce(${event.mimeType}, versions."mime_type"),
        "checksum_sha256" = coalesce(${event.checksumSha256}, versions."checksum_sha256"),
        "playback_url" = coalesce(${event.playbackUrl}, versions."playback_url", versions."source_url"),
        "technical_metadata" = versions."technical_metadata" || ${JSON.stringify(event.technicalMetadata)}::jsonb,
        "error_message" = null,
        "processed_at" = ${event.occurredAt}
      from target, demotion_barrier
      where versions."id" = target."id"
      returning versions."asset_id"
    ), updated_asset as (
      update "broadcast_media_assets" assets
      set
        "status" = 'ready',
        "duration_ms" = coalesce(${event.durationMs}, assets."duration_ms"),
        "metadata" = assets."metadata" || jsonb_build_object(
          'processedByAgent', ${context.agent.agentKey},
          'processedAt', ${event.occurredAt}::timestamptz
        ),
        "updated_at" = ${receivedAt}
      from updated_version
      where assets."id" = updated_version."asset_id"
        and assets."archived_at" is null
      returning assets."id"
    )
    select exists(select 1 from updated_version) as "updated"
  `);
  return Boolean((result.rows[0] as { updated?: boolean } | undefined)?.updated);
}

async function markMediaFailed(context: AgentContext, event: Extract<BroadcastAgentEvent, { type: "media_failed" }>, receivedAt: Date) {
  const result = await context.database.execute(sql<{ updated: boolean }>`
    with updated_version as (
      update "broadcast_media_versions" versions
      set
        "status" = case when ${event.retryable} then 'processing'::broadcast_media_version_status else 'failed'::broadcast_media_version_status end,
        "is_current" = case when ${event.retryable} then versions."is_current" else false end,
        "technical_metadata" = versions."technical_metadata"
          || ${JSON.stringify(event.technicalMetadata)}::jsonb
          || jsonb_build_object(
            'lastProcessingError', ${event.errorMessage},
            'processingRetryable', ${event.retryable},
            'lastProcessingAttemptAt', ${event.occurredAt}::timestamptz
          ),
        "error_message" = ${event.errorMessage},
        "processed_at" = case when ${event.retryable} then null else ${event.occurredAt} end
      where versions."id" = ${event.mediaVersionId}
        and versions."status" in ('pending', 'processing')
        and versions."is_current" = true
        and versions."archived_at" is null
        and exists (
          select 1
          from "broadcast_media_assets" assets
          where assets."id" = versions."asset_id"
            and assets."archived_at" is null
        )
      returning versions."asset_id"
    ), updated_asset as (
      update "broadcast_media_assets" assets
      set
        "status" = case when ${event.retryable} then 'processing'::broadcast_media_status else 'failed'::broadcast_media_status end,
        "metadata" = assets."metadata" || jsonb_build_object(
          'lastProcessingError', ${event.errorMessage},
          'processingRetryable', ${event.retryable},
          'processedByAgent', ${context.agent.agentKey},
          'processedAt', ${event.occurredAt}::timestamptz
        ),
        "updated_at" = ${receivedAt}
      from updated_version
      where assets."id" = updated_version."asset_id"
        and assets."archived_at" is null
      returning assets."id"
    )
    select exists(select 1 from updated_version) as "updated"
  `);
  return Boolean((result.rows[0] as { updated?: boolean } | undefined)?.updated);
}

export async function POST(request: Request) {
  try {
    // Reject bad credentials before reading even the bounded request body.
    authenticateBroadcastAgent(request);
    const envelope = await readAgentEventsEnvelope(request);
    const context = await resolveBroadcastAgentContext(request, envelope.outputKey, envelope.agentId);
    await assertEventScope(
      context.database,
      context.agent.id,
      context.output.id,
      envelope.events,
    );

    const receivedAt = new Date();
    let duplicates = 0;
    for (const event of envelope.events) {
      switch (event.type) {
        case "heartbeat":
          await recordHeartbeat(context, event, receivedAt);
          break;
        case "now_playing":
          if (!await recordNowPlaying(context, event, receivedAt)) duplicates += 1;
          break;
        case "as_run":
          if (!await recordAsRun(context, event, receivedAt)) duplicates += 1;
          break;
        case "command_ack":
          await acknowledgeCommand(context, event);
          break;
        case "error":
          await recordAgentError(context, event, receivedAt);
          break;
        case "live_source_status":
          await updateLiveSource(context, event, receivedAt);
          break;
        case "media_ready":
          await markMediaReady(context, event, receivedAt);
          break;
        case "media_failed":
          await markMediaFailed(context, event, receivedAt);
          break;
      }
    }

    return Response.json({
      ok: true,
      schemaVersion: BROADCAST_AGENT_CONTRACT_VERSION,
      accepted: envelope.events.length,
      duplicates,
      serverTime: receivedAt.toISOString(),
    }, {
      status: 202,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof BroadcastAgentContractError) {
      return broadcastAgentContractErrorResponse(error);
    }
    return broadcastAgentErrorResponse(error);
  }
}
