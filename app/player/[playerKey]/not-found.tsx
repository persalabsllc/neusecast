import { MonitorX } from "lucide-react";

export default function PlayerNotFound() {
  return (
    <main className="player-empty">
      <MonitorX size={54} aria-hidden="true" />
      <h1>This screen is not registered.</h1>
      <p>Check its NeuseCast player address in the Control Room.</p>
    </main>
  );
}
