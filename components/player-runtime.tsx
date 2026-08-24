"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CloudSun, History, Lightbulb, MapPin, Radio, Store, Waves } from "lucide-react";
import type { PlayerItem, PlayerManifest } from "@/lib/player/types";

const kindLabels: Record<PlayerItem["kind"], string> = {
  advertisement: "Local business",
  host: "At this location",
  weather: "Local weather",
  event: "Around town",
  history: "Local history",
  trivia: "Quick trivia",
  community: "Eastern Carolina",
};

function KindIcon({ kind }: { kind: PlayerItem["kind"] }) {
  if (kind === "weather") return <CloudSun />;
  if (kind === "history") return <History />;
  if (kind === "trivia") return <Lightbulb />;
  if (kind === "event") return <CalendarDays />;
  if (kind === "host") return <Store />;
  return <Radio />;
}

function PlayerProgress({ durationSeconds }: { durationSeconds: number }) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
    const countdown = window.setInterval(() => {
      if (startedAt.current === null) return;
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setRemaining(Math.max(0, durationSeconds - elapsed));
    }, 1000);
    return () => window.clearInterval(countdown);
  }, [durationSeconds]);

  const progress = ((durationSeconds - remaining) / durationSeconds) * 100;
  return <span style={{ width: `${progress}%` }} />;
}

async function postJson(url: string, body?: object) {
  await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    keepalive: true,
  }).catch(() => undefined);
}

export function PlayerRuntime({ initialManifest, playerKey }: { initialManifest: PlayerManifest; playerKey: string }) {
  const [manifest, setManifest] = useState(initialManifest);
  const [activeIndex, setActiveIndex] = useState(0);
  const [clock, setClock] = useState("");
  const currentItem = manifest.items[activeIndex] ?? null;

  const location = useMemo(
    () => `${manifest.venue.city}, ${manifest.venue.state}`,
    [manifest.venue.city, manifest.venue.state],
  );

  const refreshManifest = useCallback(async () => {
    const response = await fetch(`/api/player/${playerKey}/manifest`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const nextManifest = (await response.json()) as PlayerManifest;
    if (nextManifest.items.length === 0) return;
    setManifest(nextManifest);
    setActiveIndex((index) => Math.min(index, nextManifest.items.length - 1));
  }, [playerKey]);

  useEffect(() => {
    const updateClock = () => {
      setClock(new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date()));
    };
    updateClock();
    const interval = window.setInterval(updateClock, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void postJson(`/api/player/${playerKey}/heartbeat`);
    const heartbeat = window.setInterval(() => void postJson(`/api/player/${playerKey}/heartbeat`), 30_000);
    const refresh = window.setInterval(() => void refreshManifest(), manifest.refreshAfterSeconds * 1000);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(refresh);
    };
  }, [manifest.refreshAfterSeconds, playerKey, refreshManifest]);

  useEffect(() => {
    if (!currentItem) return;

    const advance = window.setTimeout(() => {
      void postJson(`/api/player/${playerKey}/playback`, {
        eventId: crypto.randomUUID(),
        itemId: currentItem.id,
        source: currentItem.source,
        campaignId: currentItem.campaignId,
        creativeId: currentItem.creativeId,
        durationSeconds: currentItem.durationSeconds,
      });
      setActiveIndex((index) => (index + 1) % manifest.items.length);
    }, currentItem.durationSeconds * 1000);

    return () => {
      window.clearTimeout(advance);
    };
  }, [currentItem, manifest.items.length, playerKey]);

  if (!currentItem) {
    return (
      <main className="player-empty">
        <Waves size={54} aria-hidden="true" />
        <h1>NeuseCast is connected.</h1>
        <p>Waiting for scheduled content.</p>
      </main>
    );
  }

  return (
    <main className={`player-stage player-theme-${currentItem.theme}`}>
      <div className="player-orbit player-orbit-one" aria-hidden="true" />
      <div className="player-orbit player-orbit-two" aria-hidden="true" />

      <header className="player-header">
        <div className="player-brand">
          <span className="player-brand-icon" aria-hidden="true"><Waves /></span>
          <span><strong>NeuseCast</strong><small>Local screens, connected.</small></span>
        </div>
        <div className="player-status">
          <span className="player-live"><i aria-hidden="true" /> LIVE</span>
          <span><MapPin size={17} aria-hidden="true" /> {location}</span>
          <strong>{clock}</strong>
        </div>
      </header>

      <section className="player-slide" key={currentItem.id}>
        <div className="player-copy">
          <div className="player-eyebrow">
            <KindIcon kind={currentItem.kind} />
            {currentItem.eyebrow || kindLabels[currentItem.kind]}
          </div>
          <h1>{currentItem.title}</h1>
          <p>{currentItem.body}</p>
          {currentItem.callToAction ? <div className="player-cta">{currentItem.callToAction}</div> : null}
        </div>

        <div className="player-visual" aria-hidden="true">
          <div className="player-visual-ring"><KindIcon kind={currentItem.kind} /></div>
          <span>{currentItem.sponsor ?? kindLabels[currentItem.kind]}</span>
        </div>
      </section>

      <footer className="player-footer">
        <span>{manifest.venue.name}</span>
        <span className="player-position">{activeIndex + 1} / {manifest.items.length}</span>
        <span>Eastern Carolina&apos;s local screen network</span>
      </footer>

      <div className="player-progress" aria-hidden="true">
        <PlayerProgress key={currentItem.id} durationSeconds={currentItem.durationSeconds} />
      </div>
    </main>
  );
}
