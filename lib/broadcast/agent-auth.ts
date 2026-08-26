import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { parseAgentKey } from "@/lib/broadcast/agent-contract";
import { getDatabase } from "@/lib/db";
import { broadcastAgents, broadcastOutputs } from "@/lib/db/schema";

export class BroadcastAgentAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 503,
  ) {
    super(message);
    this.name = "BroadcastAgentAuthError";
  }
}

function secretDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function equalSecret(received: string, expected: string) {
  return timingSafeEqual(secretDigest(received), secretDigest(expected));
}

/**
 * Authenticates the shared playout-agent credential. Agent identity is separate
 * from the credential so one secret can be rotated without changing an agent's
 * stable database key.
 */
export function authenticateBroadcastAgent(request: Request) {
  const expectedSecret = process.env.BROADCAST_AGENT_SECRET?.trim();
  if (!expectedSecret) {
    throw new BroadcastAgentAuthError(
      "Broadcast agent authentication is not configured.",
      503,
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer[\t ]+([^\s]+)$/i.exec(authorization);
  if (!match || !equalSecret(match[1], expectedSecret)) {
    throw new BroadcastAgentAuthError("Unauthorized.", 401);
  }

  const rawAgentKey = request.headers.get("x-neusecast-agent-id");
  return {
    agentKey: rawAgentKey ? parseAgentKey(rawAgentKey) : null,
  };
}

export async function resolveBroadcastAgentContext(
  request: Request,
  outputKey: string,
  requestedAgentKey?: string | null,
) {
  const authentication = authenticateBroadcastAgent(request);
  if (
    authentication.agentKey
    && requestedAgentKey
    && authentication.agentKey !== requestedAgentKey
  ) {
    throw new BroadcastAgentAuthError("Agent identity does not match the request.", 403);
  }

  const database = getDatabase();
  const [output] = await database
    .select()
    .from(broadcastOutputs)
    .where(and(eq(broadcastOutputs.slug, outputKey), isNull(broadcastOutputs.archivedAt)))
    .limit(1);
  if (!output) throw new BroadcastAgentAuthError("Agent is not assigned to this output.", 403);

  const configuredAgentKey = process.env.BROADCAST_AGENT_ID
    ? parseAgentKey(process.env.BROADCAST_AGENT_ID)
    : null;
  const agentKey = requestedAgentKey ?? authentication.agentKey ?? configuredAgentKey;
  const [agent] = agentKey
    ? await database
        .select()
        .from(broadcastAgents)
        .where(and(
          eq(broadcastAgents.agentKey, agentKey),
          eq(broadcastAgents.enabled, true),
          isNull(broadcastAgents.archivedAt),
        ))
        .limit(1)
    : output.assignedAgentId
      ? await database
          .select()
          .from(broadcastAgents)
          .where(and(
            eq(broadcastAgents.id, output.assignedAgentId),
            eq(broadcastAgents.enabled, true),
            isNull(broadcastAgents.archivedAt),
          ))
          .limit(1)
      : [];

  if (!agent || output.assignedAgentId !== agent.id) {
    throw new BroadcastAgentAuthError("Agent is not assigned to this output.", 403);
  }

  return { database, agent, output };
}

export function broadcastAgentErrorResponse(error: unknown) {
  if (error instanceof BroadcastAgentAuthError) {
    return Response.json(
      { ok: false, error: error.message },
      {
        status: error.status,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          ...(error.status === 401
            ? { "WWW-Authenticate": 'Bearer realm="NeuseCast Broadcast Agent"' }
            : {}),
        },
      },
    );
  }

  console.error("[broadcast:agent] request failed", error);
  return Response.json(
    { ok: false, error: "The broadcast control service is temporarily unavailable." },
    { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
