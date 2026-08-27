"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import {
  broadcastAgentCommands,
  broadcastAgents,
  broadcastGraphicLayers,
  broadcastLiveSources,
  broadcastMediaAssets,
  broadcastMediaVersions,
  broadcastOutputs,
  broadcastProgramItems,
  broadcastProgramLogs,
  broadcastTickerItems,
  broadcastWeatherCenters,
} from "@/lib/db/schema";
import { requireBroadcastOperator } from "@/lib/broadcast/control-auth";
import { isLiveSourceTakeable, isSupportedLiveProtocol } from "@/lib/broadcast/live-source-safety";
import { buildDailySchedule, MAX_PUBLISHED_LOG_ITEMS, type SchedulableAsset } from "@/lib/broadcast/scheduler";
import { mediaClassification } from "@/lib/broadcast/media-taxonomy";

export type StudioActionResult = { ok: true; message: string; id?: string } | { ok: false; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_PRIORITIES = new Set(["routine", "important", "urgent", "emergency"] as const);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function uuid(value: unknown) {
  const parsed = text(value, 36);
  return UUID_PATTERN.test(parsed) ? parsed : null;
}

function revalidateStudio() {
  revalidatePath("/studio");
  revalidatePath("/studio/library");
  revalidatePath("/studio/logs");
  revalidatePath("/studio/graphics");
  revalidatePath("/studio/live");
  revalidatePath("/studio/settings");
}

function slugify(value: string) {
  const base = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 145);
  return `${base || "source"}-${randomUUID().slice(0, 8)}`;
}

function timeZoneOffset(timestamp: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  );
  return representedAsUtc - timestamp.getTime();
}

function zonedMidnight(dateValue: string, timeZone: string) {
  const initial = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(initial.getTime())) throw new Error("Invalid service date.");
  let result = new Date(initial.getTime() - timeZoneOffset(initial, timeZone));
  result = new Date(initial.getTime() - timeZoneOffset(result, timeZone));
  return result;
}

function nextDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function mainOutput() {
  const [output] = await getDatabase()
    .select()
    .from(broadcastOutputs)
    .where(and(eq(broadcastOutputs.slug, "main"), isNull(broadcastOutputs.archivedAt)))
    .limit(1);
  return output ?? null;
}

function draftRevisionGuard(
  database: ReturnType<typeof getDatabase>,
  logId: string,
  expectedRevision: number,
) {
  // Neon HTTP batches are transactional. This first statement locks the draft
  // and deliberately fails when a concurrent editor already changed it,
  // rolling back every later statement in the batch.
  return database.execute(sql`
    select 1 / count(*)::integer as revision_guard
    from (
      select id
      from broadcast_program_logs
      where id = ${logId}
        and revision = ${expectedRevision}
        and status = 'draft'
        and archived_at is null
      for update
    ) guarded_log
  `);
}

async function enqueueCommand(input: {
  outputId: string;
  agentId?: string | null;
  requestedByClerkUserId: string;
  commandType: string;
  programItemId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const agentId = input.agentId ?? null;
  if (!agentId) throw new Error("This output does not have an assigned playout agent.");
  const [agent] = await getDatabase()
    .select({ id: broadcastAgents.id })
    .from(broadcastAgents)
    .where(and(
      eq(broadcastAgents.id, agentId),
      eq(broadcastAgents.enabled, true),
      isNull(broadcastAgents.archivedAt),
    ))
    .limit(1);
  if (!agent) throw new Error("The assigned playout agent is disabled or unavailable.");

  const now = new Date();
  const [command] = await getDatabase()
    .insert(broadcastAgentCommands)
    .values({
      agentId,
      outputId: input.outputId,
      programItemId: input.programItemId ?? null,
      commandType: input.commandType.slice(0, 80),
      idempotencyKey: `${input.commandType}:${input.outputId}:${randomUUID()}`,
      payload: { ...(input.payload ?? {}), requestedByClerkUserId: input.requestedByClerkUserId },
      notBefore: now,
      expiresAt: new Date(now.getTime() + 5 * 60_000),
      requestedByClerkUserId: null,
    })
    .returning({ id: broadcastAgentCommands.id });
  return command.id;
}

export async function createDailyLogAction(serviceDateInput: string): Promise<StudioActionResult> {
  const { user } = await requireBroadcastOperator();
  const serviceDate = text(serviceDateInput, 10);
  if (!DATE_PATTERN.test(serviceDate)) return { ok: false, message: "Choose a valid broadcast date." };

  const output = await mainOutput();
  if (!output) return { ok: false, message: "The main broadcast output has not been installed." };

  const database = getDatabase();
  const [existing] = await database
    .select({
      id: broadcastProgramLogs.id,
      name: broadcastProgramLogs.name,
      status: broadcastProgramLogs.status,
      revision: broadcastProgramLogs.revision,
      timeZone: broadcastProgramLogs.timeZone,
      startsAt: broadcastProgramLogs.startsAt,
      endsAt: broadcastProgramLogs.endsAt,
      clockTemplateId: broadcastProgramLogs.clockTemplateId,
      notes: broadcastProgramLogs.notes,
      metadata: broadcastProgramLogs.metadata,
    })
    .from(broadcastProgramLogs)
    .where(and(eq(broadcastProgramLogs.outputId, output.id), eq(broadcastProgramLogs.serviceDate, serviceDate), isNull(broadcastProgramLogs.archivedAt)))
    .orderBy(desc(broadcastProgramLogs.revision))
    .limit(1);
  if (existing?.status === "draft") {
    return { ok: true, message: `${existing.name} already has an editable draft.`, id: existing.id };
  }

  try {
    if (existing) {
      const draftId = randomUUID();
      const nextRevision = existing.revision + 1;
      const now = new Date();
      await database.batch([
        database.insert(broadcastProgramLogs).values({
          id: draftId,
          outputId: output.id,
          serviceDate,
          name: existing.name,
          status: "draft",
          revision: nextRevision,
          timeZone: existing.timeZone,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          clockTemplateId: existing.clockTemplateId,
          notes: existing.notes,
          metadata: {
            ...existing.metadata,
            createdByClerkUserId: user.id,
            clonedFromLogId: existing.id,
            clonedAt: now.toISOString(),
          },
        }),
        database.execute(sql`
          insert into broadcast_program_items (
            id, log_id, clock_slot_id, position, label, source_kind,
            media_category, media_version_id, dynamic_key, live_source_id,
            status, planned_start_at, planned_end_at, duration_ms, hard_start,
            allow_ticker, transition, overlay_policy, resolved_at, notes,
            created_at, updated_at
          )
          select
            gen_random_uuid(), ${draftId}::uuid, clock_slot_id, position, label,
            source_kind, media_category, media_version_id, dynamic_key,
            live_source_id, 'scheduled'::broadcast_program_item_status,
            planned_start_at, planned_end_at, duration_ms, hard_start,
            allow_ticker, transition, overlay_policy, resolved_at, notes,
            ${now}, ${now}
          from broadcast_program_items
          where log_id = ${existing.id}::uuid
          order by position
        `),
      ]);
      revalidateStudio();
      return { ok: true, message: `Editable revision ${nextRevision} cloned from the published log.`, id: draftId };
    }

    const startsAt = zonedMidnight(serviceDate, output.timeZone);
    const endsAt = zonedMidnight(nextDate(serviceDate), output.timeZone);
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: output.timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(startsAt);
    const [log] = await database
      .insert(broadcastProgramLogs)
      .values({
        outputId: output.id,
        serviceDate,
        name: `${label} Broadcast Day`,
        timeZone: output.timeZone,
        startsAt,
        endsAt,
        approvedByClerkUserId: null,
        metadata: { createdByClerkUserId: user.id },
      })
      .returning({ id: broadcastProgramLogs.id });
    revalidateStudio();
    return { ok: true, message: "Draft broadcast day created.", id: log.id };
  } catch (error) {
    console.error("Could not create broadcast log", error);
    return { ok: false, message: "The broadcast day could not be created." };
  }
}

export async function generateDailyLogAction(logIdInput: string, expectedRevision: number): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const logId = uuid(logIdInput);
  if (!logId || !Number.isInteger(expectedRevision)) return { ok: false, message: "The log request is invalid." };

  const db = getDatabase();
  const [log] = await db.select().from(broadcastProgramLogs).where(eq(broadcastProgramLogs.id, logId)).limit(1);
  if (!log || log.status !== "draft") return { ok: false, message: "Only a draft log can be regenerated." };
  if (log.revision !== expectedRevision) return { ok: false, message: "This log changed in another session. Reload before generating it." };

  const media = await db
    .select({
      assetId: broadcastMediaAssets.id,
      versionId: broadcastMediaVersions.id,
      name: broadcastMediaAssets.name,
      kind: broadcastMediaAssets.kind,
      category: broadcastMediaAssets.category,
      availableFrom: broadcastMediaAssets.availableFrom,
      availableUntil: broadcastMediaAssets.availableUntil,
      rightsExpiresAt: broadcastMediaAssets.rightsExpiresAt,
      assetDurationMs: broadcastMediaAssets.durationMs,
      versionDurationMs: broadcastMediaVersions.durationMs,
    })
    .from(broadcastMediaAssets)
    .innerJoin(
      broadcastMediaVersions,
      and(eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id), eq(broadcastMediaVersions.isCurrent, true)),
    )
    .where(and(
      eq(broadcastMediaAssets.status, "ready"),
      eq(broadcastMediaVersions.status, "ready"),
      inArray(broadcastMediaAssets.category, ["program", "news", "weather", "events", "commercial", "promo", "bumper", "psa", "filler"]),
      or(isNull(broadcastMediaAssets.availableFrom), lte(broadcastMediaAssets.availableFrom, log.startsAt)),
      or(isNull(broadcastMediaAssets.availableUntil), gte(broadcastMediaAssets.availableUntil, log.endsAt)),
      or(isNull(broadcastMediaAssets.rightsExpiresAt), gte(broadcastMediaAssets.rightsExpiresAt, log.endsAt)),
      isNull(broadcastMediaAssets.archivedAt),
      isNull(broadcastMediaVersions.archivedAt),
    ));

  const schedulableMedia: SchedulableAsset[] = media.flatMap((asset) => {
      const durationMs = asset.versionDurationMs ?? asset.assetDurationMs;
      return durationMs && ["video", "image", "graphic"].includes(asset.kind) ? [{
        assetId: asset.assetId,
        versionId: asset.versionId,
        name: asset.name,
        category: asset.category,
        durationMs,
      }] : [];
    });
  const [weatherCenter] = await db.select({
    enabled: broadcastWeatherCenters.graphicsOnlyFallback,
    durationSeconds: broadcastWeatherCenters.reportDurationSeconds,
  }).from(broadcastWeatherCenters).where(eq(broadcastWeatherCenters.outputId, log.outputId)).limit(1);
  if (weatherCenter?.enabled) {
    schedulableMedia.push({
      assetId: "dynamic-weather-center",
      versionId: "dynamic-weather-center-v1",
      name: "NeuseCast Weather Center",
      category: "weather",
      durationMs: weatherCenter.durationSeconds * 1_000,
      dynamicKey: "weather_center",
    });
  }

  const schedule = buildDailySchedule(
    schedulableMedia,
    log.startsAt,
    log.endsAt,
    `${log.serviceDate}:r${log.revision + 1}`,
  );
  if (!schedule.length) {
    return { ok: false, message: "Upload and finish ingesting at least one asset with a known duration first." };
  }
  if (schedule.at(-1)?.plannedEndAt.getTime() !== log.endsAt.getTime()) {
    const minimumAverageSeconds = Math.ceil((log.endsAt.getTime() - log.startsAt.getTime()) / MAX_PUBLISHED_LOG_ITEMS / 1_000);
    return {
      ok: false,
      message: `This library would exceed the ${MAX_PUBLISHED_LOG_ITEMS.toLocaleString()}-event delivery limit before the day is filled. Use longer program segments averaging at least ${minimumAverageSeconds} seconds.`,
    };
  }

  try {
    const insertQueries = [];
    for (let index = 0; index < schedule.length; index += 250) {
      const chunk = schedule.slice(index, index + 250);
      insertQueries.push(
        db.insert(broadcastProgramItems).values(chunk.map((item) => ({
          logId: log.id,
          position: item.position,
          label: item.name,
          sourceKind: item.dynamicKey ? "dynamic" as const : "asset" as const,
          mediaCategory: item.category as typeof broadcastProgramItems.$inferInsert.mediaCategory,
          mediaVersionId: item.dynamicKey ? null : item.versionId,
          dynamicKey: item.dynamicKey ?? null,
          overlayPolicy: item.dynamicKey ? { mode: "none" } : {},
          plannedStartAt: item.plannedStartAt,
          plannedEndAt: item.plannedEndAt,
          durationMs: item.durationMs,
          resolvedAt: new Date(),
        }))),
      );
    }
    await db.batch([
      draftRevisionGuard(db, log.id, expectedRevision),
      db.delete(broadcastProgramItems).where(eq(broadcastProgramItems.logId, log.id)),
      ...insertQueries,
      db
        .update(broadcastProgramLogs)
        .set({ revision: log.revision + 1, generatedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(broadcastProgramLogs.id, log.id), eq(broadcastProgramLogs.revision, expectedRevision))),
    ]);
    revalidateStudio();
    return { ok: true, message: `${schedule.length.toLocaleString()} events scheduled across the broadcast day.` };
  } catch (error) {
    console.error("Could not generate broadcast log", error);
    return { ok: false, message: "The daily log could not be generated." };
  }
}

export async function addAssetToLogAction(input: {
  logId: string;
  assetId: string;
  expectedRevision: number;
}): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const logId = uuid(input.logId);
  const assetId = uuid(input.assetId);
  if (!logId || !assetId) return { ok: false, message: "The selected asset or log is invalid." };

  const db = getDatabase();
  const [[log], [asset], [tail]] = await Promise.all([
    db.select().from(broadcastProgramLogs).where(eq(broadcastProgramLogs.id, logId)).limit(1),
    db
      .select({
        name: broadcastMediaAssets.name,
        kind: broadcastMediaAssets.kind,
        category: broadcastMediaAssets.category,
        durationMs: broadcastMediaVersions.durationMs,
        fallbackDurationMs: broadcastMediaAssets.durationMs,
        versionId: broadcastMediaVersions.id,
        availableFrom: broadcastMediaAssets.availableFrom,
        availableUntil: broadcastMediaAssets.availableUntil,
        rightsExpiresAt: broadcastMediaAssets.rightsExpiresAt,
      })
      .from(broadcastMediaAssets)
      .innerJoin(broadcastMediaVersions, and(eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id), eq(broadcastMediaVersions.isCurrent, true)))
      .where(and(
        eq(broadcastMediaAssets.id, assetId),
        inArray(broadcastMediaAssets.kind, ["video", "image", "graphic"]),
        eq(broadcastMediaAssets.status, "ready"),
        eq(broadcastMediaVersions.status, "ready"),
        isNull(broadcastMediaAssets.archivedAt),
        isNull(broadcastMediaVersions.archivedAt),
      ))
      .limit(1),
    db
      .select({ position: broadcastProgramItems.position, plannedEndAt: broadcastProgramItems.plannedEndAt })
      .from(broadcastProgramItems)
      .where(eq(broadcastProgramItems.logId, logId))
      .orderBy(desc(broadcastProgramItems.position))
      .limit(1),
  ]);
  if (!log || log.status !== "draft" || log.revision !== input.expectedRevision) {
    return { ok: false, message: "This draft changed. Reload it before adding media." };
  }
  const durationMs = asset?.durationMs ?? asset?.fallbackDurationMs ?? null;
  if (!asset || !durationMs) return { ok: false, message: "That asset is not air-ready or has no verified duration." };
  const plannedStartAt = tail?.plannedEndAt ?? log.startsAt;
  if ((tail?.position ?? -1) + 1 >= MAX_PUBLISHED_LOG_ITEMS) {
    return { ok: false, message: `A broadcast day cannot exceed ${MAX_PUBLISHED_LOG_ITEMS.toLocaleString()} events.` };
  }
  if (plannedStartAt >= log.endsAt) return { ok: false, message: "The broadcast day is already full." };
  const actualDuration = Math.min(durationMs, log.endsAt.getTime() - plannedStartAt.getTime());
  const plannedEndAt = new Date(plannedStartAt.getTime() + actualDuration);
  if (
    (asset.availableFrom && asset.availableFrom > plannedStartAt)
    || (asset.availableUntil && asset.availableUntil < plannedEndAt)
    || (asset.rightsExpiresAt && asset.rightsExpiresAt < plannedEndAt)
  ) {
    return { ok: false, message: "That asset is not licensed or available for the requested air time." };
  }

  await db.batch([
    draftRevisionGuard(db, log.id, input.expectedRevision),
    db.insert(broadcastProgramItems).values({
      logId: log.id,
      position: (tail?.position ?? -1) + 1,
      label: asset.name,
      sourceKind: "asset",
      mediaCategory: asset.category,
      mediaVersionId: asset.versionId,
      plannedStartAt,
      plannedEndAt,
      durationMs: actualDuration,
      resolvedAt: new Date(),
    }),
    db.update(broadcastProgramLogs).set({ revision: log.revision + 1, updatedAt: new Date() }).where(eq(broadcastProgramLogs.id, log.id)),
  ]);
  revalidateStudio();
  return { ok: true, message: `${asset.name} added to the log.` };
}

export async function reorderLogAction(input: {
  logId: string;
  orderedItemIds: string[];
  expectedRevision: number;
}): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const logId = uuid(input.logId);
  const orderedItemIds = Array.isArray(input.orderedItemIds) ? input.orderedItemIds.map(uuid) : [];
  if (!logId || !orderedItemIds.length || orderedItemIds.some((id) => !id) || orderedItemIds.length > MAX_PUBLISHED_LOG_ITEMS) {
    return { ok: false, message: "The reordered log is invalid." };
  }
  const ids = orderedItemIds as string[];
  if (new Set(ids).size !== ids.length) return { ok: false, message: "The reordered log contains duplicate items." };

  const db = getDatabase();
  const [[log], currentItems] = await Promise.all([
    db.select().from(broadcastProgramLogs).where(eq(broadcastProgramLogs.id, logId)).limit(1),
    db.select({ id: broadcastProgramItems.id }).from(broadcastProgramItems).where(eq(broadcastProgramItems.logId, logId)),
  ]);
  if (!log || log.status !== "draft" || log.revision !== input.expectedRevision) {
    return { ok: false, message: "This draft changed. Reload before reordering it." };
  }
  if (currentItems.length !== ids.length || currentItems.some((item) => !ids.includes(item.id))) {
    return { ok: false, message: "The item list changed while you were editing. Reload and try again." };
  }

  await db.batch([
    draftRevisionGuard(db, log.id, input.expectedRevision),
    db.execute(sql`update broadcast_program_items set position = position + 20000 where log_id = ${log.id}`),
    db.execute(sql`
      with requested as (
        select item_id, ordinality - 1 as new_position
        from unnest(${ids}::uuid[]) with ordinality as ordered(item_id, ordinality)
      ), timed as (
        select
          item.id,
          requested.new_position,
          ${log.startsAt}::timestamptz + coalesce(
            sum(item.duration_ms) over (
              order by requested.new_position rows between unbounded preceding and 1 preceding
            ),
            0
          ) * interval '1 millisecond' as new_start,
          ${log.startsAt}::timestamptz + sum(item.duration_ms) over (
            order by requested.new_position rows between unbounded preceding and current row
          ) * interval '1 millisecond' as new_end
        from requested
        join broadcast_program_items item on item.id = requested.item_id
        where item.log_id = ${log.id}
      )
      update broadcast_program_items item
      set position = timed.new_position,
          planned_start_at = timed.new_start,
          planned_end_at = timed.new_end,
          updated_at = now()
      from timed
      where item.id = timed.id
    `),
    db
      .update(broadcastProgramLogs)
      .set({ revision: log.revision + 1, updatedAt: new Date() })
      .where(and(eq(broadcastProgramLogs.id, log.id), eq(broadcastProgramLogs.revision, input.expectedRevision))),
  ]);
  revalidateStudio();
  return { ok: true, message: "Log order saved." };
}

export async function removeLogItemAction(input: {
  logId: string;
  itemId: string;
  expectedRevision: number;
}): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const logId = uuid(input.logId);
  const itemId = uuid(input.itemId);
  if (!logId || !itemId) return { ok: false, message: "The log item is invalid." };
  const db = getDatabase();
  const [log] = await db.select().from(broadcastProgramLogs).where(eq(broadcastProgramLogs.id, logId)).limit(1);
  if (!log || log.status !== "draft" || log.revision !== input.expectedRevision) {
    return { ok: false, message: "This draft changed. Reload it before deleting an item." };
  }
  await db.batch([
    draftRevisionGuard(db, log.id, input.expectedRevision),
    db.delete(broadcastProgramItems).where(and(eq(broadcastProgramItems.id, itemId), eq(broadcastProgramItems.logId, log.id))),
    db.execute(sql`
      with ordered as (
        select id, row_number() over (order by position) - 1 as new_position
        from broadcast_program_items where log_id = ${log.id}
      )
      update broadcast_program_items item set position = ordered.new_position + 20000
      from ordered where item.id = ordered.id
    `),
    db.execute(sql`
      with timed as (
        select id,
          position - 20000 as new_position,
          ${log.startsAt}::timestamptz + coalesce(sum(duration_ms) over (order by position rows between unbounded preceding and 1 preceding), 0) * interval '1 millisecond' as new_start,
          ${log.startsAt}::timestamptz + sum(duration_ms) over (order by position rows between unbounded preceding and current row) * interval '1 millisecond' as new_end
        from broadcast_program_items where log_id = ${log.id}
      )
      update broadcast_program_items item set position = timed.new_position,
        planned_start_at = timed.new_start, planned_end_at = timed.new_end, updated_at = now()
      from timed where item.id = timed.id
    `),
    db.update(broadcastProgramLogs).set({ revision: log.revision + 1, updatedAt: new Date() }).where(eq(broadcastProgramLogs.id, log.id)),
  ]);
  revalidateStudio();
  return { ok: true, message: "Log item removed." };
}

export async function publishLogAction(logIdInput: string, expectedRevision: number): Promise<StudioActionResult> {
  const { user } = await requireBroadcastOperator();
  const logId = uuid(logIdInput);
  if (!logId) return { ok: false, message: "The selected log is invalid." };
  const db = getDatabase();
  const [[log], [totals], notReady] = await Promise.all([
    db.select().from(broadcastProgramLogs).where(eq(broadcastProgramLogs.id, logId)).limit(1),
    db.select({ count: sql<number>`count(*)::int` }).from(broadcastProgramItems).where(eq(broadcastProgramItems.logId, logId)),
    db
      .select({ id: broadcastProgramItems.id })
      .from(broadcastProgramItems)
      .leftJoin(broadcastMediaVersions, eq(broadcastMediaVersions.id, broadcastProgramItems.mediaVersionId))
      .leftJoin(broadcastMediaAssets, eq(broadcastMediaAssets.id, broadcastMediaVersions.assetId))
      .where(and(
        eq(broadcastProgramItems.logId, logId),
        eq(broadcastProgramItems.sourceKind, "asset"),
        orNotReady(),
      ))
      .limit(1),
  ]);
  if (!log || log.status !== "draft" || log.revision !== expectedRevision) {
    return { ok: false, message: "This draft changed. Reload it before publishing." };
  }
  if (!totals?.count) return { ok: false, message: "A blank log cannot be published." };
  if (totals.count > MAX_PUBLISHED_LOG_ITEMS) {
    return { ok: false, message: `A published day cannot exceed ${MAX_PUBLISHED_LOG_ITEMS.toLocaleString()} events.` };
  }
  if (notReady.length) return { ok: false, message: "One or more scheduled files are not air-ready." };

  const now = new Date();
  await db.batch([
    draftRevisionGuard(db, log.id, expectedRevision),
    db
      .update(broadcastProgramLogs)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(and(
        eq(broadcastProgramLogs.outputId, log.outputId),
        eq(broadcastProgramLogs.serviceDate, log.serviceDate),
        inArray(broadcastProgramLogs.status, ["published", "on_air"]),
        ne(broadcastProgramLogs.id, log.id),
      )),
    db
      .update(broadcastProgramLogs)
      .set({ status: "published", publishedAt: now, approvedByClerkUserId: null, metadata: { ...log.metadata, approvedByClerkUserId: user.id }, updatedAt: now })
      .where(and(eq(broadcastProgramLogs.id, log.id), eq(broadcastProgramLogs.revision, expectedRevision))),
  ]);
  revalidateStudio();
  return { ok: true, message: "Log published to the playout agent." };
}

function orNotReady() {
  return sql`(
    ${broadcastMediaVersions.id} is null
    or ${broadcastMediaVersions.status} <> 'ready'
    or ${broadcastMediaVersions.archivedAt} is not null
    or ${broadcastMediaAssets.id} is null
    or ${broadcastMediaAssets.status} <> 'ready'
    or ${broadcastMediaAssets.archivedAt} is not null
    or (${broadcastMediaAssets.availableFrom} is not null and ${broadcastMediaAssets.availableFrom} > ${broadcastProgramItems.plannedStartAt})
    or (${broadcastMediaAssets.availableUntil} is not null and ${broadcastMediaAssets.availableUntil} < ${broadcastProgramItems.plannedEndAt})
    or (${broadcastMediaAssets.rightsExpiresAt} is not null and ${broadcastMediaAssets.rightsExpiresAt} < ${broadcastProgramItems.plannedEndAt})
  )`;
}

export async function updateAssetAction(input: {
  assetId: string;
  name: string;
  category: string;
  segment?: string | null;
  durationSeconds?: number | null;
}): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const assetId = uuid(input.assetId);
  const name = text(input.name, 240);
  const category = text(input.category, 40);
  const classification = mediaClassification(category, text(input.segment, 40) || null);
  if (!assetId || !name || !classification) return { ok: false, message: "Enter a valid category and segment." };
  const seconds = Number(input.durationSeconds);
  const durationMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.round(seconds * 1_000), 86_400_000) : null;
  const database = getDatabase();
  const [asset] = await database
    .select({ kind: broadcastMediaAssets.kind })
    .from(broadcastMediaAssets)
    .where(and(eq(broadcastMediaAssets.id, assetId), isNull(broadcastMediaAssets.archivedAt)))
    .limit(1);
  if (!asset) return { ok: false, message: "The selected asset no longer exists." };
  const editorialDurationMs = asset.kind === "image" || asset.kind === "graphic" ? durationMs : null;
  const now = new Date();
  await database.batch([
    database
      .update(broadcastMediaAssets)
      .set({
        name,
        category: classification.category,
        segment: classification.segment,
        ...(editorialDurationMs ? { durationMs: editorialDurationMs } : {}),
        updatedAt: now,
      })
      .where(eq(broadcastMediaAssets.id, assetId)),
    // Still and graphic durations are editorial timing, not an ffprobe fact.
    // Keep the pinned current version aligned so manual and generated logs do
    // not silently keep the upload-time default after an operator edits it.
    ...(editorialDurationMs
      ? [database.execute(sql`
          update broadcast_media_versions versions
          set duration_ms = ${editorialDurationMs}
          from broadcast_media_assets assets
          where versions.asset_id = assets.id
            and assets.id = ${assetId}::uuid
            and assets.kind in ('image', 'graphic')
            and versions.is_current = true
            and versions.archived_at is null
        `)]
      : []),
  ]);
  revalidateStudio();
  return { ok: true, message: "Library metadata updated." };
}

export async function updateAssetCategoryAction(input: {
  assetId: string;
  category: string;
  segment?: string | null;
}): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const assetId = uuid(input.assetId);
  const category = text(input.category, 40);
  const classification = mediaClassification(category, text(input.segment, 40) || null);
  if (!assetId || !classification) {
    return { ok: false, message: "Choose a valid category and segment." };
  }
  const result = await getDatabase()
    .update(broadcastMediaAssets)
    .set({
      category: classification.category,
      segment: classification.segment,
      updatedAt: new Date(),
    })
    .where(and(eq(broadcastMediaAssets.id, assetId), isNull(broadcastMediaAssets.archivedAt)))
    .returning({ id: broadcastMediaAssets.id });
  if (!result.length) return { ok: false, message: "The selected asset no longer exists." };
  revalidateStudio();
  return { ok: true, message: "Library classification updated." };
}

export async function archiveAssetAction(assetIdInput: string): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const assetId = uuid(assetIdInput);
  if (!assetId) return { ok: false, message: "The selected asset is invalid." };
  const now = new Date();
  await getDatabase()
    .update(broadcastMediaAssets)
    .set({ status: "archived", archivedAt: now, updatedAt: now })
    .where(eq(broadcastMediaAssets.id, assetId));
  revalidateStudio();
  return { ok: true, message: "Asset archived. Existing published logs keep their pinned version." };
}

export async function createTickerAction(input: {
  message: string;
  priority: string;
  expiresAt?: string | null;
}): Promise<StudioActionResult> {
  const { user } = await requireBroadcastOperator();
  const output = await mainOutput();
  const message = text(input.message, 600);
  const priority = text(input.priority, 20);
  if (!output || !message || !TICKER_PRIORITIES.has(priority as never)) return { ok: false, message: "Enter a valid ticker message." };
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
    return { ok: false, message: "Ticker expiration must be in the future." };
  }
  await getDatabase().insert(broadcastTickerItems).values({
    outputId: output.id,
    message,
    priority: priority as typeof broadcastTickerItems.$inferInsert.priority,
    status: "active",
    startsAt: new Date(),
    expiresAt,
    approvedAt: new Date(),
    metadata: { approvedByClerkUserId: user.id, source: "studio_manual" },
  });
  revalidateStudio();
  return { ok: true, message: "Ticker message is on air." };
}

export async function setTickerActiveAction(tickerIdInput: string, active: boolean): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const tickerId = uuid(tickerIdInput);
  if (!tickerId) return { ok: false, message: "The ticker item is invalid." };
  await getDatabase()
    .update(broadcastTickerItems)
    .set({ status: active ? "active" : "cancelled", updatedAt: new Date() })
    .where(eq(broadcastTickerItems.id, tickerId));
  revalidateStudio();
  return { ok: true, message: active ? "Ticker message activated." : "Ticker message removed from air." };
}

export async function installDefaultGraphicsAction(): Promise<StudioActionResult> {
  const { user } = await requireBroadcastOperator();
  const output = await mainOutput();
  if (!output) return { ok: false, message: "The main output is not configured." };
  const existing = await getDatabase()
    .select({ kind: broadcastGraphicLayers.kind })
    .from(broadcastGraphicLayers)
    .where(and(eq(broadcastGraphicLayers.outputId, output.id), isNull(broadcastGraphicLayers.archivedAt)));
  const installed = new Set(existing.map((layer) => layer.kind));
  const defaults = [
    { name: "NeuseCast bug", kind: "logo" as const, layer: 80, templateKey: "neusecast/logo", persistent: true, data: { position: "top-right" } },
    { name: "Eastern time", kind: "clock" as const, layer: 81, templateKey: "neusecast/clock", persistent: true, data: { timeZone: output.timeZone } },
    { name: "Regional weather", kind: "weather" as const, layer: 82, templateKey: "neusecast/weather", persistent: true, data: { source: "nws", market: "Eastern North Carolina" } },
    { name: "News and alerts ticker", kind: "ticker" as const, layer: 90, templateKey: "neusecast/ticker", persistent: true, data: { speed: "normal" } },
  ].filter((layer) => !installed.has(layer.kind));
  if (defaults.length) {
    await getDatabase().insert(broadcastGraphicLayers).values(defaults.map((layer) => ({
      ...layer,
      outputId: output.id,
      createdByClerkUserId: null,
      data: { ...layer.data, createdByClerkUserId: user.id },
    })));
  }
  revalidateStudio();
  return { ok: true, message: defaults.length ? "Permanent logo, time, weather, and ticker layers installed." : "Default graphic layers are already installed." };
}

export async function setGraphicLayerEnabledAction(layerIdInput: string, enabled: boolean): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const layerId = uuid(layerIdInput);
  if (!layerId) return { ok: false, message: "The graphic layer is invalid." };
  await getDatabase()
    .update(broadcastGraphicLayers)
    .set({ enabled, revision: sql`${broadcastGraphicLayers.revision} + 1`, updatedAt: new Date() })
    .where(eq(broadcastGraphicLayers.id, layerId));
  revalidateStudio();
  return { ok: true, message: enabled ? "Graphic layer enabled." : "Graphic layer taken off air." };
}

export async function createLiveSourceAction(input: {
  name: string;
  protocol: string;
  endpointUrl?: string | null;
  credentialSecretRef?: string | null;
  activeAutoFailover?: boolean;
}): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const output = await mainOutput();
  const name = text(input.name, 240);
  const protocol = text(input.protocol, 20);
  const endpointUrl = text(input.endpointUrl, 2_000) || null;
  const credentialSecretRef = text(input.credentialSecretRef, 255) || null;
  if (!output || !name || !isSupportedLiveProtocol(protocol)) return { ok: false, message: "Enter a valid live source." };
  if (credentialSecretRef && !/^env:[A-Z][A-Z0-9_]{1,127}$/.test(credentialSecretRef)) {
    return { ok: false, message: "Secret references must use env:VARIABLE_NAME and point to the agent environment." };
  }
  if (protocol !== "test" && !endpointUrl && !credentialSecretRef) {
    return { ok: false, message: "This source needs an endpoint, local device identifier, or agent secret reference." };
  }
  if (protocol === "decklink") {
    const deviceIndex = Number(endpointUrl);
    if (!Number.isInteger(deviceIndex) || deviceIndex < 1 || deviceIndex > 64 || credentialSecretRef) {
      return { ok: false, message: "Choose a DeckLink device index from 1 through 64." };
    }
  }
  if (endpointUrl && /[\r\n]/.test(endpointUrl)) return { ok: false, message: "The source endpoint is invalid." };
  if (endpointUrl && ["rtmp", "rtmps", "srt", "rtsp"].includes(protocol)) {
    try {
      const parsed = new URL(endpointUrl);
      if (parsed.protocol.replace(":", "") !== protocol || parsed.username || parsed.password) throw new Error();
    } catch {
      return { ok: false, message: "Use the selected protocol and keep credentials in a secret reference, not the URL." };
    }
  }
  const [source] = await getDatabase().insert(broadcastLiveSources).values({
    slug: slugify(name),
    name,
    protocol: protocol as typeof broadcastLiveSources.$inferInsert.protocol,
    endpointUrl,
    credentialSecretRef,
    assignedAgentId: output.assignedAgentId,
    autoRecord: false,
    status: protocol === "test" ? "ready" : "offline",
    metadata: { activeAutoFailover: input.activeAutoFailover === true },
  }).returning({ id: broadcastLiveSources.id });
  revalidateStudio();
  return { ok: true, message: "Live source added. The playout agent will probe it before air.", id: source.id };
}

export async function setLiveSourceAutoFailoverAction(
  sourceIdInput: string,
  enabled: boolean,
): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const sourceId = uuid(sourceIdInput);
  if (!sourceId) return { ok: false, message: "The live source is invalid." };

  const [source] = await getDatabase()
    .update(broadcastLiveSources)
    .set({
      metadata: sql`coalesce(${broadcastLiveSources.metadata}, '{}'::jsonb)
        || jsonb_build_object('activeAutoFailover', ${Boolean(enabled)})`,
      updatedAt: new Date(),
    })
    .where(and(eq(broadcastLiveSources.id, sourceId), isNull(broadcastLiveSources.archivedAt)))
    .returning({ id: broadcastLiveSources.id });
  if (!source) return { ok: false, message: "The live source no longer exists." };

  revalidateStudio();
  return {
    ok: true,
    message: enabled
      ? "Automatic on-air failover armed for this multi-client source."
      : "Automatic on-air failover disabled; return to automation is manual.",
  };
}

export async function queuePlayoutCommandAction(input: {
  commandType: "take_item" | "skip" | "resume_automation" | "start_output" | "stop_output" | "refresh_graphics" | "take_live" | "remove_live";
  programItemId?: string | null;
  liveSourceId?: string | null;
}): Promise<StudioActionResult> {
  const { user } = await requireBroadcastOperator();
  const output = await mainOutput();
  if (!output) return { ok: false, message: "The main output is unavailable." };
  const programItemId = input.programItemId ? uuid(input.programItemId) : null;
  const liveSourceId = input.liveSourceId ? uuid(input.liveSourceId) : null;
  if (input.programItemId && !programItemId) return { ok: false, message: "The program item is invalid." };
  if (input.liveSourceId && !liveSourceId) return { ok: false, message: "The live source is invalid." };
  try {
    if (input.commandType === "take_live") {
      if (!liveSourceId) return { ok: false, message: "Choose a live source before taking it to air." };
      if (!output.enabled) return { ok: false, message: "Start the main output before taking a live source to air." };
      if (!output.assignedAgentId) return { ok: false, message: "The main output does not have an assigned playout agent." };

      const [source] = await getDatabase()
        .select({
          id: broadcastLiveSources.id,
          protocol: broadcastLiveSources.protocol,
          status: broadcastLiveSources.status,
          enabled: broadcastLiveSources.enabled,
          assignedAgentId: broadcastLiveSources.assignedAgentId,
        })
        .from(broadcastLiveSources)
        .where(and(eq(broadcastLiveSources.id, liveSourceId), isNull(broadcastLiveSources.archivedAt)))
        .limit(1);

      if (!source) return { ok: false, message: "The selected live source no longer exists." };
      if (!isSupportedLiveProtocol(source.protocol)) {
        return { ok: false, message: "That live source protocol is not supported by this playout build." };
      }
      if (!source.enabled) return { ok: false, message: "Enable the live source before taking it to air." };
      if (source.status === "live") return { ok: true, message: "That source is already on program." };
      if (!isLiveSourceTakeable(source)) {
        return { ok: false, message: "The live source must report ready before it can be taken to air." };
      }
      if (!source.assignedAgentId || source.assignedAgentId !== output.assignedAgentId) {
        return { ok: false, message: "The live source is not assigned to the main output's playout agent." };
      }
    }
    if (input.commandType === "remove_live") {
      if (!liveSourceId) return { ok: false, message: "Choose the live source that should leave program." };
      if (!output.assignedAgentId) return { ok: false, message: "The main output does not have an assigned playout agent." };
      const [source] = await getDatabase()
        .select({ id: broadcastLiveSources.id, assignedAgentId: broadcastLiveSources.assignedAgentId })
        .from(broadcastLiveSources)
        .where(and(eq(broadcastLiveSources.id, liveSourceId), isNull(broadcastLiveSources.archivedAt)))
        .limit(1);
      if (!source) return { ok: false, message: "The selected live source no longer exists." };
      if (source.assignedAgentId !== output.assignedAgentId) {
        return { ok: false, message: "The live source is not assigned to the main output's playout agent." };
      }
    }

    const persistentOutputCommand = input.commandType === "start_output" || input.commandType === "stop_output";
    const desiredControlRevision = persistentOutputCommand ? output.controlRevision + 1 : null;
    if (desiredControlRevision) {
      const desiredEnabled = input.commandType === "start_output";
      const [updatedOutput] = await getDatabase()
        .update(broadcastOutputs)
        .set({
          enabled: desiredEnabled,
          ...(desiredEnabled ? { status: "starting" as const } : { alwaysOn: false, status: "disabled" as const }),
          controlRevision: desiredControlRevision,
          updatedAt: new Date(),
        })
        .where(and(
          eq(broadcastOutputs.id, output.id),
          eq(broadcastOutputs.controlRevision, output.controlRevision),
        ))
        .returning({ id: broadcastOutputs.id });
      if (!updatedOutput) {
        revalidateStudio();
        return { ok: false, message: "Another operator changed the output. Reload Studio before trying again." };
      }
    }

    let commandId: string;
    try {
      commandId = await enqueueCommand({
        outputId: output.id,
        agentId: output.assignedAgentId,
        requestedByClerkUserId: user.id,
        commandType: input.commandType,
        programItemId,
        payload: {
          ...(liveSourceId ? { liveSourceId } : {}),
          ...(desiredControlRevision
            ? {
                desiredEnabled: input.commandType === "start_output",
                desiredAlwaysOn: input.commandType === "start_output" ? output.alwaysOn : false,
                desiredControlRevision,
              }
            : {}),
        },
      });
    } catch (error) {
      if (!persistentOutputCommand) throw error;
      revalidateStudio();
      return {
        ok: true,
        message: input.commandType === "stop_output"
          ? "The output is disabled and will remain off when the playout agent reconnects."
          : "The output is enabled and will start when the playout agent reconnects.",
      };
    }
    revalidateStudio();
    return { ok: true, message: "Command queued for the playout agent.", id: commandId };
  } catch (error) {
    console.error("Could not queue playout command", error);
    return { ok: false, message: error instanceof Error ? error.message : "The playout command could not be queued." };
  }
}

export async function updateOutputAutomationAction(input: {
  enabled: boolean;
  alwaysOn: boolean;
}): Promise<StudioActionResult> {
  await requireBroadcastOperator();
  const output = await mainOutput();
  if (!output) return { ok: false, message: "The main output is unavailable." };
  const desiredControlRevision = output.controlRevision + 1;
  const [updatedOutput] = await getDatabase()
    .update(broadcastOutputs)
    .set({
      enabled: Boolean(input.enabled),
      alwaysOn: Boolean(input.enabled && input.alwaysOn),
      status: input.enabled ? (output.status === "disabled" ? "standby" : output.status) : "disabled",
      controlRevision: desiredControlRevision,
      updatedAt: new Date(),
    })
    .where(and(
      eq(broadcastOutputs.id, output.id),
      eq(broadcastOutputs.controlRevision, output.controlRevision),
    ))
    .returning({ id: broadcastOutputs.id });
  revalidateStudio();
  if (!updatedOutput) {
    return { ok: false, message: "Another operator changed the output. Reload Studio before trying again." };
  }
  return { ok: true, message: input.enabled ? "Broadcast automation enabled." : "Broadcast automation disabled." };
}
