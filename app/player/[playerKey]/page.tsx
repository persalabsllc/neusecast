import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlayerRuntime } from "@/components/player-runtime";
import { getPlayerManifest } from "@/lib/player/playlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NeuseCast Player",
  description: "NeuseCast digital signage player",
  robots: { index: false, follow: false },
};

export default async function PlayerPage({ params }: { params: Promise<{ playerKey: string }> }) {
  const { playerKey } = await params;
  const manifest = await getPlayerManifest(playerKey);

  if (!manifest) notFound();

  return <PlayerRuntime initialManifest={manifest} playerKey={playerKey} />;
}
