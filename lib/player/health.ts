export const SCREEN_ONLINE_THRESHOLD_MS = 90_000;
export const SCREEN_DEGRADED_THRESHOLD_MS = 5 * 60_000;

export type ScreenHealth = "never_connected" | "online" | "degraded" | "offline" | "maintenance" | "retired";

type ScreenHealthInput = {
  active: boolean;
  status: "pending" | "online" | "offline" | "maintenance" | "retired";
  lastHeartbeatAt: Date | null;
};

export function deriveScreenHealth(screen: ScreenHealthInput, now = new Date()): ScreenHealth {
  if (screen.status === "retired") return "retired";
  if (!screen.active || screen.status === "maintenance") return "maintenance";
  if (!screen.lastHeartbeatAt) return "never_connected";

  const ageMs = Math.max(0, now.getTime() - screen.lastHeartbeatAt.getTime());
  if (ageMs <= SCREEN_ONLINE_THRESHOLD_MS) return "online";
  if (ageMs <= SCREEN_DEGRADED_THRESHOLD_MS) return "degraded";
  return "offline";
}
