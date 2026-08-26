import type { PlayerAlert } from "./types";

const DEFAULT_RETRY_DELAYS_MS = [150, 500] as const;

export class NwsHttpError extends Error {
  constructor(readonly status: number) {
    super(`NWS request failed with ${status}.`);
    this.name = "NwsHttpError";
  }
}

export function isTransientNwsError(error: unknown) {
  if (error instanceof NwsHttpError) {
    return [408, 425, 429].includes(error.status) || error.status >= 500;
  }

  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return false;
  }

  // Node's fetch wraps socket closures and other transport failures in TypeError.
  return error instanceof TypeError;
}

export async function retryTransientNwsRequest<T>(
  request: () => Promise<T>,
  options: {
    delaysMs?: readonly number[];
    wait?: (delayMs: number) => Promise<void>;
  } = {},
): Promise<T> {
  const delaysMs = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const wait = options.wait ?? ((delayMs: number) => (
    new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  ));

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= delaysMs.length || !isTransientNwsError(error)) throw error;
      await wait(delaysMs[attempt]);
    }
  }
}

export function filterUnexpiredAlerts(alerts: PlayerAlert[], nowMs = Date.now()) {
  return alerts.filter((alert) => {
    if (!alert.expiresAt) return false;
    const expiresAtMs = Date.parse(alert.expiresAt);
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
}

export function createLastKnownAlertStore() {
  let lastKnown: PlayerAlert[] | null = null;

  return {
    remember(alerts: PlayerAlert[]) {
      lastKnown = alerts;
    },
    current(nowMs = Date.now()) {
      return lastKnown === null ? null : filterUnexpiredAlerts(lastKnown, nowMs);
    },
  };
}
