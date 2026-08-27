import "server-only";

import { and, asc, count, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { requireBroadcastOperator } from "@/lib/broadcast/control-auth";
import { MAX_PUBLISHED_LOG_ITEMS } from "@/lib/broadcast/scheduler";
import {
  broadcastAgents,
  broadcastAgentHeartbeats,
  broadcastGraphicLayers,
  broadcastLiveSources,
  broadcastMediaAssets,
  broadcastMediaVersions,
  broadcastOutputs,
  broadcastProgramItems,
  broadcastProgramLogs,
  broadcastTickerItems,
} from "@/lib/db/schema";
import type { StudioDashboardData, StudioLogSummary } from "./studio-types";

const MAIN_OUTPUT_SLUG = "main";

type StudioDataView = "on-air" | "library" | "logs" | "graphics" | "live" | "settings";

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export async function loadStudioDashboard(
  requestedLogId?: string | null,
  view: StudioDataView = "on-air",
): Promise<StudioDashboardData> {
  await requireBroadcastOperator();
  const db = getDatabase();
  const now = new Date();
  const [output] = await db
    .select()
    .from(broadcastOutputs)
    .where(and(eq(broadcastOutputs.slug, MAIN_OUTPUT_SLUG), isNull(broadcastOutputs.archivedAt)))
    .limit(1);

  const outputId = output?.id ?? null;
  const [assetRows, logRows, tickerRows, graphicRows, liveRows, agentRows] = await Promise.all([
    view === "library" || view === "logs"
      ? db
      .select({
        id: broadcastMediaAssets.id,
        versionId: broadcastMediaVersions.id,
        name: broadcastMediaAssets.name,
        kind: broadcastMediaAssets.kind,
        category: broadcastMediaAssets.category,
        segment: broadcastMediaAssets.segment,
        status: broadcastMediaAssets.status,
        durationMs: broadcastMediaAssets.durationMs,
        sourceUrl: broadcastMediaVersions.playbackUrl,
        thumbnailUrl: broadcastMediaVersions.thumbnailUrl,
        originalFileName: broadcastMediaVersions.originalFileName,
        mimeType: broadcastMediaVersions.mimeType,
        fileSizeBytes: broadcastMediaVersions.fileSizeBytes,
        width: broadcastMediaVersions.width,
        height: broadcastMediaVersions.height,
        tags: broadcastMediaAssets.tags,
        createdAt: broadcastMediaAssets.createdAt,
      })
      .from(broadcastMediaAssets)
      .leftJoin(
        broadcastMediaVersions,
        and(eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id), eq(broadcastMediaVersions.isCurrent, true)),
      )
      .where(isNull(broadcastMediaAssets.archivedAt))
      .orderBy(desc(broadcastMediaAssets.createdAt))
      .limit(240)
      : Promise.resolve([]),
    outputId && ["on-air", "library", "logs"].includes(view)
      ? db
          .select({
            id: broadcastProgramLogs.id,
            name: broadcastProgramLogs.name,
            serviceDate: broadcastProgramLogs.serviceDate,
            status: broadcastProgramLogs.status,
            revision: broadcastProgramLogs.revision,
            startsAt: broadcastProgramLogs.startsAt,
            endsAt: broadcastProgramLogs.endsAt,
            publishedAt: broadcastProgramLogs.publishedAt,
            itemCount: count(broadcastProgramItems.id),
          })
          .from(broadcastProgramLogs)
          .leftJoin(broadcastProgramItems, eq(broadcastProgramItems.logId, broadcastProgramLogs.id))
          .where(and(eq(broadcastProgramLogs.outputId, outputId), isNull(broadcastProgramLogs.archivedAt)))
          .groupBy(broadcastProgramLogs.id)
          .orderBy(desc(broadcastProgramLogs.serviceDate), desc(broadcastProgramLogs.revision))
          .limit(30)
      : Promise.resolve([]),
    outputId && view === "graphics"
      ? db
          .select()
          .from(broadcastTickerItems)
          .where(and(eq(broadcastTickerItems.outputId, outputId), isNull(broadcastTickerItems.archivedAt)))
          .orderBy(desc(broadcastTickerItems.priority), desc(broadcastTickerItems.updatedAt))
          .limit(80)
      : Promise.resolve([]),
    outputId && view === "graphics"
      ? db
          .select()
          .from(broadcastGraphicLayers)
          .where(and(
            or(eq(broadcastGraphicLayers.outputId, outputId), isNull(broadcastGraphicLayers.outputId)),
            isNull(broadcastGraphicLayers.archivedAt),
          ))
          .orderBy(asc(broadcastGraphicLayers.layer))
      : Promise.resolve([]),
    view === "live"
      ? db
      .select()
      .from(broadcastLiveSources)
      .where(isNull(broadcastLiveSources.archivedAt))
      .orderBy(asc(broadcastLiveSources.name))
      : Promise.resolve([]),
    view === "on-air" || view === "settings"
      ? output?.assignedAgentId
        ? db.select().from(broadcastAgents).where(eq(broadcastAgents.id, output.assignedAgentId)).limit(1)
        : db
            .select()
            .from(broadcastAgents)
            .where(and(eq(broadcastAgents.enabled, true), isNull(broadcastAgents.archivedAt)))
            .orderBy(desc(broadcastAgents.lastHeartbeatAt))
            .limit(1)
      : Promise.resolve([]),
  ]);

  const logs: StudioLogSummary[] = logRows.map((log) => ({
    ...log,
    serviceDate: String(log.serviceDate),
    startsAt: log.startsAt.toISOString(),
    endsAt: log.endsAt.toISOString(),
    publishedAt: iso(log.publishedAt),
    itemCount: Number(log.itemCount),
  }));

  const requestedLog = requestedLogId ? logs.find((log) => log.id === requestedLogId) : null;
  const activeLog = logs.find((log) => (
    ["published", "on_air"].includes(log.status)
    && new Date(log.startsAt) <= now
    && new Date(log.endsAt) > now
  ));
  const draftLog = logs.find((log) => log.status === "draft");
  const selectedLog = requestedLog
    ?? (view === "on-air" ? activeLog : draftLog ?? activeLog)
    ?? logs[0]
    ?? null;

  const agent = agentRows[0] ?? null;
  const [latestHeartbeat] = agent && view === "on-air"
    ? await db
        .select({ currentProgramItemId: broadcastAgentHeartbeats.currentProgramItemId })
        .from(broadcastAgentHeartbeats)
        .where(eq(broadcastAgentHeartbeats.agentId, agent.id))
        .orderBy(desc(broadcastAgentHeartbeats.receivedAt))
        .limit(1)
    : [];

  const itemRows = selectedLog && (view === "on-air" || view === "logs")
    ? await db
        .select({
          id: broadcastProgramItems.id,
          position: broadcastProgramItems.position,
          label: broadcastProgramItems.label,
          sourceKind: broadcastProgramItems.sourceKind,
          category: broadcastProgramItems.mediaCategory,
          status: broadcastProgramItems.status,
          plannedStartAt: broadcastProgramItems.plannedStartAt,
          plannedEndAt: broadcastProgramItems.plannedEndAt,
          durationMs: broadcastProgramItems.durationMs,
          hardStart: broadcastProgramItems.hardStart,
          allowTicker: broadcastProgramItems.allowTicker,
          mediaVersionId: broadcastProgramItems.mediaVersionId,
          mediaAssetId: broadcastMediaVersions.assetId,
          mediaUrl: broadcastMediaVersions.playbackUrl,
          thumbnailUrl: broadcastMediaVersions.thumbnailUrl,
          mediaKind: broadcastMediaAssets.kind,
          liveSourceId: broadcastProgramItems.liveSourceId,
          liveSourceName: broadcastLiveSources.name,
        })
        .from(broadcastProgramItems)
        .leftJoin(broadcastMediaVersions, eq(broadcastMediaVersions.id, broadcastProgramItems.mediaVersionId))
        .leftJoin(broadcastMediaAssets, eq(broadcastMediaAssets.id, broadcastMediaVersions.assetId))
        .leftJoin(broadcastLiveSources, eq(broadcastLiveSources.id, broadcastProgramItems.liveSourceId))
        .where(view === "on-air"
          ? and(
              eq(broadcastProgramItems.logId, selectedLog.id),
              or(
                gt(broadcastProgramItems.plannedEndAt, new Date(now.getTime() - 5 * 60_000)),
                latestHeartbeat?.currentProgramItemId
                  ? eq(broadcastProgramItems.id, latestHeartbeat.currentProgramItemId)
                  : undefined,
              ),
            )
          : eq(broadcastProgramItems.logId, selectedLog.id))
        .orderBy(asc(broadcastProgramItems.position))
        .limit(view === "on-air" ? 120 : MAX_PUBLISHED_LOG_ITEMS)
    : [];

  const agentHealthy = Boolean(
    agent?.lastHeartbeatAt
    && now.getTime() - agent.lastHeartbeatAt.getTime() < 75_000
    && ["ready", "starting"].includes(agent.status),
  );

  return {
    serverTime: now.toISOString(),
    output: output
      ? {
          id: output.id,
          slug: output.slug,
          name: output.name,
          status: output.status,
          enabled: output.enabled,
          alwaysOn: output.alwaysOn,
          width: output.width,
          height: output.height,
          frameRate: `${output.frameRateNumerator}/${output.frameRateDenominator}`,
          timeZone: output.timeZone,
          assignedAgentId: output.assignedAgentId,
          lastHeartbeatAt: iso(output.lastHeartbeatAt),
          lastError: output.lastError,
        }
      : null,
    agent: agent
      ? {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          lastHeartbeatAt: iso(agent.lastHeartbeatAt),
          softwareVersion: agent.softwareVersion,
          hostname: agent.hostname,
          currentProgramItemId: latestHeartbeat?.currentProgramItemId ?? null,
          healthy: agentHealthy,
        }
      : null,
    assets: assetRows.map((asset) => ({
      ...asset,
      createdAt: asset.createdAt.toISOString(),
    })),
    logs,
    selectedLog,
    programItems: itemRows.map((item) => ({
      ...item,
      plannedStartAt: item.plannedStartAt.toISOString(),
      plannedEndAt: item.plannedEndAt.toISOString(),
    })),
    tickerItems: tickerRows.map((item) => ({
      id: item.id,
      message: item.message,
      priority: item.priority,
      status: item.status,
      sourceName: item.sourceName,
      startsAt: iso(item.startsAt),
      expiresAt: iso(item.expiresAt),
      automated: Boolean(item.automationKey),
    })),
    graphicLayers: graphicRows.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: layer.kind,
      layer: layer.layer,
      templateKey: layer.templateKey,
      enabled: layer.enabled,
      persistent: layer.persistent,
      data: layer.data,
    })),
    liveSources: liveRows.map((source) => ({
      id: source.id,
      name: source.name,
      slug: source.slug,
      protocol: source.protocol,
      status: source.status,
      endpointUrl: source.endpointUrl,
      enabled: source.enabled,
      autoRecord: source.autoRecord,
      activeAutoFailover: source.metadata?.activeAutoFailover === true,
      lastSignalAt: iso(source.lastSignalAt),
      lastError: source.lastError,
    })),
    configuration: {
      blobReady: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      agentSecretReady: Boolean(process.env.BROADCAST_AGENT_SECRET),
      // The secret ingest URL lives only on the persistent playout host. The
      // web control plane records a non-secret readiness marker instead.
      cloudflareIngestReady: process.env.BROADCAST_CLOUDFLARE_CONFIGURED === "true"
        || Boolean(process.env.NEXT_PUBLIC_BROADCAST_HLS_URL),
      publicHlsReady: Boolean(process.env.NEXT_PUBLIC_BROADCAST_HLS_URL),
      publicHlsUrl: process.env.NEXT_PUBLIC_BROADCAST_HLS_URL ?? null,
    },
  };
}
