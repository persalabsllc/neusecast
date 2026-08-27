import { currentWeatherCenterRun } from "@/lib/weather-center/service";

export const dynamic = "force-dynamic";

export default async function TeleprompterPage() {
  const current = await currentWeatherCenterRun();
  return <main style={{ minHeight: "100vh", padding: "7vh 9vw 20vh", background: "#020303", color: "white", fontFamily: "Arial, sans-serif" }}><header style={{ position: "sticky", top: 0, padding: "18px 0", background: "#020303ee", color: "#69dfce", fontSize: "18px", letterSpacing: ".12em", textTransform: "uppercase" }}>NeuseCast Weather Center · Presenter Script</header><div style={{ maxWidth: "1100px", margin: "auto", whiteSpace: "pre-wrap", fontSize: "clamp(34px, 4.8vw, 72px)", lineHeight: 1.45, letterSpacing: ".005em" }}>{current.run?.presenterScript ?? "Weather Center is updating."}</div></main>;
}
