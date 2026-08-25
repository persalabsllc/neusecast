"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Landmark,
  MapPin,
  Newspaper,
  Radio,
} from "lucide-react";
import type { PlayerNewsroomEdition, PlayerNewsroomStory } from "@/lib/player/types";

type Scene =
  | { type: "open"; durationSeconds: number }
  | { type: "headlines"; durationSeconds: number }
  | { type: "story"; durationSeconds: number; story: PlayerNewsroomStory; storyNumber: number }
  | { type: "close"; durationSeconds: number };

function categoryLabel(category: string) {
  return category.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Updated today";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function StoryVisual({ story }: { story: PlayerNewsroomStory }) {
  if (story.imageUrl) {
    return (
      <div className="newsroom-photo-frame">
        {/* A CSS background avoids layout changes if an editorial image is slow. */}
        <div className="newsroom-photo" style={{ backgroundImage: `url(${JSON.stringify(story.imageUrl)})` }} />
        <div className="newsroom-photo-sheen" />
        {story.imageCredit ? <small>{story.imageCredit}</small> : null}
      </div>
    );
  }

  if (story.visualTemplate === "map" || story.locationLabel) {
    return (
      <div className="newsroom-map-card">
        <svg viewBox="0 0 720 430" role="img" aria-label={`Map graphic for ${story.locationLabel ?? "Eastern North Carolina"}`}>
          <path className="newsroom-map-land" d="M48 42H492l72 36-20 47 64 40-33 45 76 48-43 48 61 58-58 65H48Z" />
          <path className="newsroom-map-coast" d="M492 42l72 36-20 47 64 40-33 45 76 48-43 48 61 58-58 65" />
          <path className="newsroom-map-river" d="M71 250c116-66 211-26 291-67s145-42 239-5" />
          <circle cx="405" cy="237" r="13" />
          <circle className="newsroom-map-pulse" cx="405" cy="237" r="28" />
        </svg>
        <div><MapPin /><span>{story.locationLabel ?? "Eastern North Carolina"}</span></div>
      </div>
    );
  }

  if (story.visualTemplate === "civic" || /government|education|elections/u.test(story.category)) {
    return (
      <div className="newsroom-civic-card">
        <Landmark />
        <span>Public record</span>
        <strong>{categoryLabel(story.category)}</strong>
        <i /><i /><i />
      </div>
    );
  }

  return (
    <div className="newsroom-signal-card">
      <span><Radio /></span>
      <i /><i /><i />
      <strong>NeuseCast<br />Newsroom</strong>
    </div>
  );
}

export function NewsroomBroadcast({
  edition,
  durationSeconds,
  location,
}: {
  edition: PlayerNewsroomEdition;
  durationSeconds: number;
  location: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const scenes = useMemo<Scene[]>(() => [
    { type: "open", durationSeconds: 8 },
    { type: "headlines", durationSeconds: 18 },
    ...edition.stories.map((story, index): Scene => ({
      type: "story",
      durationSeconds: story.durationSeconds,
      story,
      storyNumber: index + 1,
    })),
    { type: "close", durationSeconds: 10 },
  ], [edition.stories]);

  useEffect(() => {
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      setElapsed(Math.min(durationSeconds, (performance.now() - startedAt) / 1_000));
    }, 200);
    return () => window.clearInterval(interval);
  }, [durationSeconds, edition.id, edition.revision]);

  if (edition.videoUrl) {
    return (
      <div className="newsroom-video-package">
        <video
          autoPlay
          muted
          playsInline
          poster={edition.posterUrl ?? undefined}
          preload="auto"
          src={edition.videoUrl}
        />
        <div className="newsroom-video-bug"><i /> LIVE · NEUSECAST NEWSROOM</div>
      </div>
    );
  }

  let sceneStart = 0;
  let activeScene = scenes.at(-1) as Scene;
  for (const scene of scenes) {
    if (elapsed < sceneStart + scene.durationSeconds) {
      activeScene = scene;
      break;
    }
    sceneStart += scene.durationSeconds;
  }
  const sceneKey = activeScene.type === "story"
    ? `story:${activeScene.story.id}`
    : activeScene.type;
  const sceneProgress = Math.min(1, Math.max(0, (elapsed - sceneStart) / activeScene.durationSeconds));
  const ticker = activeScene.type === "story" ? activeScene.story.ticker : edition.ticker;

  return (
    <div className="newsroom-broadcast" key={sceneKey}>
      <div className="newsroom-grid" aria-hidden="true" />
      <div className="newsroom-topline">
        <span><i /> NEUSECAST NEWSROOM</span>
        <strong>{location || "Eastern North Carolina"}</strong>
        <small>UPDATED {timeLabel(edition.updatedAt)}</small>
      </div>

      {activeScene.type === "open" ? (
        <div className="newsroom-open">
          <div className="newsroom-open-rings"><i /><i /><i /></div>
          <Newspaper />
          <span>Now from Eastern North Carolina</span>
          <h1>NeuseCast<br /><em>Newsroom</em></h1>
          <p>{edition.label}</p>
        </div>
      ) : null}

      {activeScene.type === "headlines" ? (
        <div className="newsroom-headlines">
          <div><span>Right now</span><h1>Your local headlines</h1><p>{edition.label}</p></div>
          <ol>
            {edition.stories.slice(0, 4).map((story, index) => (
              <li key={story.id}><b>{String(index + 1).padStart(2, "0")}</b><span>{story.headline}</span></li>
            ))}
          </ol>
        </div>
      ) : null}

      {activeScene.type === "story" ? (
        <div className={`newsroom-story newsroom-story-${activeScene.story.visualTemplate}`}>
          <div className="newsroom-story-copy">
            <div className="newsroom-story-category">
              <span>{categoryLabel(activeScene.story.category)}</span>
              <small>{activeScene.storyNumber} / {edition.stories.length}</small>
            </div>
            <h1>{activeScene.story.headline}</h1>
            <p>{activeScene.story.summary}</p>
            <div className="newsroom-source-line">
              <Building2 />
              <span>Source: <strong>{activeScene.story.sourceName}</strong></span>
              <ArrowUpRight />
            </div>
          </div>
          <StoryVisual story={activeScene.story} />
          <div className="newsroom-captions" aria-label="Closed captions">
            <strong>CC</strong><span>{activeScene.story.narration}</span>
          </div>
        </div>
      ) : null}

      {activeScene.type === "close" ? (
        <div className="newsroom-close">
          <span>That&apos;s the latest</span>
          <h1>Local news.<br />Built for here.</h1>
          <p>Updates twice daily from the NeuseCast Newsroom.</p>
          <strong>NeuseCast.com</strong>
        </div>
      ) : null}

      <div className="newsroom-lower-third">
        <strong>{activeScene.type === "story" ? categoryLabel(activeScene.story.category) : "LOCAL UPDATE"}</strong>
        <div><span>{ticker} &nbsp; • &nbsp; {ticker}</span></div>
      </div>
      <div className="newsroom-scene-progress"><span style={{ width: `${sceneProgress * 100}%` }} /></div>
    </div>
  );
}
