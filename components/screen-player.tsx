"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Expand,
  History,
  MapPin,
  Pause,
  Play,
  Radio,
  Store,
  Waves,
} from "lucide-react";
import type { PlayerSlide, PlayerSlideKind } from "@/lib/player-data";

const slideIcons: Record<PlayerSlideKind, typeof Store> = {
  host: Store,
  advertiser: Radio,
  weather: CloudSun,
  event: CalendarDays,
  local: History,
};

type ScreenPlayerProps = {
  screenId: string;
  screenName: string;
  slides: PlayerSlide[];
};

export function ScreenPlayer({ screenId, screenName, slides }: ScreenPlayerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const activeSlide = slides[activeIndex];
  const Icon = slideIcons[activeSlide.kind];
  const progress = Math.min(100, (elapsed / activeSlide.duration) * 100);

  const goTo = useCallback(
    (nextIndex: number) => {
      setActiveIndex((nextIndex + slides.length) % slides.length);
      setElapsed(0);
    },
    [slides.length],
  );

  const next = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);
  const previous = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const updated = current + 0.1;
        if (updated >= activeSlide.duration) {
          window.setTimeout(next, 0);
          return 0;
        }
        return updated;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [activeSlide.duration, next, playing]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") previous();
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((current) => !current);
      }
      if (event.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, previous]);

  const remaining = useMemo(
    () => Math.max(0, Math.ceil(activeSlide.duration - elapsed)),
    [activeSlide.duration, elapsed],
  );

  return (
    <main className={`tv-player tv-player-${activeSlide.accent}`} data-screen-id={screenId}>
      <div className="tv-player-atmosphere" aria-hidden="true">
        <span className="tv-orb tv-orb-one" />
        <span className="tv-orb tv-orb-two" />
        <span className="tv-waterline" />
      </div>

      <header className="tv-topbar">
        <div className="tv-brand-lockup">
          <span className="tv-brand-mark"><Waves size={30} aria-hidden="true" /></span>
          <span><strong>NEUSECAST</strong><small>Local screens. Local stories.</small></span>
        </div>
        <div className="tv-live-status">
          <span className="tv-live-dot" aria-hidden="true" />
          <span><strong>LIVE</strong><small>{screenName}</small></span>
        </div>
      </header>

      <section className="tv-stage" key={activeSlide.id} aria-live="polite">
        <div className="tv-content">
          <p className="tv-eyebrow"><Icon size={24} aria-hidden="true" /> {activeSlide.eyebrow}</p>
          <h1>{activeSlide.title}</h1>
          <p className="tv-body">{activeSlide.body}</p>
          <div className="tv-detail"><MapPin size={20} aria-hidden="true" /> {activeSlide.detail}</div>
        </div>

        <aside className="tv-feature" aria-label={activeSlide.meta}>
          <span className="tv-feature-icon"><Icon size={54} strokeWidth={1.4} aria-hidden="true" /></span>
          <span className="tv-feature-type">{activeSlide.meta}</span>
          <strong>{activeSlide.kind === "weather" ? "NEUSE + TRENT" : "EASTERN NC"}</strong>
          <small>{activeSlide.footer}</small>
        </aside>
      </section>

      <footer className="tv-footer">
        <span>{activeSlide.footer}</span>
        <span className="tv-next-up">Next in {remaining}s · {slides[(activeIndex + 1) % slides.length].meta}</span>
      </footer>

      <div className="tv-progress" aria-label={`Slide ${activeIndex + 1} of ${slides.length}`}>
        {slides.map((slide, index) => (
          <button key={slide.id} type="button" onClick={() => goTo(index)} aria-label={`Show slide ${index + 1}: ${slide.title}`}>
            <span className={index < activeIndex ? "is-complete" : index === activeIndex ? "is-active" : ""}>
              {index === activeIndex && <i style={{ width: `${progress}%` }} />}
            </span>
          </button>
        ))}
      </div>

      <div className="tv-controls" aria-label="Player controls">
        <button type="button" onClick={previous} aria-label="Previous slide"><ChevronLeft /></button>
        <button type="button" onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause player" : "Play player"}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button type="button" onClick={next} aria-label="Next slide"><ChevronRight /></button>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Enter fullscreen"><Expand /></button>
      </div>
    </main>
  );
}

