import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  broadcastAgentErrorResponse,
  resolveBroadcastAgentContext,
} from "@/lib/broadcast/agent-auth";
import {
  BROADCAST_AGENT_CONTRACT_VERSION,
  BROADCAST_AGENT_POLL_AFTER_MS,
  BroadcastAgentContractError,
  broadcastAgentContractErrorResponse,
  parseOutputKey,
} from "@/lib/broadcast/agent-contract";
import { compactAgentProgramItem } from "@/lib/broadcast/agent-snapshot";
import { MAX_PUBLISHED_LOG_ITEMS } from "@/lib/broadcast/scheduler";
import {
  broadcastGraphicLayers,
  broadcastLiveSources,
  broadcastMediaAssets,
  broadcastMediaVersions,
  broadcastProgramItems,
  broadcastProgramLogs,
  broadcastTickerItems,
} from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

type FingerprintRow = {
  graphics: string;
  ticker: string;
  liveSources: string;
  ingest: string;
};

async function snapshotStateEtag(input: {
  database: Awaited<ReturnType<typeof resolveBroadcastAgentContext>>["database"];
  outputId: string;
  agentId: string;
  now: Date;
  controlState: Record<string, unknown>;
}) {
  const result = await input.database.execute(sql<FingerprintRow>`
    select
      (
        select md5(coalesce(string_agg(
          md5(jsonb_build_array(
            graphic."id", graphic."name", graphic."kind", graphic."layer", graphic."template_key",
            graphic."enabled", graphic."persistent", graphic."revision", graphic."data", graphic."style",
            graphic."starts_at", graphic."ends_at", asset."id", asset."slug", asset."name",
            version."id", version."playback_url", version."thumbnail_url"
          )::text),
          '' order by graphic."layer", graphic."id"
        ), ''))
        from "broadcast_graphic_layers" graphic
        left join "broadcast_media_assets" asset on asset."id" = graphic."media_asset_id"
        left join "broadcast_media_versions" version
          on version."asset_id" = asset."id"
          and version."is_current" = true
          and version."status" = 'ready'
          and version."archived_at" is null
        where (graphic."output_id" = ${input.outputId} or graphic."output_id" is null)
          and graphic."enabled" = true
          and graphic."archived_at" is null
          and (graphic."starts_at" is null or graphic."starts_at" <= ${input.now})
          and (graphic."ends_at" is null or graphic."ends_at" > ${input.now})
      ) as "graphics",
      (
        select md5(coalesce(string_agg(
          md5(jsonb_build_array(
            ticker."id", ticker."message", ticker."priority", ticker."status", ticker."source_name",
            ticker."source_url", ticker."automation_key", ticker."starts_at", ticker."expires_at",
            ticker."minimum_interval_seconds", ticker."maximum_plays", ticker."play_count", ticker."metadata"
          )::text),
          '' order by
            case ticker."priority"
              when 'emergency' then 4
              when 'urgent' then 3
              when 'important' then 2
              else 1
            end desc,
            ticker."created_at",
            ticker."id"
        ), ''))
        from "broadcast_ticker_items" ticker
        where (ticker."output_id" = ${input.outputId} or ticker."output_id" is null)
          and ticker."status" in ('approved', 'scheduled', 'active')
          and ticker."archived_at" is null
          and (ticker."starts_at" is null or ticker."starts_at" <= ${input.now})
          and (ticker."expires_at" is null or ticker."expires_at" > ${input.now})
          and (ticker."maximum_plays" is null or ticker."play_count" < ticker."maximum_plays")
      ) as "ticker",
      (
        select md5(coalesce(string_agg(
          md5(jsonb_build_array(
            live."id", live."slug", live."name", live."protocol", live."status", live."endpoint_url",
            live."credential_secret_ref", live."failover_asset_id", live."auto_record",
            live."reconnect_timeout_seconds", live."last_signal_at", live."last_error", live."metadata"
          )::text),
          '' order by live."name", live."id"
        ), ''))
        from "broadcast_live_sources" live
        where live."assigned_agent_id" = ${input.agentId}
          and live."enabled" = true
          and live."archived_at" is null
      ) as "liveSources",
      (
        select md5(coalesce(string_agg(
          md5(jsonb_build_array(
            version."id", asset."id", asset."slug", asset."name", asset."kind", asset."category",
            version."revision", version."status", version."original_file_name", version."mime_type",
            version."file_size_bytes", version."checksum_sha256", version."storage_provider",
            version."storage_key", version."source_url", version."playback_url", version."created_at"
          )::text),
          '' order by version."created_at", version."id"
        ), ''))
        from "broadcast_media_versions" version
        inner join "broadcast_media_assets" asset on asset."id" = version."asset_id"
        where version."status" in ('pending', 'processing')
          and asset."status" in ('uploading', 'processing')
          and version."archived_at" is null
          and asset."archived_at" is null
      ) as "ingest"
  `);
  const fingerprints = result.rows[0] as unknown as FingerprintRow | undefined;
  const digest = createHash("sha256")
    .update(JSON.stringify({
      ...input.controlState,
      graphics: fingerprints?.graphics ?? "",
      ticker: fingerprints?.ticker ?? "",
      liveSources: fingerprints?.liveSources ?? "",
      ingest: fingerprints?.ingest ?? "",
    }), "utf8")
    .digest("base64url");
  return `W/"${digest}"`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outputKey = parseOutputKey(url.searchParams.get("outputKey"));
    const { database, agent, output } = await resolveBroadcastAgentContext(request, outputKey);
    const now = new Date();

    const [publishedLog] = await database
      .select()
      .from(broadcastProgramLogs)
      .where(and(
        eq(broadcastProgramLogs.outputId, output.id),
        inArray(broadcastProgramLogs.status, ["published", "on_air"]),
        gt(broadcastProgramLogs.endsAt, now),
        isNull(broadcastProgramLogs.archivedAt),
      ))
      .orderBy(asc(broadcastProgramLogs.startsAt), desc(broadcastProgramLogs.revision))
      .limit(1);

    const agentState = {
      id: agent.id,
      key: agent.agentKey,
      name: agent.name,
      kind: agent.kind,
      status: agent.status,
    };
    // Keep telemetry-updated status/timestamps out of the ETag control
    // fingerprint; heartbeats must not force a full-day schedule
    // response. The full response adds both below for monitoring and
    // Start/Stop ordering barriers.
    const outputControlState = {
      id: output.id,
      key: output.slug,
      name: output.name,
      kind: output.kind,
      enabled: output.enabled,
      alwaysOn: output.alwaysOn,
      controlRevision: output.controlRevision,
      timeZone: output.timeZone,
      caspar: {
        channel: output.casparChannel,
        width: output.width,
        height: output.height,
        frameRateNumerator: output.frameRateNumerator,
        frameRateDenominator: output.frameRateDenominator,
        audioSampleRate: output.audioSampleRate,
      },
      delivery: {
        provider: output.deliveryProvider,
        protocol: output.deliveryProtocol,
        destinationUrl: output.destinationUrl,
        credentialSecretRef: output.credentialSecretRef,
        providerInputId: output.providerInputId,
      },
      consumerConfig: output.consumerConfig,
      overlayConfig: output.overlayConfig,
    };
    const outputState = {
      ...outputControlState,
      status: output.status,
      updatedAt: output.updatedAt.toISOString(),
    };
    const logState = publishedLog
      ? {
          id: publishedLog.id,
          serviceDate: publishedLog.serviceDate,
          name: publishedLog.name,
          status: publishedLog.status,
          revision: publishedLog.revision,
          timeZone: publishedLog.timeZone,
          startsAt: publishedLog.startsAt.toISOString(),
          endsAt: publishedLog.endsAt.toISOString(),
          publishedAt: publishedLog.publishedAt?.toISOString() ?? null,
          lockedThrough: publishedLog.lockedThrough?.toISOString() ?? null,
          updatedAt: publishedLog.updatedAt.toISOString(),
        }
      : null;
    const etag = await snapshotStateEtag({
      database,
      outputId: output.id,
      agentId: agent.id,
      now,
      controlState: {
        // A published log ID/revision is the immutable playout configuration.
        // Per-item runtime status is telemetry and intentionally does not make
        // an unchanged 24-hour schedule expensive to validate every five seconds.
        validatorVersion: 3,
        deploymentRevision: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 40) ?? "local",
        schemaVersion: BROADCAST_AGENT_CONTRACT_VERSION,
        pollAfterMs: BROADCAST_AGENT_POLL_AFTER_MS,
        agent: agentState,
        output: outputControlState,
        log: logState,
      },
    });
    const responseHeaders = { ...NO_STORE_HEADERS, ETag: etag };
    if (request.headers.get("if-none-match")?.split(",").some((value) => value.trim() === etag)) {
      return new Response(null, { status: 304, headers: responseHeaders });
    }

    const [itemRows, graphicRows, tickerRows, liveSources, ingestRows] = await Promise.all([
      publishedLog
        ? database
            .select({
              id: broadcastProgramItems.id,
              position: broadcastProgramItems.position,
              label: broadcastProgramItems.label,
              sourceKind: broadcastProgramItems.sourceKind,
              mediaCategory: broadcastProgramItems.mediaCategory,
              dynamicKey: broadcastProgramItems.dynamicKey,
              plannedStartAt: broadcastProgramItems.plannedStartAt,
              plannedEndAt: broadcastProgramItems.plannedEndAt,
              durationMs: broadcastProgramItems.durationMs,
              hardStart: broadcastProgramItems.hardStart,
              allowTicker: broadcastProgramItems.allowTicker,
              transition: broadcastProgramItems.transition,
              overlayPolicy: broadcastProgramItems.overlayPolicy,
              mediaVersionId: broadcastMediaVersions.id,
              mediaRevision: broadcastMediaVersions.revision,
              mediaStatus: broadcastMediaVersions.status,
              mimeType: broadcastMediaVersions.mimeType,
              checksumSha256: broadcastMediaVersions.checksumSha256,
              sourceUrl: broadcastMediaVersions.sourceUrl,
              playbackUrl: broadcastMediaVersions.playbackUrl,
              thumbnailUrl: broadcastMediaVersions.thumbnailUrl,
              captionUrl: broadcastMediaVersions.captionUrl,
              mediaDurationMs: broadcastMediaVersions.durationMs,
              mediaWidth: broadcastMediaVersions.width,
              mediaHeight: broadcastMediaVersions.height,
              mediaTechnicalMetadata: broadcastMediaVersions.technicalMetadata,
              assetId: broadcastMediaAssets.id,
              assetSlug: broadcastMediaAssets.slug,
              assetName: broadcastMediaAssets.name,
              assetKind: broadcastMediaAssets.kind,
              assetCategory: broadcastMediaAssets.category,
              liveSourceId: broadcastLiveSources.id,
              liveSourceSlug: broadcastLiveSources.slug,
              liveSourceName: broadcastLiveSources.name,
              liveSourceProtocol: broadcastLiveSources.protocol,
              liveSourceStatus: broadcastLiveSources.status,
              liveSourceEndpointUrl: broadcastLiveSources.endpointUrl,
              liveSourceCredentialSecretRef: broadcastLiveSources.credentialSecretRef,
              liveSourceReconnectTimeoutSeconds: broadcastLiveSources.reconnectTimeoutSeconds,
              liveSourceFailoverAssetId: broadcastLiveSources.failoverAssetId,
            })
            .from(broadcastProgramItems)
            .leftJoin(broadcastMediaVersions, eq(broadcastProgramItems.mediaVersionId, broadcastMediaVersions.id))
            .leftJoin(broadcastMediaAssets, eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id))
            .leftJoin(broadcastLiveSources, eq(broadcastProgramItems.liveSourceId, broadcastLiveSources.id))
            .where(eq(broadcastProgramItems.logId, publishedLog.id))
            .orderBy(asc(broadcastProgramItems.position), asc(broadcastProgramItems.id))
            .limit(MAX_PUBLISHED_LOG_ITEMS + 1)
        : Promise.resolve([]),
      database
        .select({
          id: broadcastGraphicLayers.id,
          name: broadcastGraphicLayers.name,
          kind: broadcastGraphicLayers.kind,
          layer: broadcastGraphicLayers.layer,
          templateKey: broadcastGraphicLayers.templateKey,
          enabled: broadcastGraphicLayers.enabled,
          persistent: broadcastGraphicLayers.persistent,
          revision: broadcastGraphicLayers.revision,
          data: broadcastGraphicLayers.data,
          style: broadcastGraphicLayers.style,
          startsAt: broadcastGraphicLayers.startsAt,
          endsAt: broadcastGraphicLayers.endsAt,
          mediaAssetId: broadcastMediaAssets.id,
          mediaAssetSlug: broadcastMediaAssets.slug,
          mediaAssetName: broadcastMediaAssets.name,
          mediaVersionId: broadcastMediaVersions.id,
          mediaPlaybackUrl: broadcastMediaVersions.playbackUrl,
          mediaThumbnailUrl: broadcastMediaVersions.thumbnailUrl,
        })
        .from(broadcastGraphicLayers)
        .leftJoin(broadcastMediaAssets, eq(broadcastGraphicLayers.mediaAssetId, broadcastMediaAssets.id))
        .leftJoin(
          broadcastMediaVersions,
          and(
            eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id),
            eq(broadcastMediaVersions.isCurrent, true),
            eq(broadcastMediaVersions.status, "ready"),
            isNull(broadcastMediaVersions.archivedAt),
          ),
        )
        .where(and(
          or(eq(broadcastGraphicLayers.outputId, output.id), isNull(broadcastGraphicLayers.outputId)),
          eq(broadcastGraphicLayers.enabled, true),
          isNull(broadcastGraphicLayers.archivedAt),
          or(isNull(broadcastGraphicLayers.startsAt), lte(broadcastGraphicLayers.startsAt, now)),
          or(isNull(broadcastGraphicLayers.endsAt), gt(broadcastGraphicLayers.endsAt, now)),
        ))
        .orderBy(asc(broadcastGraphicLayers.layer), asc(broadcastGraphicLayers.id)),
      database
        .select({
          id: broadcastTickerItems.id,
          message: broadcastTickerItems.message,
          priority: broadcastTickerItems.priority,
          status: broadcastTickerItems.status,
          sourceName: broadcastTickerItems.sourceName,
          sourceUrl: broadcastTickerItems.sourceUrl,
          automationKey: broadcastTickerItems.automationKey,
          startsAt: broadcastTickerItems.startsAt,
          expiresAt: broadcastTickerItems.expiresAt,
          minimumIntervalSeconds: broadcastTickerItems.minimumIntervalSeconds,
          maximumPlays: broadcastTickerItems.maximumPlays,
          playCount: broadcastTickerItems.playCount,
          metadata: broadcastTickerItems.metadata,
        })
        .from(broadcastTickerItems)
        .where(and(
          or(eq(broadcastTickerItems.outputId, output.id), isNull(broadcastTickerItems.outputId)),
          inArray(broadcastTickerItems.status, ["approved", "scheduled", "active"]),
          isNull(broadcastTickerItems.archivedAt),
          or(isNull(broadcastTickerItems.startsAt), lte(broadcastTickerItems.startsAt, now)),
          or(isNull(broadcastTickerItems.expiresAt), gt(broadcastTickerItems.expiresAt, now)),
          or(isNull(broadcastTickerItems.maximumPlays), sql`${broadcastTickerItems.playCount} < ${broadcastTickerItems.maximumPlays}`),
        ))
        .orderBy(
          sql`case ${broadcastTickerItems.priority}
            when 'emergency' then 4
            when 'urgent' then 3
            when 'important' then 2
            else 1
          end desc`,
          asc(broadcastTickerItems.createdAt),
          asc(broadcastTickerItems.id),
        )
        .limit(100),
      database
        .select({
          id: broadcastLiveSources.id,
          key: broadcastLiveSources.slug,
          name: broadcastLiveSources.name,
          enabled: broadcastLiveSources.enabled,
          protocol: broadcastLiveSources.protocol,
          status: broadcastLiveSources.status,
          endpointUrl: broadcastLiveSources.endpointUrl,
          credentialSecretRef: broadcastLiveSources.credentialSecretRef,
          failoverAssetId: broadcastLiveSources.failoverAssetId,
          autoRecord: broadcastLiveSources.autoRecord,
          reconnectTimeoutSeconds: broadcastLiveSources.reconnectTimeoutSeconds,
          lastSignalAt: broadcastLiveSources.lastSignalAt,
          lastError: broadcastLiveSources.lastError,
          metadata: broadcastLiveSources.metadata,
        })
        .from(broadcastLiveSources)
        .where(and(
          eq(broadcastLiveSources.assignedAgentId, agent.id),
          eq(broadcastLiveSources.enabled, true),
          isNull(broadcastLiveSources.archivedAt),
        ))
        .orderBy(asc(broadcastLiveSources.name), asc(broadcastLiveSources.id)),
      database
        .select({
          mediaVersionId: broadcastMediaVersions.id,
          assetId: broadcastMediaAssets.id,
          assetSlug: broadcastMediaAssets.slug,
          assetName: broadcastMediaAssets.name,
          assetKind: broadcastMediaAssets.kind,
          category: broadcastMediaAssets.category,
          revision: broadcastMediaVersions.revision,
          status: broadcastMediaVersions.status,
          originalFileName: broadcastMediaVersions.originalFileName,
          mimeType: broadcastMediaVersions.mimeType,
          fileSizeBytes: broadcastMediaVersions.fileSizeBytes,
          checksumSha256: broadcastMediaVersions.checksumSha256,
          storageProvider: broadcastMediaVersions.storageProvider,
          storageKey: broadcastMediaVersions.storageKey,
          sourceUrl: broadcastMediaVersions.sourceUrl,
          playbackUrl: broadcastMediaVersions.playbackUrl,
          createdAt: broadcastMediaVersions.createdAt,
        })
        .from(broadcastMediaVersions)
        .innerJoin(broadcastMediaAssets, eq(broadcastMediaVersions.assetId, broadcastMediaAssets.id))
        .where(and(
          inArray(broadcastMediaVersions.status, ["pending", "processing"]),
          inArray(broadcastMediaAssets.status, ["uploading", "processing"]),
          isNull(broadcastMediaVersions.archivedAt),
          isNull(broadcastMediaAssets.archivedAt),
        ))
        .orderBy(asc(broadcastMediaVersions.createdAt), asc(broadcastMediaVersions.id))
        .limit(50),
    ]);

    if (itemRows.length > MAX_PUBLISHED_LOG_ITEMS) {
      throw new BroadcastAgentContractError(
        `The published log exceeds the ${MAX_PUBLISHED_LOG_ITEMS.toLocaleString()}-event delivery limit.`,
        413,
      );
    }

    const hydratedItems = itemRows.map((row) => ({
      id: row.id,
      position: row.position,
      label: row.label,
      sourceKind: row.sourceKind,
      mediaCategory: row.mediaCategory,
      dynamicKey: row.dynamicKey,
      plannedStartAt: row.plannedStartAt.toISOString(),
      plannedEndAt: row.plannedEndAt.toISOString(),
      durationMs: row.durationMs,
      hardStart: row.hardStart,
      allowTicker: row.allowTicker,
      transition: row.transition,
      overlayPolicy: row.overlayPolicy,
      media: row.mediaVersionId && row.assetId
        ? {
            assetId: row.assetId,
            assetKey: row.assetSlug,
            assetName: row.assetName,
            assetKind: row.assetKind,
            category: row.assetCategory,
            versionId: row.mediaVersionId,
            revision: row.mediaRevision,
            status: row.mediaStatus,
            mimeType: row.mimeType,
            checksumSha256: row.checksumSha256,
            sha256: row.checksumSha256,
            playbackUrl: row.playbackUrl ?? row.sourceUrl,
            thumbnailUrl: row.thumbnailUrl,
            captionUrl: row.captionUrl,
            durationMs: row.mediaDurationMs,
            width: row.mediaWidth,
            height: row.mediaHeight,
            casparClipName: typeof row.mediaTechnicalMetadata?.casparClipName === "string"
              ? row.mediaTechnicalMetadata.casparClipName
              : null,
          }
        : null,
      liveSource: row.liveSourceId
        ? {
            id: row.liveSourceId,
            key: row.liveSourceSlug,
            name: row.liveSourceName,
            protocol: row.liveSourceProtocol,
            status: row.liveSourceStatus,
            endpointUrl: row.liveSourceEndpointUrl,
            credentialSecretRef: row.liveSourceCredentialSecretRef,
            reconnectTimeoutSeconds: row.liveSourceReconnectTimeoutSeconds,
            failoverAssetId: row.liveSourceFailoverAssetId,
          }
        : null,
    }));

    const assetsByVersionId = new Map<string, Record<string, unknown>>();
    for (const item of hydratedItems) {
      if (!item.media) continue;
      assetsByVersionId.set(item.media.versionId, {
        versionId: item.media.versionId,
        assetId: item.media.assetId,
        playbackUrl: item.media.playbackUrl,
        mimeType: item.media.mimeType,
        sha256: item.media.sha256,
      });
    }

    // Keep repeated program items reference-only. The exact pinned media is
    // sent once in `assets`, which keeps a dense full-day snapshot below the
    // Vercel Function payload ceiling and still lets the agent cache by version.
    const items = hydratedItems.map(compactAgentProgramItem);

    // Use response-construction time for playout clock alignment. The earlier
    // `now` intentionally anchors one consistent DB snapshot, but a large log
    // must not make the agent clock lag by the query/hydration duration.
    const responseTime = new Date();
    const responseBody = {
      ok: true,
      schemaVersion: BROADCAST_AGENT_CONTRACT_VERSION,
      serverTime: responseTime.toISOString(),
      pollAfterMs: BROADCAST_AGENT_POLL_AFTER_MS,
      agent: agentState,
      output: outputState,
      log: logState
        ? { ...logState, items }
        : null,
      assets: [...assetsByVersionId.values()],
      ingestQueue: ingestRows.map((row) => ({
        id: row.mediaVersionId,
        assetId: row.assetId,
        assetKey: row.assetSlug,
        assetName: row.assetName,
        assetKind: row.assetKind,
        category: row.category,
        revision: row.revision,
        status: row.status,
        originalFileName: row.originalFileName,
        mimeType: row.mimeType,
        fileSizeBytes: row.fileSizeBytes,
        checksumSha256: row.checksumSha256,
        sha256: row.checksumSha256,
        storageProvider: row.storageProvider,
        storageKey: row.storageKey,
        sourceUrl: row.sourceUrl,
        playbackUrl: row.playbackUrl,
        createdAt: row.createdAt.toISOString(),
      })),
      graphics: graphicRows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        layer: row.layer,
        templateKey: row.templateKey,
        enabled: row.enabled,
        persistent: row.persistent,
        revision: row.revision,
        data: row.data,
        style: row.style,
        startsAt: row.startsAt?.toISOString() ?? null,
        endsAt: row.endsAt?.toISOString() ?? null,
        media: row.mediaAssetId
          ? {
              assetId: row.mediaAssetId,
              assetKey: row.mediaAssetSlug,
              assetName: row.mediaAssetName,
              versionId: row.mediaVersionId,
              playbackUrl: row.mediaPlaybackUrl,
              thumbnailUrl: row.mediaThumbnailUrl,
            }
          : null,
      })),
      ticker: tickerRows.map((row) => ({
        ...row,
        startsAt: row.startsAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      })),
      liveSources: liveSources.map((source) => ({
        ...source,
        activeAutoFailover: source.metadata?.activeAutoFailover === true,
        lastSignalAt: source.lastSignalAt?.toISOString() ?? null,
      })),
    };
    return Response.json(responseBody, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof BroadcastAgentContractError) {
      return broadcastAgentContractErrorResponse(error);
    }
    return broadcastAgentErrorResponse(error);
  }
}
