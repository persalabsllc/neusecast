import { sql } from "drizzle-orm";

import {
  broadcastAgentErrorResponse,
  resolveBroadcastAgentContext,
} from "@/lib/broadcast/agent-auth";
import {
  BROADCAST_AGENT_CONTRACT_VERSION,
  BROADCAST_AGENT_POLL_AFTER_MS,
  BroadcastAgentContractError,
  broadcastAgentContractErrorResponse,
  parseCommandCursor,
  parseOutputKey,
} from "@/lib/broadcast/agent-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClaimedCommandRow = {
  id: string;
  commandType: string;
  idempotencyKey: string;
  outputId: string | null;
  programItemId: string | null;
  payload: Record<string, unknown>;
  notBefore: Date | string;
  expiresAt: Date | string | null;
  attempt: number;
  claimedAt: Date | string;
};

function isoDate(value: Date | string | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const outputKey = parseOutputKey(url.searchParams.get("outputKey"));
    const cursor = parseCommandCursor(url.searchParams.get("after"));
    const { database, agent, output } = await resolveBroadcastAgentContext(request, outputKey);
    const now = new Date();

    const result = await database.execute(sql<ClaimedCommandRow>`
      with expired_commands as (
        update "broadcast_agent_commands"
        set
          "status" = 'expired',
          "completed_at" = ${now},
          "error_message" = coalesce("error_message", 'Command expired before delivery.'),
          "updated_at" = ${now}
        where "agent_id" = ${agent.id}
          and "output_id" = ${output.id}
          and "status" in ('queued', 'claimed')
          and "expires_at" is not null
          and "expires_at" <= ${now}
        returning "id"
      ), candidates as (
        select commands."id"
        from "broadcast_agent_commands" commands
        where commands."agent_id" = ${agent.id}
          and commands."output_id" = ${output.id}
          and commands."status" in ('queued', 'claimed')
          and commands."not_before" <= ${now}
          and (commands."expires_at" is null or commands."expires_at" > ${now})
          and (commands."status" = 'claimed' or commands."attempt_count" < commands."max_attempts")
          -- The after cursor is intentionally advisory only. Eligibility changes as
          -- not_before timestamps mature, so filtering pending commands by an
          -- append-only cursor could permanently skip a delayed command.
        order by commands."not_before", commands."created_at", commands."id"
        limit 25
        for update skip locked
      ), claimed_commands as (
        update "broadcast_agent_commands" commands
        set
          "status" = 'claimed',
          "claimed_at" = coalesce(commands."claimed_at", ${now}),
          "attempt_count" = commands."attempt_count" + case when commands."status" = 'queued' then 1 else 0 end,
          "updated_at" = ${now}
        from candidates
        where commands."id" = candidates."id"
        returning
          commands."id" as "id",
          commands."command_type" as "commandType",
          commands."idempotency_key" as "idempotencyKey",
          commands."output_id" as "outputId",
          commands."program_item_id" as "programItemId",
          commands."payload" as "payload",
          commands."not_before" as "notBefore",
          commands."expires_at" as "expiresAt",
          commands."attempt_count" as "attempt",
          commands."claimed_at" as "claimedAt"
      )
      select * from claimed_commands
      order by "notBefore", "claimedAt", "id"
    `);
    const claimedRows = result.rows as unknown as ClaimedCommandRow[];
    const commands = claimedRows.map((row) => ({
      id: row.id,
      type: row.commandType,
      idempotencyKey: row.idempotencyKey,
      outputId: row.outputId,
      programItemId: row.programItemId,
      payload: row.payload,
      notBefore: isoDate(row.notBefore),
      expiresAt: isoDate(row.expiresAt),
      attempt: Number(row.attempt),
      claimedAt: isoDate(row.claimedAt),
    }));
    const nextCursor = commands.at(-1)?.id
      ?? (cursor?.kind === "id" ? cursor.value : null);

    return Response.json({
      ok: true,
      schemaVersion: BROADCAST_AGENT_CONTRACT_VERSION,
      serverTime: now.toISOString(),
      pollAfterMs: BROADCAST_AGENT_POLL_AFTER_MS,
      commands,
      nextCursor,
    }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof BroadcastAgentContractError) {
      return broadcastAgentContractErrorResponse(error);
    }
    return broadcastAgentErrorResponse(error);
  }
}
