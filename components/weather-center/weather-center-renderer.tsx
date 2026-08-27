"use client";

import { useEffect, useState } from "react";
import type { WeatherCenterRunView, WeatherCenterScene, WeatherCenterSnapshot } from "@/lib/weather-center/types";
import { WEATHER_CENTER_SCENES } from "@/lib/weather-center/types";
import styles from "./weather-center-renderer.module.css";

type Props = {
  initialRun: WeatherCenterRunView;
  requestedScene?: string;
  compact?: boolean;
};

const SHOW_SCENES = WEATHER_CENTER_SCENES.filter((scene) => scene !== "tropical");

function icon(condition: string) {
  if (/thunder|storm/iu.test(condition)) return "⛈";
  if (/rain|shower/iu.test(condition)) return "🌧";
  if (/snow|sleet|ice/iu.test(condition)) return "🌨";
  if (/fog|mist/iu.test(condition)) return "🌫";
  if (/cloud|overcast/iu.test(condition)) return "☁";
  return "☀";
}

function clock(value: string) {
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(parsed)
    : value;
}

function WeatherMap({ snapshot, radar = false }: { snapshot: WeatherCenterSnapshot; radar?: boolean }) {
  const positions: Record<string, [number, number]> = {
    Greenville: [37, 22], Washington: [55, 30], Kinston: [31, 48], "New Bern": [56, 52], Jacksonville: [40, 76], "Morehead City": [73, 72],
  };
  return (
    <div className={styles.map}>
      <svg viewBox="0 0 100 100" role="img" aria-label="Eastern North Carolina weather map">
        <path className={styles.land} d="M3 4 L84 4 L88 15 L78 26 L91 34 L82 45 L97 56 L87 65 L96 77 L86 92 L63 96 L49 90 L29 96 L9 86 L5 66 L14 50 L4 34 Z" />
        <path className={styles.river} d="M95 47 C78 45 76 54 61 53 C47 52 41 63 25 62" />
        <path className={styles.river} d="M60 53 C57 61 51 68 42 73" />
        {snapshot.locations.map((location) => {
          const point = positions[location.name];
          if (!point) return null;
          return <g key={location.name} transform={`translate(${point[0]} ${point[1]})`}><circle r="1.3" /><text x="2.4" y="-1">{location.name}</text><text className={styles.mapTemp} x="2.4" y="3.4">{location.temperature === null ? "--" : `${location.temperature}°`}</text></g>;
        })}
      </svg>
      {radar ? <div className={styles.radarLayer} style={{ backgroundImage: `url(${snapshot.radar.imageUrl}&ts=${encodeURIComponent(snapshot.issuedAt)})` }} /> : null}
      {radar ? <span className={styles.radarLegend}>NOAA MRMS · Updates every 5 minutes</span> : null}
    </div>
  );
}

function Scene({ scene, snapshot }: { scene: WeatherCenterScene; snapshot: WeatherCenterSnapshot }) {
  const current = snapshot.forecast[0];
  if (scene === "open") return <div className={styles.hero}><span>Captain 97.1 FM</span><h1>Weather Center</h1><p>Eastern North Carolina</p></div>;
  if (scene === "close") return <div className={styles.hero}><span>Always local. Always current.</span><h1>NeuseCast Weather</h1><p>NEUSECAST.COM</p></div>;
  if (scene === "current") return (
    <div className={styles.currentGrid}><div><span className={styles.location}>{snapshot.primaryLocation}</span><strong className={styles.bigTemp}>{snapshot.current.temperature ?? current.temperature}°</strong><h2>{snapshot.current.condition}</h2><p>Feels like {snapshot.current.feelsLike ?? snapshot.current.temperature ?? current.temperature}°</p></div><div className={styles.weatherGlyph}>{icon(snapshot.current.condition)}</div><dl><div><dt>Humidity</dt><dd>{snapshot.current.humidity ?? "--"}%</dd></div><div><dt>Wind</dt><dd>{snapshot.current.windDirection} {snapshot.current.windSpeed || "Light"}</dd></div><div><dt>Rain chance</dt><dd>{current.precipitationChance ?? 0}%</dd></div></dl></div>
  );
  if (scene === "hourly") return <div><h1 className={styles.sceneTitle}>Hour by Hour</h1><div className={styles.hourly}>{snapshot.hourly.slice(0, 8).map((period) => <div key={period.startsAt}><span>{clock(period.startsAt)}</span><b>{icon(period.shortForecast)}</b><strong>{period.temperature}°</strong><small>{period.precipitationChance ?? 0}%</small></div>)}</div></div>;
  if (scene === "seven-day") return <div><h1 className={styles.sceneTitle}>Seven-Day Forecast</h1><div className={styles.days}>{snapshot.forecast.filter((period) => period.isDaytime).slice(0, 7).map((period) => <div key={period.startsAt}><span>{period.name}</span><b>{icon(period.shortForecast)}</b><strong>{period.temperature}°</strong><small>{period.shortForecast}</small></div>)}</div></div>;
  if (scene === "regional") return <div><h1 className={styles.sceneTitle}>Eastern Carolina Temperatures</h1><WeatherMap snapshot={snapshot} /></div>;
  if (scene === "radar") return <div><h1 className={styles.sceneTitle}>Regional Radar</h1><WeatherMap snapshot={snapshot} radar /></div>;
  if (scene === "alerts") return <div><h1 className={styles.sceneTitle}>Watches &amp; Warnings</h1>{snapshot.alerts.length ? <div className={styles.alerts}>{snapshot.alerts.map((alert) => <article key={alert.id}><strong>{alert.event}</strong><p>{alert.area}</p><small>Expires {clock(alert.expiresAt)}</small></article>)}</div> : <div className={styles.clear}><b>✓</b><h2>No active alerts for New Bern</h2><p>Official National Weather Service alert feed</p></div>}</div>;
  if (scene === "marine") return <div><h1 className={styles.sceneTitle}>Coastal &amp; Marine</h1><div className={styles.marine}>{snapshot.marine.length ? snapshot.marine.slice(0, 3).map((period) => <article key={period.name}><span>{period.name}</span><strong>{period.wind}</strong><p>{period.forecast}</p></article>) : <article><strong>Marine forecast temporarily unavailable</strong><p>Check weather.gov/mhx before leaving shore.</p></article>}</div></div>;
  if (scene === "tides") return <div><h1 className={styles.sceneTitle}>Neuse River Tides</h1><p className={styles.subheading}>Oriental · NOAA station 8655133</p><div className={styles.tides}>{snapshot.tides.length ? snapshot.tides.slice(0, 4).map((tide) => <div key={`${tide.time}-${tide.type}`}><span>{tide.type === "high" ? "▲ High" : "▼ Low"}</span><strong>{clock(tide.time)}</strong><small>{tide.heightFeet === null ? "—" : `${tide.heightFeet.toFixed(1)} ft`}</small></div>) : <div><strong>Tide predictions updating</strong></div>}</div></div>;
  if (scene === "tropical") return <div className={styles.hero}><span>Atlantic Tropics</span><h1>Official Outlook</h1><p>{snapshot.tropical.message}</p></div>;
  return null;
}

export function WeatherCenterRenderer({ initialRun, requestedScene = "sequence", compact = false }: Props) {
  const [run, setRun] = useState(initialRun);
  const fixedScene = WEATHER_CENTER_SCENES.includes(requestedScene as WeatherCenterScene) ? requestedScene as WeatherCenterScene : null;
  const [index, setIndex] = useState(0);
  const scene = fixedScene ?? SHOW_SCENES[index % SHOW_SCENES.length];
  useEffect(() => {
    if (fixedScene) return;
    const timer = window.setInterval(() => setIndex((value) => value + 1), 8_000);
    return () => window.clearInterval(timer);
  }, [fixedScene]);
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/weather-center/current", { cache: "no-store" });
        const payload = await response.json();
        if (response.ok && payload.run?.id !== run.id) setRun(payload.run);
      } catch { /* retain last-known valid package */ }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [run.id]);
  const updated = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(run.issuedAt));
  return <main className={`${styles.frame} ${compact ? styles.compact : ""}`}><div className={styles.glow} /><header><strong>NEUSECAST <i>TV</i></strong><span>{run.data.sponsorLabel}</span><time>Updated {updated}</time></header><section key={scene} className={styles.scene}><Scene scene={scene} snapshot={run.data} /></section><footer><span>National Weather Service &amp; NOAA</span><strong>NEUSECAST.COM</strong></footer></main>;
}
