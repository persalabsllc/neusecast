import type { Metadata } from "next";
import { ScreenPlayer } from "@/components/screen-player";
import { demoPlayerSlides } from "@/lib/player-data";

export const metadata: Metadata = {
  title: "Live Screen Player",
  description: "NeuseCast screen player preview.",
};

export default async function PlayerPage({ params }: { params: Promise<{ screenId: string }> }) {
  const { screenId } = await params;
  const screenName = screenId === "demo" ? "Baker’s Kitchen · Front Counter" : `Screen ${screenId}`;

  return <ScreenPlayer screenId={screenId} screenName={screenName} slides={demoPlayerSlides} />;
}

