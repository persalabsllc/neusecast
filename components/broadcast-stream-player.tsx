"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Radio, RefreshCw, WifiOff } from "lucide-react";
import styles from "./broadcast-stream-player.module.css";

type PlaybackState = "connecting" | "buffering" | "ready" | "playing" | "offline";

const stateCopy: Record<PlaybackState, { title: string; detail: string }> = {
  connecting: {
    title: "Connecting to NeuseCast",
    detail: "Loading the live network feed…",
  },
  buffering: {
    title: "The live feed is reconnecting",
    detail: "Playback will resume automatically.",
  },
  ready: {
    title: "The live feed is ready",
    detail: "Press play to begin watching.",
  },
  playing: {
    title: "NeuseCast is live",
    detail: "The live network feed is playing.",
  },
  offline: {
    title: "The live feed is temporarily unavailable",
    detail: "The broadcast may be reconnecting. Please try again in a moment.",
  },
};

export function BroadcastStreamPlayer({ source }: { source: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const statusId = useId();
  const [playbackState, setPlaybackState] = useState<PlaybackState>("connecting");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let active = true;
    let hls: import("hls.js").default | null = null;
    let retryTimer: number | null = null;
    let networkRecoveryAttempts = 0;
    let mediaRecoveryAttempts = 0;

    const updateState = (nextState: PlaybackState) => {
      if (active) setPlaybackState(nextState);
    };

    const tryAutoplay = () => {
      void video.play().catch(() => {
        updateState("ready");
      });
    };

    const startPlayback = async () => {
      updateState("connecting");

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source;
        video.load();
        tryAutoplay();
        return;
      }

      try {
        const HlsModule = await import("hls.js");
        if (!active) return;

        const Hls = HlsModule.default;
        if (!Hls.isSupported()) {
          updateState("offline");
          return;
        }

        hls = new Hls({
          backBufferLength: 90,
          enableWorker: true,
          liveSyncDurationCount: 3,
          lowLatencyMode: true,
        });

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          networkRecoveryAttempts = 0;
          tryAutoplay();
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || !active || !hls) return;

          if (
            data.type === HlsModule.ErrorTypes.NETWORK_ERROR
            && networkRecoveryAttempts < 2
          ) {
            networkRecoveryAttempts += 1;
            updateState("buffering");
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              hls?.startLoad();
            }, networkRecoveryAttempts * 1_500);
            return;
          }

          if (
            data.type === HlsModule.ErrorTypes.MEDIA_ERROR
            && mediaRecoveryAttempts < 1
          ) {
            mediaRecoveryAttempts += 1;
            updateState("buffering");
            hls.recoverMediaError();
            return;
          }

          updateState("offline");
          hls.destroy();
          hls = null;
        });

        hls.attachMedia(video);
        hls.loadSource(source);
      } catch {
        updateState("offline");
      }
    };

    void startPlayback();

    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      hls?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [retryKey, source]);

  const copy = stateCopy[playbackState];
  const showOverlay = playbackState === "connecting"
    || playbackState === "buffering"
    || playbackState === "offline";

  return (
    <div className={styles.player} data-state={playbackState}>
      <video
        ref={videoRef}
        className={styles.video}
        aria-label="Live NeuseCast network video"
        aria-describedby={statusId}
        autoPlay
        controls
        muted
        playsInline
        preload="auto"
        onCanPlay={() => setPlaybackState((current) => (
          current === "offline" ? current : "ready"
        ))}
        onError={() => setPlaybackState("offline")}
        onPause={() => setPlaybackState((current) => (
          current === "offline" || current === "connecting" ? current : "ready"
        ))}
        onPlaying={() => setPlaybackState("playing")}
        onStalled={() => setPlaybackState((current) => (
          current === "offline" ? current : "buffering"
        ))}
        onWaiting={() => setPlaybackState((current) => (
          current === "offline" ? current : "buffering"
        ))}
      >
        Your browser does not support live video playback.
      </video>

      <div className={styles.liveBadge} aria-hidden={playbackState !== "playing"}>
        <span /> Live
      </div>

      {showOverlay ? (
        <div className={styles.overlay}>
          <div className={styles.statusIcon} aria-hidden="true">
            {playbackState === "offline" ? <WifiOff /> : <Radio />}
          </div>
          <strong>{copy.title}</strong>
          <p>{copy.detail}</p>
          {playbackState === "offline" ? (
            <button
              className={styles.retryButton}
              type="button"
              onClick={() => {
                setPlaybackState("connecting");
                setRetryKey((key) => key + 1);
              }}
            >
              <RefreshCw aria-hidden="true" /> Try again
            </button>
          ) : (
            <span className={styles.loader} aria-hidden="true" />
          )}
        </div>
      ) : null}

      <p
        id={statusId}
        className={styles.screenReaderStatus}
        role="status"
        aria-live="polite"
      >
        {copy.title}. {copy.detail}
      </p>
    </div>
  );
}
