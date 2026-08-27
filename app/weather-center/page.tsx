import { WeatherCenterRenderer } from "@/components/weather-center/weather-center-renderer";
import { currentWeatherCenterRun } from "@/lib/weather-center/service";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ scene?: string; compact?: string }> };

export default async function WeatherCenterPage({ searchParams }: Props) {
  const params = await searchParams;
  const current = await currentWeatherCenterRun();
  if (!current.run) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#071923", color: "white", fontFamily: "sans-serif" }}>Weather Center is updating…</main>;
  return <WeatherCenterRenderer initialRun={current.run} requestedScene={params.scene} compact={params.compact === "1"} />;
}
