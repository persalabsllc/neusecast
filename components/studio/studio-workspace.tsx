"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Archive,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cloud,
  Download,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  GripVertical,
  HardDriveUpload,
  Image as ImageIcon,
  Layers3,
  ListVideo,
  Loader2,
  MonitorPlay,
  Play,
  Plus,
  Radio,
  RadioTower,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SkipForward,
  Square,
  Trash2,
  UploadCloud,
  Video,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  addAssetToLogAction,
  archiveAssetAction,
  createDailyLogAction,
  createLiveSourceAction,
  createTickerAction,
  generateDailyLogAction,
  installDefaultGraphicsAction,
  publishLogAction,
  queuePlayoutCommandAction,
  removeLogItemAction,
  reorderLogAction,
  setGraphicLayerEnabledAction,
  setLiveSourceAutoFailoverAction,
  setTickerActiveAction,
  updateAssetAction,
  updateOutputAutomationAction,
  type StudioActionResult,
} from "@/app/studio/actions";
import type {
  StudioAsset,
  StudioDashboardData,
  StudioLiveSource,
  StudioProgramItem,
} from "@/lib/broadcast/studio-types";
import { isLiveSourceTakeable, isSupportedLiveProtocol } from "@/lib/broadcast/live-source-safety";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import styles from "./studio-workspace.module.css";

type StudioView = "on-air" | "library" | "logs" | "graphics" | "live" | "settings";

type StudioWorkspaceProps = {
  data: StudioDashboardData;
  view: StudioView;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type UploadEntry = {
  id: string;
  name: string;
  progress: number;
  status: "probing" | "uploading" | "complete" | "error";
  error?: string;
};

type MediaMetadata = {
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

const LOG_PAGE_SIZE = 200;

const categories = [
  "program",
  "news",
  "weather",
  "events",
  "commercial",
  "promo",
  "bumper",
  "psa",
  "filler",
  "emergency",
  "live_recording",
  "other",
] as const;

const categoryLabels: Record<string, string> = {
  program: "Program",
  news: "News",
  weather: "Weather",
  events: "Events",
  commercial: "Commercial",
  promo: "Promo",
  bumper: "Bumper",
  psa: "PSA",
  filler: "Filler",
  emergency: "Emergency",
  live_recording: "Live recording",
  other: "Other",
};

const viewTitles: Record<StudioView, { eyebrow: string; title: string; description: string }> = {
  "on-air": {
    eyebrow: "Master control",
    title: "On Air",
    description: "Monitor the channel return, cue the next event, and intervene safely.",
  },
  library: {
    eyebrow: "Media management",
    title: "Content library",
    description: "Ingest, inspect, categorize, and schedule every air-ready file.",
  },
  logs: {
    eyebrow: "Traffic & continuity",
    title: "Program logs",
    description: "Build an exact broadcast day, then publish it to automation.",
  },
  graphics: {
    eyebrow: "CasparCG layers",
    title: "Graphics & ticker",
    description: "Control permanent overlays and live information without touching video.",
  },
  live: {
    eyebrow: "Contribution feeds",
    title: "Live sources",
    description: "Register cameras, field encoders, studio returns, and local capture devices.",
  },
  settings: {
    eyebrow: "System readiness",
    title: "Playout settings",
    description: "Verify the control plane, CasparCG agent, and Cloudflare delivery path.",
  },
};

function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs || durationMs < 0) return "—";
  const totalSeconds = Math.round(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatClock(value: string | null | undefined, timeZone = "America/New_York") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDate(value: string, timeZone = "America/New_York") {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function currentDateInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatBytes(value: number | null) {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1_024 && unit < units.length - 1) {
    amount /= 1_024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

function displayCategory(value: string | null | undefined) {
  if (!value) return "Uncategorized";
  return categoryLabels[value] ?? value.replaceAll("_", " ");
}

function isSchedulableAsset(asset: StudioAsset) {
  return asset.status === "ready"
    && Boolean(asset.durationMs)
    && ["video", "image", "graphic"].includes(asset.kind);
}

function statusTone(status: string, healthy?: boolean) {
  if (healthy === true || ["ready", "on_air", "published", "active", "online", "running"].includes(status)) return "good";
  if (["failed", "error", "offline", "disabled", "cancelled"].includes(status)) return "bad";
  if (["processing", "starting", "uploading", "draft", "standby", "degraded", "connecting"].includes(status)) return "warn";
  return "neutral";
}

function StatusPill({ status, healthy }: { status: string; healthy?: boolean }) {
  const tone = statusTone(status, healthy);
  return (
    <span className={`${styles.statusPill} ${styles[`tone${tone}`]}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>{icon}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function HlsPlayer({ url, title }: { url: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      element.src = url;
      return () => {
        element.removeAttribute("src");
        element.load();
      };
    }
    let cancelled = false;
    let player: import("hls.js").default | null = null;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      player = new Hls({ liveSyncDurationCount: 3, enableWorker: true });
      player.loadSource(url);
      player.attachMedia(element);
    });
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [url]);

  return <video ref={videoRef} className={styles.videoElement} aria-label={title} autoPlay muted playsInline controls />;
}

type PreviewMedia = {
  name: string;
  url: string | null;
  thumbnailUrl: string | null;
  kind: StudioAsset["kind"] | null;
};

function Monitor({
  label,
  media,
  hlsUrl,
  compact = false,
  footer,
}: {
  label: string;
  media: PreviewMedia | null;
  hlsUrl?: string | null;
  compact?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className={`${styles.monitor} ${compact ? styles.monitorCompact : ""}`}>
      <div className={styles.monitorBar}>
        <span className={styles.monitorLabel}>
          <span className={hlsUrl ? styles.liveLamp : styles.previewLamp} aria-hidden="true" />
          {label}
        </span>
        <span className={styles.monitorFormat}>16:9 · 1080p</span>
      </div>
      <div className={styles.monitorViewport}>
        {hlsUrl ? <HlsPlayer url={hlsUrl} title={`${label} channel return`} /> : null}
        {!hlsUrl && media?.url && media.kind === "video" ? (
          <video className={styles.videoElement} src={media.url} poster={media.thumbnailUrl ?? undefined} muted playsInline controls />
        ) : null}
        {!hlsUrl && media?.url && media.kind === "audio" ? (
          <div className={styles.audioSlate}>
            <FileAudio size={compact ? 27 : 38} aria-hidden="true" />
            <span>{media.name}</span>
            <audio src={media.url} controls preload="metadata" />
          </div>
        ) : null}
        {!hlsUrl && media?.url && media.kind === "image" ? (
          <div
            className={styles.stillFrame}
            role="img"
            aria-label={media.name}
            style={{ backgroundImage: `url(${JSON.stringify(media.url)})` }}
          />
        ) : null}
        {!hlsUrl && (!media?.url || media.kind === "caption" || media.kind === "graphic") ? (
          <div className={styles.technicalSlate}>
            <RadioTower size={compact ? 26 : 40} strokeWidth={1.3} aria-hidden="true" />
            <strong>{media?.name ?? "No source selected"}</strong>
            <span>{media ? "Preview metadata only" : "Awaiting program media"}</span>
          </div>
        ) : null}
        <div className={styles.safeArea} aria-hidden="true" />
      </div>
      {footer ? <div className={styles.monitorFooter}>{footer}</div> : null}
    </section>
  );
}

function mediaFromProgram(item: StudioProgramItem | null): PreviewMedia | null {
  if (!item) return null;
  return {
    name: item.label,
    url: item.mediaUrl,
    thumbnailUrl: item.thumbnailUrl,
    kind: item.mediaKind,
  };
}

function mediaFromAsset(asset: StudioAsset | null): PreviewMedia | null {
  if (!asset) return null;
  return {
    name: asset.name,
    url: asset.sourceUrl,
    thumbnailUrl: asset.thumbnailUrl,
    kind: asset.kind,
  };
}

function sectionHeader(view: StudioView, right?: ReactNode) {
  const copy = viewTitles[view];
  return (
    <div className={styles.pageHeader}>
      <div>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      {right ? <div className={styles.pageHeaderActions}>{right}</div> : null}
    </div>
  );
}

function mimeForFile(file: File) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferred: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    vtt: "text/vtt",
    srt: "application/x-subrip",
    ttml: "application/ttml+xml",
  };
  return extension ? inferred[extension] ?? "" : "";
}

function probeFile(file: File, mimeType: string): Promise<MediaMetadata> {
  if (!mimeType.startsWith("video/") && !mimeType.startsWith("audio/") && !mimeType.startsWith("image/")) {
    return Promise.resolve({ durationMs: null, width: null, height: null });
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    const finish = (metadata: MediaMetadata) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(metadata);
    };
    const timeout = window.setTimeout(() => finish({ durationMs: null, width: null, height: null }), 10_000);
    if (mimeType.startsWith("image/")) {
      const image = new window.Image();
      image.onload = () => {
        window.clearTimeout(timeout);
        finish({ durationMs: null, width: image.naturalWidth || null, height: image.naturalHeight || null });
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        finish({ durationMs: null, width: null, height: null });
      };
      image.src = objectUrl;
      return;
    }
    const element = document.createElement(mimeType.startsWith("video/") ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const video = element instanceof HTMLVideoElement ? element : null;
      finish({
        durationMs: Number.isFinite(element.duration) ? Math.round(element.duration * 1_000) : null,
        width: video?.videoWidth || null,
        height: video?.videoHeight || null,
      });
    };
    element.onerror = () => {
      window.clearTimeout(timeout);
      finish({ durationMs: null, width: null, height: null });
    };
    element.src = objectUrl;
  });
}

function fileIcon(kind: StudioAsset["kind"], size = 18) {
  if (kind === "video") return <FileVideo size={size} aria-hidden="true" />;
  if (kind === "audio") return <FileAudio size={size} aria-hidden="true" />;
  if (kind === "image") return <FileImage size={size} aria-hidden="true" />;
  if (kind === "graphic") return <ImageIcon size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

export function StudioWorkspace({ data, view }: StudioWorkspaceProps) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function runAction(
    key: string,
    task: () => Promise<StudioActionResult>,
    confirmation?: string,
  ) {
    if (confirmation && !window.confirm(confirmation)) return null;
    setWorking(key);
    setNotice(null);
    try {
      const result = await task();
      setNotice({ tone: result.ok ? "success" : "error", message: result.message });
      if (result.ok) router.refresh();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The request could not be completed.";
      setNotice({ tone: "error", message });
      return null;
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className={styles.page}>
      {notice ? (
        <div className={`${styles.notice} ${notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}`} role="status" aria-live="polite">
          {notice.tone === "success" ? <CheckCircle2 size={17} aria-hidden="true" /> : <AlertTriangle size={17} aria-hidden="true" />}
          <span>{notice.message}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={16} /></button>
        </div>
      ) : null}

      {view === "on-air" ? <OnAirView data={data} working={working} runAction={runAction} /> : null}
      {view === "library" ? <LibraryView data={data} working={working} runAction={runAction} onNotice={setNotice} /> : null}
      {view === "logs" ? <LogsView key={`${data.selectedLog?.id ?? "none"}:${data.selectedLog?.revision ?? 0}`} data={data} working={working} runAction={runAction} /> : null}
      {view === "graphics" ? <GraphicsView data={data} working={working} runAction={runAction} /> : null}
      {view === "live" ? <LiveView data={data} working={working} runAction={runAction} /> : null}
      {view === "settings" ? <SettingsView key={`${data.output?.enabled ?? false}:${data.output?.alwaysOn ?? false}`} data={data} working={working} runAction={runAction} /> : null}
    </div>
  );
}

type ViewProps = {
  data: StudioDashboardData;
  working: string | null;
  runAction: (key: string, task: () => Promise<StudioActionResult>, confirmation?: string) => Promise<StudioActionResult | null>;
};

function OnAirView({ data, working, runAction }: ViewProps) {
  const router = useRouter();
  const [serverNow, setServerNow] = useState(() => new Date(data.serverTime).getTime());

  useEffect(() => {
    const serverOffset = new Date(data.serverTime).getTime() - Date.now();
    const clockTimer = window.setInterval(() => setServerNow(Date.now() + serverOffset), 1_000);
    const refreshTimer = window.setInterval(() => router.refresh(), 15_000);
    return () => {
      window.clearInterval(clockTimer);
      window.clearInterval(refreshTimer);
    };
  }, [data.serverTime, router]);

  const selectedLogCanAir = data.selectedLog && ["published", "on_air"].includes(data.selectedLog.status);
  const timedCurrentIndex = selectedLogCanAir
    ? data.programItems.findIndex((item) => {
        const starts = new Date(item.plannedStartAt).getTime();
        const ends = new Date(item.plannedEndAt).getTime();
        return starts <= serverNow && ends > serverNow;
      })
    : -1;
  const heartbeatIndex = data.agent?.healthy && data.agent.currentProgramItemId
    ? data.programItems.findIndex((item) => item.id === data.agent?.currentProgramItemId)
    : -1;
  const playingIndex = data.programItems.findIndex((item) => item.status === "playing");
  const currentIndex = heartbeatIndex >= 0 ? heartbeatIndex : playingIndex >= 0 ? playingIndex : timedCurrentIndex;
  const currentItem = currentIndex >= 0 ? data.programItems[currentIndex] : null;
  const nextIndex = currentIndex >= 0
    ? currentIndex + 1
    : data.programItems.findIndex((item) => new Date(item.plannedStartAt).getTime() >= serverNow);
  const nextItem = nextIndex >= 0 ? data.programItems[nextIndex] : data.programItems[0] ?? null;
  const rundownAnchor = currentIndex >= 0 ? currentIndex : Math.max(0, nextIndex);
  const [previewId, setPreviewId] = useState(nextItem?.id ?? currentItem?.id ?? null);
  const previewItem = data.programItems.find((item) => item.id === previewId) ?? nextItem ?? currentItem;
  const timeZone = data.output?.timeZone;
  const heartbeatAge = data.agent?.lastHeartbeatAt
    ? Math.max(0, Math.round((serverNow - new Date(data.agent.lastHeartbeatAt).getTime()) / 1_000))
    : null;
  const agentHealthy = Boolean(
    heartbeatAge !== null
    && heartbeatAge < 75
    && data.agent
    && ["ready", "starting"].includes(data.agent.status),
  );

  return (
    <>
      {sectionHeader("on-air", (
        <div className={styles.headerStatusGroup}>
          <StatusPill status={data.output?.status ?? "not configured"} />
          <span className={styles.serverClock}><Clock3 size={14} /> {formatClock(new Date(serverNow).toISOString(), timeZone)}</span>
        </div>
      ))}

      <div className={styles.onAirGrid}>
        <Monitor
          label="PROGRAM"
          media={mediaFromProgram(currentItem)}
          hlsUrl={data.configuration.publicHlsUrl}
          footer={currentItem ? (
            <><span>Now</span><strong>{currentItem.label}</strong><code>{formatDuration(currentItem.durationMs)}</code></>
          ) : <span>No event is currently resolved from the selected log.</span>}
        />
        <div className={styles.previewStack}>
          <Monitor
            compact
            label="PREVIEW"
            media={mediaFromProgram(previewItem ?? null)}
            footer={previewItem ? (
              <><span>Cued</span><strong>{previewItem.label}</strong><code>{formatClock(previewItem.plannedStartAt, timeZone)}</code></>
            ) : <span>Select a rundown event to preview it.</span>}
          />
          <div className={styles.transportPanel}>
            <div className={styles.transportPrimary}>
              <button
                className={styles.takeButton}
                type="button"
                disabled={!previewItem || Boolean(working)}
                onClick={() => previewItem && runAction(
                  "take",
                  () => queuePlayoutCommandAction({ commandType: "take_item", programItemId: previewItem.id }),
                  `Take “${previewItem.label}” to air now? This interrupts automation.`,
                )}
              >
                {working === "take" ? <Loader2 className={styles.spin} size={17} /> : <Play size={17} fill="currentColor" />}
                Take
              </button>
              <button
                className={styles.transportButton}
                type="button"
                disabled={!currentItem || Boolean(working)}
                onClick={() => runAction("skip", () => queuePlayoutCommandAction({ commandType: "skip" }), "Skip the current event and advance automation?")}
              >
                <SkipForward size={17} /> Skip
              </button>
              <button
                className={styles.transportButton}
                type="button"
                disabled={Boolean(working)}
                onClick={() => runAction("resume", () => queuePlayoutCommandAction({ commandType: "resume_automation" }))}
              >
                <RefreshCw size={16} /> Resume
              </button>
            </div>
            <div className={styles.transportSecondary}>
              <button
                className={styles.textButton}
                type="button"
                disabled={Boolean(working) || !data.output}
                onClick={() => runAction("start", () => queuePlayoutCommandAction({ commandType: "start_output" }), "Start the main output and allow the agent to begin streaming?")}
              ><Radio size={14} /> Start output</button>
              <button
                className={`${styles.textButton} ${styles.dangerText}`}
                type="button"
                disabled={Boolean(working) || !data.output}
                onClick={() => runAction("stop", () => queuePlayoutCommandAction({ commandType: "stop_output" }), "Stop the main output? Viewers may lose the channel feed.")}
              ><Square size={13} fill="currentColor" /> Stop output</button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.operationsGrid}>
        <section className={`${styles.panel} ${styles.rundownPanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.panelKicker}>Now / next</span>
              <h3>{data.selectedLog?.name ?? "No active program log"}</h3>
            </div>
            {data.selectedLog ? <Link className={styles.inlineLink} href={`/studio/logs?log=${data.selectedLog.id}`}>Open log <ChevronRight size={14} /></Link> : null}
          </div>
          {data.programItems.length ? (
            <div className={styles.rundownList}>
              {data.programItems.slice(Math.max(0, rundownAnchor - 1), rundownAnchor + 7).map((item) => {
                const isCurrent = item.id === currentItem?.id;
                const isSelected = item.id === previewItem?.id;
                return (
                  <button
                    type="button"
                    className={`${styles.rundownRow} ${isCurrent ? styles.rundownCurrent : ""} ${isSelected ? styles.rundownSelected : ""}`}
                    key={item.id}
                    onClick={() => setPreviewId(item.id)}
                  >
                    <span className={styles.rundownTime}>{formatClock(item.plannedStartAt, timeZone)}</span>
                    <span className={styles.rundownType}>{isCurrent ? <span className={styles.onAirTag}>ON AIR</span> : displayCategory(item.category)}</span>
                    <span className={styles.rundownTitle}>{item.label}</span>
                    <span className={styles.rundownDuration}>{formatDuration(item.durationMs)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<ListVideo size={24} />} title="No rundown loaded">Create and publish a daily log to give automation a running order.</EmptyState>
          )}
        </section>

        <aside className={styles.healthColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><span className={styles.panelKicker}>Playout node</span><h3>Agent health</h3></div>
              <Activity size={18} className={agentHealthy ? styles.goodIcon : styles.mutedIcon} />
            </div>
            <div className={styles.healthRows}>
              <div><span>Agent</span><strong>{data.agent?.name ?? "Not assigned"}</strong></div>
              <div><span>State</span><StatusPill status={data.agent?.status ?? "offline"} healthy={agentHealthy} /></div>
              <div><span>Heartbeat</span><strong>{heartbeatAge === null ? "Never" : `${heartbeatAge}s ago`}</strong></div>
              <div><span>Host</span><strong>{data.agent?.hostname ?? "—"}</strong></div>
            </div>
            {data.agent?.lastHeartbeatAt && !agentHealthy ? <div className={styles.inlineWarning}><AlertTriangle size={15} /> Agent heartbeat is stale.</div> : null}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><span className={styles.panelKicker}>Signal path</span><h3>Delivery</h3></div>
              <Wifi size={18} className={data.configuration.publicHlsReady ? styles.goodIcon : styles.mutedIcon} />
            </div>
            <div className={styles.signalPath}>
              <span className={data.output?.enabled ? styles.pathReady : ""}>CasparCG</span>
              <ChevronRight size={14} />
              <span className={data.configuration.cloudflareIngestReady ? styles.pathReady : ""}>Cloudflare</span>
              <ChevronRight size={14} />
              <span className={data.configuration.publicHlsReady ? styles.pathReady : ""}>Website</span>
            </div>
            {data.output?.lastError ? <div className={styles.inlineWarning}><AlertTriangle size={15} /> {data.output.lastError}</div> : null}
          </section>
        </aside>
      </div>
    </>
  );
}

function LibraryView({ data, working, runAction, onNotice }: ViewProps & { onNotice: (notice: Notice | null) => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [uploadCategory, setUploadCategory] = useState<(typeof categories)[number]>("program");
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(data.assets[0]?.id ?? null);
  const selectedAsset = data.assets.find((asset) => asset.id === selectedId) ?? null;
  const selectedLog = data.selectedLog;
  const canSchedule = selectedLog?.status === "draft";

  const filteredAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.assets.filter((asset) => {
      const categoryMatch = category === "all" || asset.category === category;
      const searchMatch = !normalized || [asset.name, asset.originalFileName, asset.category, ...asset.tags]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized));
      return categoryMatch && searchMatch;
    });
  }, [category, data.assets, query]);

  async function uploadFiles(files: File[]) {
    setDraggingFiles(false);
    const accepted = files.filter((file) => mimeForFile(file));
    if (!accepted.length) {
      onNotice({ tone: "error", message: "Choose a supported video, audio, image, or caption file." });
      return;
    }
    const newEntries = accepted.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      name: file.name,
      progress: 0,
      status: "probing" as const,
    }));
    setUploads((current) => [...newEntries, ...current].slice(0, 12));

    let successfulUploads = 0;
    for (let index = 0; index < accepted.length; index += 1) {
      const file = accepted[index];
      const entry = newEntries[index];
      try {
        const mimeType = mimeForFile(file);
        const normalizedFile = file.type ? file : new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
        const metadata = await probeFile(normalizedFile, mimeType);
        setUploads((current) => current.map((item) => item.id === entry.id ? { ...item, status: "uploading" } : item));
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+/, "").slice(-180) || "media";
        await upload(`broadcast/${safeName}`, normalizedFile, {
          access: "public",
          handleUploadUrl: "/api/broadcast/library/upload",
          multipart: normalizedFile.size > 25_000_000,
          clientPayload: JSON.stringify({
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 240) || file.name,
            category: uploadCategory,
            originalFileName: file.name,
            mimeType,
            fileSizeBytes: file.size,
            ...metadata,
          }),
          onUploadProgress: ({ percentage }) => {
            setUploads((current) => current.map((item) => item.id === entry.id ? { ...item, progress: Math.round(percentage) } : item));
          },
        });
        setUploads((current) => current.map((item) => item.id === entry.id ? { ...item, progress: 100, status: "complete" } : item));
        successfulUploads += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed.";
        setUploads((current) => current.map((item) => item.id === entry.id ? { ...item, status: "error", error: message } : item));
      }
    }
    if (successfulUploads) {
      onNotice({
        tone: successfulUploads === accepted.length ? "success" : "error",
        message: successfulUploads === accepted.length
          ? "Upload finished. Video and audio will become air-ready after the playout agent verifies them."
          : `${successfulUploads} of ${accepted.length} files uploaded. Review the failed queue items.`,
      });
      router.refresh();
    } else {
      onNotice({ tone: "error", message: "No files were uploaded. Review the failed queue items and try again." });
    }
  }

  function acceptDroppedFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  async function addAsset(assetId: string) {
    if (!selectedLog) return;
    await runAction(
      `add-${assetId}`,
      () => addAssetToLogAction({ logId: selectedLog.id, assetId, expectedRevision: selectedLog.revision }),
    );
  }

  return (
    <>
      {sectionHeader("library", (
        <div className={styles.pageHeaderActions}>
          <a className={styles.secondaryButton} href="/api/broadcast/library/export?format=csv"><Download size={15} /> Export catalog</a>
          <button className={styles.primaryButton} type="button" onClick={() => inputRef.current?.click()}><UploadCloud size={16} /> Upload content</button>
        </div>
      ))}

      <div className={styles.libraryLayout}>
        <div className={styles.libraryMain}>
          <section
            className={`${styles.uploadZone} ${draggingFiles ? styles.uploadZoneActive : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDraggingFiles(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingFiles(false); }}
            onDrop={acceptDroppedFiles}
          >
            <input
              ref={inputRef}
              className={styles.srOnly}
              type="file"
              multiple
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,audio/mpeg,audio/mp4,audio/aac,audio/wav,image/jpeg,image/png,image/webp,text/vtt,.srt,.ttml"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void uploadFiles(files);
              }}
            />
            <span className={styles.uploadIcon}><HardDriveUpload size={25} /></span>
            <div className={styles.uploadCopy}>
              <strong>Drop broadcast files to ingest</strong>
              <span>MP4, MOV, WebM, MKV, audio, stills, VTT, SRT, or TTML · up to 2 GB each</span>
            </div>
            <label className={styles.compactField}>
              <span>Upload category</span>
              <select value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value as (typeof categories)[number])}>
                {categories.map((item) => <option key={item} value={item}>{displayCategory(item)}</option>)}
              </select>
            </label>
            <button className={styles.secondaryButton} type="button" onClick={() => inputRef.current?.click()}>Choose files</button>
          </section>

          {uploads.length ? (
            <div className={styles.uploadQueue} aria-label="Upload queue">
              {uploads.map((entry) => (
                <div className={styles.uploadEntry} key={entry.id}>
                  <span className={styles.uploadState}>
                    {entry.status === "complete" ? <Check size={15} /> : entry.status === "error" ? <AlertTriangle size={15} /> : <Loader2 className={styles.spin} size={15} />}
                  </span>
                  <span className={styles.uploadName}>{entry.name}</span>
                  <div className={styles.progressTrack}><span style={{ width: `${entry.progress}%` }} /></div>
                  <span className={styles.uploadPercent}>{entry.status === "error" ? "Failed" : entry.status === "probing" ? "Inspecting" : `${entry.progress}%`}</span>
                  {entry.error ? <span className={styles.uploadError}>{entry.error}</span> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.libraryToolbar}>
            <label className={styles.searchField}>
              <Search size={16} aria-hidden="true" />
              <span className={styles.srOnly}>Search content library</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, files, tags…" />
            </label>
            <label className={styles.selectField}>
              <span className={styles.srOnly}>Filter by category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map((item) => <option key={item} value={item}>{displayCategory(item)}</option>)}
              </select>
            </label>
            <span className={styles.resultCount}>{filteredAssets.length} of {data.assets.length} assets</span>
          </div>

          {filteredAssets.length ? (
            <div className={styles.assetGrid}>
              {filteredAssets.map((asset) => (
                <article
                  className={`${styles.assetCard} ${asset.id === selectedId ? styles.assetSelected : ""}`}
                  key={asset.id}
                  draggable={isSchedulableAsset(asset) && Boolean(canSchedule)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("text/neusecast-asset", asset.id);
                    event.dataTransfer.setData("text/plain", asset.id);
                  }}
                >
                  <button className={styles.assetPreview} type="button" onClick={() => setSelectedId(asset.id)} aria-label={`Inspect ${asset.name}`}>
                    {asset.thumbnailUrl || (asset.kind === "image" && asset.sourceUrl) ? (
                      <span className={styles.assetArtwork} style={{ backgroundImage: `url(${JSON.stringify(asset.thumbnailUrl ?? asset.sourceUrl)})` }} />
                    ) : (
                      <span className={styles.assetPlaceholder}>{fileIcon(asset.kind, 27)}</span>
                    )}
                    <span className={styles.assetDuration}>{formatDuration(asset.durationMs)}</span>
                    <span className={styles.assetKind}>{asset.kind}</span>
                  </button>
                  <div className={styles.assetBody}>
                    <div className={styles.assetTitleRow}>
                      <button type="button" onClick={() => setSelectedId(asset.id)}><strong>{asset.name}</strong></button>
                      <StatusPill status={asset.status} />
                    </div>
                    <div className={styles.assetMeta}><span>{displayCategory(asset.category)}</span><span>{formatBytes(asset.fileSizeBytes)}</span></div>
                    <div className={styles.assetActions}>
                      <button
                        type="button"
                        disabled={!canSchedule || !isSchedulableAsset(asset) || Boolean(working)}
                        title={!canSchedule ? "Select a draft log before scheduling" : !isSchedulableAsset(asset) ? "Only air-ready video, image, and graphic assets can be scheduled" : undefined}
                        onClick={() => void addAsset(asset.id)}
                      ><Plus size={14} /> Add to log</button>
                      {asset.sourceUrl ? <a href={asset.sourceUrl} download target="_blank" rel="noreferrer"><Download size={14} /> Original</a> : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Search size={24} />} title="No matching media">Clear the filters or upload a new broadcast file.</EmptyState>
          )}
        </div>

        <aside className={styles.libraryAside}>
          <section
            className={`${styles.panel} ${styles.logDropPanel}`}
            onDragOver={(event) => { if (canSchedule) event.preventDefault(); }}
            onDrop={(event) => {
              event.preventDefault();
              const assetId = event.dataTransfer.getData("text/neusecast-asset") || event.dataTransfer.getData("text/plain");
              if (assetId && canSchedule) void addAsset(assetId);
            }}
          >
            <div className={styles.panelHeader}>
              <div><span className={styles.panelKicker}>Schedule target</span><h3>{selectedLog?.name ?? "No log selected"}</h3></div>
              <ListVideo size={18} />
            </div>
            <p className={styles.panelCopy}>{canSchedule ? "Drag any ready asset here to append it to this draft." : "Open or create a draft log before scheduling library content."}</p>
            {selectedLog ? <div className={styles.logTargetMeta}><StatusPill status={selectedLog.status} /><span>{selectedLog.itemCount} events</span></div> : null}
            <Link className={styles.fullButton} href={selectedLog ? `/studio/logs?log=${selectedLog.id}` : "/studio/logs"}>Open program logs <ChevronRight size={14} /></Link>
          </section>
          <AssetInspector key={selectedAsset?.id ?? "none"} asset={selectedAsset} working={working} runAction={runAction} />
        </aside>
      </div>
    </>
  );
}

function AssetInspector({ asset, working, runAction }: { asset: StudioAsset | null } & Pick<ViewProps, "working" | "runAction">) {
  const [name, setName] = useState(asset?.name ?? "");
  const [category, setCategory] = useState(asset?.category ?? "other");
  const [duration, setDuration] = useState(asset?.durationMs ? String(asset.durationMs / 1_000) : "");

  if (!asset) {
    return <section className={styles.panel}><EmptyState icon={<FileVideo size={23} />} title="No asset selected">Choose an item to inspect its technical details.</EmptyState></section>;
  }
  const canEditDuration = asset.kind === "image" || asset.kind === "graphic";

  return (
    <section className={`${styles.panel} ${styles.inspectorPanel}`}>
      <div className={styles.panelHeader}>
        <div><span className={styles.panelKicker}>Asset inspector</span><h3>{asset.name}</h3></div>
        {fileIcon(asset.kind)}
      </div>
      <Monitor compact label="SOURCE" media={mediaFromAsset(asset)} />
      <form
        className={styles.inspectorForm}
        onSubmit={(event) => {
          event.preventDefault();
          void runAction(`edit-${asset.id}`, () => updateAssetAction({
            assetId: asset.id,
            name,
            category,
            durationSeconds: duration ? Number(duration) : null,
          }));
        }}
      >
        <label className={styles.field}><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={240} /></label>
        <div className={styles.twoFields}>
          <label className={styles.field}><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{displayCategory(item)}</option>)}</select></label>
          <label className={styles.field}><span>{canEditDuration ? "On-air duration (sec)" : "Verified duration (sec)"}</span><input type="number" min="0.1" max="86400" step="0.1" value={duration} disabled={!canEditDuration} title={canEditDuration ? "Set how long this still remains on air." : "Timed-media duration comes from playout ingest validation."} onChange={(event) => setDuration(event.target.value)} /></label>
        </div>
        <dl className={styles.techList}>
          <div><dt>Format</dt><dd>{asset.mimeType ?? asset.kind}</dd></div>
          <div><dt>Frame</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</dd></div>
          <div><dt>File</dt><dd title={asset.originalFileName ?? undefined}>{asset.originalFileName ?? "—"}</dd></div>
          <div><dt>Size</dt><dd>{formatBytes(asset.fileSizeBytes)}</dd></div>
        </dl>
        <div className={styles.formActions}>
          <button className={styles.primaryButton} type="submit" disabled={Boolean(working)}>{working === `edit-${asset.id}` ? <Loader2 className={styles.spin} size={15} /> : <Save size={15} />} Save metadata</button>
          {asset.sourceUrl ? <a className={styles.secondaryButton} href={asset.sourceUrl} target="_blank" rel="noreferrer"><Download size={15} /> Download file</a> : null}
          <button className={styles.dangerButton} type="button" disabled={Boolean(working)} onClick={() => void runAction(`archive-${asset.id}`, () => archiveAssetAction(asset.id), `Archive “${asset.name}”? Existing published logs will keep their pinned copy.`)}><Archive size={15} /> Archive</button>
        </div>
      </form>
    </section>
  );
}

function LogsView({ data, working, runAction }: ViewProps) {
  const router = useRouter();
  const today = currentDateInTimeZone(data.output?.timeZone ?? "America/New_York");
  const [serviceDate, setServiceDate] = useState(today);
  const [manualAssetId, setManualAssetId] = useState("");
  const [orderedItems, setOrderedItems] = useState(data.programItems);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [logPage, setLogPage] = useState(0);
  const selectedLog = data.selectedLog;
  const isDraft = selectedLog?.status === "draft";
  const timeZone = data.output?.timeZone;
  const readyAssets = data.assets.filter(isSchedulableAsset);

  function selectLog(logId: string) {
    router.push(`/studio/logs?log=${encodeURIComponent(logId)}`);
  }

  function moveDraggedItem(targetId: string) {
    if (!draggedId || draggedId === targetId || !isDraft) return;
    setOrderedItems((current) => {
      const from = current.findIndex((item) => item.id === draggedId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setOrderDirty(true);
    setDraggedId(null);
  }

  const scheduledDuration = orderedItems.reduce((total, item) => total + item.durationMs, 0);
  const pageCount = Math.max(1, Math.ceil(orderedItems.length / LOG_PAGE_SIZE));
  const pageStart = Math.min(logPage * LOG_PAGE_SIZE, Math.max(0, orderedItems.length - 1));
  const visibleItems = orderedItems.slice(pageStart, pageStart + LOG_PAGE_SIZE);

  return (
    <>
      {sectionHeader("logs", (
        <form
          className={styles.createLogForm}
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await runAction("create-log", () => createDailyLogAction(serviceDate));
            if (result?.ok && result.id) router.push(`/studio/logs?log=${result.id}`);
          }}
        >
          <label><span className={styles.srOnly}>Broadcast date</span><input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} required /></label>
          <button className={styles.primaryButton} type="submit" disabled={Boolean(working)}>{working === "create-log" ? <Loader2 className={styles.spin} size={15} /> : <Plus size={15} />} New broadcast day</button>
        </form>
      ))}

      <div className={styles.logsLayout}>
        <aside className={styles.logBrowser}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Available logs</span><h3>Broadcast days</h3></div><CalendarDays size={18} /></div>
          {data.logs.length ? (
            <div className={styles.logList}>
              {data.logs.map((log) => (
                <button className={`${styles.logCard} ${selectedLog?.id === log.id ? styles.logCardActive : ""}`} type="button" key={log.id} onClick={() => selectLog(log.id)}>
                  <span className={styles.logDate}>{log.serviceDate}</span>
                  <strong>{log.name}</strong>
                  <span className={styles.logCardMeta}><StatusPill status={log.status} /><span>{log.itemCount} events</span><span>r{log.revision}</span></span>
                </button>
              ))}
            </div>
          ) : <EmptyState icon={<CalendarDays size={23} />} title="No broadcast days">Create the first daily log to begin scheduling.</EmptyState>}
        </aside>

        <section className={`${styles.panel} ${styles.logEditor}`}>
          {selectedLog ? (
            <>
              <div className={styles.logEditorHeader}>
                <div>
                  <span className={styles.panelKicker}>{formatDate(selectedLog.startsAt, timeZone)} · Revision {selectedLog.revision}</span>
                  <h3>{selectedLog.name}</h3>
                  <div className={styles.logSummary}><StatusPill status={selectedLog.status} /><span>{orderedItems.length.toLocaleString()} events</span><span>{formatDuration(scheduledDuration)} scheduled</span></div>
                </div>
                <div className={styles.logActions}>
                  <button className={styles.secondaryButton} type="button" disabled={!isDraft || Boolean(working)} onClick={() => void runAction("generate", () => generateDailyLogAction(selectedLog.id, selectedLog.revision), "Replace this draft with a newly generated 24-hour schedule?")}><Zap size={15} /> Auto-generate</button>
                  <button className={styles.secondaryButton} type="button" disabled={!isDraft || !orderDirty || Boolean(working)} onClick={() => void runAction("reorder", () => reorderLogAction({ logId: selectedLog.id, orderedItemIds: orderedItems.map((item) => item.id), expectedRevision: selectedLog.revision }))}>{working === "reorder" ? <Loader2 className={styles.spin} size={15} /> : <Save size={15} />} Save order</button>
                  <button className={styles.publishButton} type="button" disabled={!isDraft || !orderedItems.length || Boolean(working)} onClick={() => void runAction("publish", () => publishLogAction(selectedLog.id, selectedLog.revision), `Publish “${selectedLog.name}” to the playout agent? Further edits will require a new draft revision.`)}><RadioTower size={15} /> Publish log</button>
                </div>
              </div>

              <form
                className={styles.manualAdd}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!manualAssetId || !isDraft) return;
                  void runAction("manual-add", () => addAssetToLogAction({ logId: selectedLog.id, assetId: manualAssetId, expectedRevision: selectedLog.revision }));
                }}
              >
                <label><span>Add library item</span><select value={manualAssetId} onChange={(event) => setManualAssetId(event.target.value)} disabled={!isDraft}><option value="">Choose air-ready media…</option>{readyAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {formatDuration(asset.durationMs)}</option>)}</select></label>
                <button className={styles.secondaryButton} type="submit" disabled={!isDraft || !manualAssetId || Boolean(working)}><Plus size={15} /> Add to end</button>
              </form>

              <div className={styles.logTableHeader} aria-hidden="true"><span>Pos</span><span>Start</span><span>Event</span><span>Type</span><span>Duration</span><span>Status</span><span /></div>
              <div className={styles.logRows}>
                {visibleItems.map((item, pageIndex) => {
                  const index = pageStart + pageIndex;
                  return (
                  <div
                    className={`${styles.logRow} ${draggedId === item.id ? styles.logRowDragging : ""}`}
                    key={item.id}
                    draggable={Boolean(isDraft)}
                    onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={(event) => { if (isDraft) event.preventDefault(); }}
                    onDrop={(event) => { event.preventDefault(); moveDraggedItem(item.id); }}
                  >
                    <span className={styles.logPosition}><GripVertical size={15} /><code>{String(index + 1).padStart(3, "0")}</code></span>
                    <code className={styles.logTime}>{formatClock(item.plannedStartAt, timeZone)}</code>
                    <span className={styles.logEvent}><strong>{item.label}</strong><small>{item.sourceKind}{item.hardStart ? " · hard start" : ""}</small></span>
                    <span className={styles.logCategory}>{displayCategory(item.category)}</span>
                    <code className={styles.logDuration}>{formatDuration(item.durationMs)}</code>
                    <StatusPill status={item.status} />
                    <button className={styles.rowDelete} type="button" aria-label={`Remove ${item.label}`} disabled={!isDraft || Boolean(working)} onClick={() => void runAction(`delete-${item.id}`, () => removeLogItemAction({ logId: selectedLog.id, itemId: item.id, expectedRevision: selectedLog.revision }), `Remove “${item.label}” from this draft?`)}><Trash2 size={15} /></button>
                  </div>
                  );
                })}
              </div>
              {orderedItems.length > LOG_PAGE_SIZE ? (
                <nav className={styles.logPagination} aria-label="Program log pages">
                  <button className={styles.secondaryButton} type="button" disabled={logPage === 0} onClick={() => setLogPage((page) => Math.max(0, page - 1))}>Previous</button>
                  <span>Events {pageStart + 1}–{Math.min(pageStart + visibleItems.length, orderedItems.length)} of {orderedItems.length.toLocaleString()} · Page {logPage + 1} of {pageCount}</span>
                  <button className={styles.secondaryButton} type="button" disabled={logPage >= pageCount - 1} onClick={() => setLogPage((page) => Math.min(pageCount - 1, page + 1))}>Next</button>
                </nav>
              ) : null}
              {!orderedItems.length ? <EmptyState icon={<ListVideo size={24} />} title="This log is empty">Auto-generate a rotation or add air-ready library items manually.</EmptyState> : null}
            </>
          ) : <EmptyState icon={<CalendarDays size={25} />} title="Choose a broadcast day">Select an existing log or create a new one.</EmptyState>}
        </section>
      </div>
    </>
  );
}

function GraphicsView({ data, working, runAction }: ViewProps) {
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("routine");
  const [expiresAt, setExpiresAt] = useState("");
  const activeTicker = data.tickerItems.filter((item) => item.status === "active");
  const automatedTicker = data.tickerItems.filter((item) => item.automated);

  return (
    <>
      {sectionHeader("graphics", (
        <div className={styles.pageHeaderActions}>
          <button className={styles.secondaryButton} type="button" disabled={Boolean(working)} onClick={() => void runAction("refresh-graphics", () => queuePlayoutCommandAction({ commandType: "refresh_graphics" }))}><RefreshCw size={15} /> Refresh engine</button>
          <button className={styles.primaryButton} type="button" disabled={Boolean(working)} onClick={() => void runAction("install-graphics", installDefaultGraphicsAction)}><Layers3 size={15} /> Install defaults</button>
        </div>
      ))}

      <div className={styles.graphicsGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Persistent composition</span><h3>CasparCG layers</h3></div><span className={styles.layerCount}>{data.graphicLayers.length} installed</span></div>
          <div className={styles.layerStack}>
            {data.graphicLayers.map((layer) => (
              <div className={styles.layerRow} key={layer.id}>
                <span className={styles.layerNumber}>{layer.layer}</span>
                <span className={styles.layerIcon}>{layer.kind === "ticker" ? <ListVideo size={17} /> : layer.kind === "weather" ? <Cloud size={17} /> : layer.kind === "clock" ? <Clock3 size={17} /> : <Layers3 size={17} />}</span>
                <span className={styles.layerCopy}><strong>{layer.name}</strong><small>{layer.templateKey} · {layer.persistent ? "persistent" : "event"}</small></span>
                <label className={styles.switch}>
                  <span className={styles.srOnly}>{layer.enabled ? "Disable" : "Enable"} {layer.name}</span>
                  <input type="checkbox" checked={layer.enabled} disabled={Boolean(working)} onChange={(event) => void runAction(`layer-${layer.id}`, () => setGraphicLayerEnabledAction(layer.id, event.target.checked))} />
                  <span aria-hidden="true" />
                </label>
              </div>
            ))}
          </div>
          {!data.graphicLayers.length ? <EmptyState icon={<Layers3 size={24} />} title="No graphics installed">Install the default logo, Eastern time, weather, and ticker layer set.</EmptyState> : null}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Manual crawl</span><h3>Ticker composer</h3></div><ListVideo size={18} /></div>
          <form
            className={styles.tickerForm}
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const result = await runAction("create-ticker", () => createTickerAction({ message, priority, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }));
              if (result?.ok) { setMessage(""); setExpiresAt(""); }
            }}
          >
            <label className={styles.field}><span>Message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={600} rows={4} required placeholder="Type an approved headline, closure, weather alert, or community update…" /><small>{message.length}/600</small></label>
            <div className={styles.twoFields}>
              <label className={styles.field}><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="routine">Routine</option><option value="important">Important</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
              <label className={styles.field}><span>Expire at (optional)</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
            </div>
            <button className={styles.publishButton} type="submit" disabled={!message.trim() || Boolean(working)}>{working === "create-ticker" ? <Loader2 className={styles.spin} size={15} /> : <Radio size={15} />} Put message on air</button>
          </form>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Current feed</span><h3>Active & automated ticker items</h3></div><span className={styles.layerCount}>{activeTicker.length} active · {automatedTicker.length} automatic</span></div>
        {data.tickerItems.length ? (
          <div className={styles.tickerList}>
            {data.tickerItems.map((item) => (
              <article className={`${styles.tickerRow} ${styles[`priority${item.priority}`]}`} key={item.id}>
                <span className={styles.tickerPriority}>{item.priority}</span>
                <div className={styles.tickerCopy}><strong>{item.message}</strong><small>{item.automated ? `Automatic${item.sourceName ? ` · ${item.sourceName}` : ""}` : "Manual studio entry"}{item.expiresAt ? ` · expires ${formatDate(item.expiresAt)}` : ""}</small></div>
                <StatusPill status={item.status} />
                <button className={item.status === "active" ? styles.dangerButton : styles.secondaryButton} type="button" disabled={Boolean(working)} onClick={() => void runAction(`ticker-${item.id}`, () => setTickerActiveAction(item.id, item.status !== "active"))}>{item.status === "active" ? <><X size={14} /> Remove</> : <><Play size={14} /> Activate</>}</button>
              </article>
            ))}
          </div>
        ) : <EmptyState icon={<ListVideo size={24} />} title="Ticker queue is clear">Compose a manual message or connect the automated news and weather sources.</EmptyState>}
      </section>
    </>
  );
}

function safeEndpointLabel(source: StudioLiveSource) {
  if (!source.endpointUrl) return "Local device / agent source";
  try {
    const url = new URL(source.endpointUrl);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : "/…"}`;
  } catch {
    return source.endpointUrl.length > 45 ? `${source.endpointUrl.slice(0, 42)}…` : source.endpointUrl;
  }
}

function canTakeLiveSource(source: StudioLiveSource | null) {
  return Boolean(source && isLiveSourceTakeable(source));
}

function LiveView({ data, working, runAction }: ViewProps) {
  const router = useRouter();
  const [previewId, setPreviewId] = useState<string | null>(data.liveSources[0]?.id ?? null);
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState("rtmps");
  const [endpoint, setEndpoint] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [activeAutoFailover, setActiveAutoFailover] = useState(false);
  const preview = data.liveSources.find((source) => source.id === previewId) ?? null;
  const previewSupported = preview ? isSupportedLiveProtocol(preview.protocol) : false;
  const outputCanTakeLive = data.output?.enabled === true;
  const previewIsLive = preview?.status === "live";
  const previewCanTake = outputCanTakeLive && !previewIsLive && canTakeLiveSource(preview);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [router]);

  return (
    <>
      {sectionHeader("live", <StatusPill status={`${data.liveSources.filter((source) => source.status === "ready").length} ready`} />)}
      <div className={styles.liveTopGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Source inspector</span><h3>{preview?.name ?? "No source selected"}</h3></div>{preview ? <StatusPill status={previewSupported ? preview.status : "unsupported"} /> : null}</div>
          <div className={styles.livePreview}>
            <Video size={38} strokeWidth={1.25} />
            <strong>{preview?.name ?? "Select a contribution feed"}</strong>
            <span>{preview ? `${preview.protocol.toUpperCase()} · ${safeEndpointLabel(preview)} · Configuration view only; confidence video is monitored on the playout host.` : "Select a source to inspect its routing configuration before a confirmed take."}</span>
          </div>
          <div className={styles.liveTransport}>
            <button className={styles.takeButton} type="button" disabled={!previewCanTake || Boolean(working)} title={preview && !previewCanTake ? outputCanTakeLive ? "The source must be enabled and report ready before Take is available." : "Start the main output before taking a source live." : undefined} onClick={() => preview && void runAction("take-live", () => queuePlayoutCommandAction({ commandType: "take_live", liveSourceId: preview.id }), `Take “${preview.name}” live to program? This interrupts scheduled content.`)}><Play size={16} fill="currentColor" /> Take live</button>
            <button className={styles.dangerButton} type="button" disabled={!previewIsLive || Boolean(working)} title={preview && !previewIsLive ? "Only the source currently on program can be removed." : undefined} onClick={() => preview && void runAction("remove-live", () => queuePlayoutCommandAction({ commandType: "remove_live", liveSourceId: preview.id }), `Remove “${preview.name}” from program and return to automation?`)}><Square size={14} /> Remove live</button>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>New contribution</span><h3>Add live source</h3></div><Plus size={18} /></div>
          <form
            className={styles.liveForm}
            onSubmit={async (event) => {
              event.preventDefault();
              const result = await runAction("create-live", () => createLiveSourceAction({
                name,
                protocol,
                endpointUrl: endpoint || null,
                credentialSecretRef: secretRef || null,
                activeAutoFailover,
              }));
              if (result?.ok) { setName(""); setEndpoint(""); setSecretRef(""); setActiveAutoFailover(false); if (result.id) setPreviewId(result.id); }
            }}
          >
            <div className={styles.twoFields}>
              <label className={styles.field}><span>Source name</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={240} placeholder="Downtown camera" /></label>
              <label className={styles.field}><span>Protocol / device</span><select value={protocol} onChange={(event) => { setProtocol(event.target.value); setEndpoint(""); }}><option value="rtmp">RTMP</option><option value="rtmps">RTMPS</option><option value="srt">SRT</option><option value="rtsp">RTSP</option><option value="decklink">DeckLink (host setup required)</option><option value="test">Test pattern</option></select></label>
            </div>
            <label className={styles.field}>
              <span>{protocol === "decklink" ? "DeckLink device index" : "Endpoint URL"}</span>
              <input
                type={protocol === "decklink" ? "number" : "text"}
                min={protocol === "decklink" ? 1 : undefined}
                max={protocol === "decklink" ? 64 : undefined}
                step={protocol === "decklink" ? 1 : undefined}
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                required={protocol !== "test" && !secretRef}
                maxLength={protocol === "decklink" ? undefined : 2000}
                placeholder={protocol === "srt" ? "srt://host:port" : protocol === "decklink" ? "1" : protocol === "test" ? "No endpoint required" : `${protocol}://…`}
              />
              <small>{protocol === "decklink" ? "Enter device 1–64. The playout host must first have Blackmagic drivers and its DeckLink device exposed to the CasparCG container." : "Do not place usernames, passwords, or stream keys in this field."}</small>
            </label>
            <label className={styles.field}><span>Credential secret reference</span><input value={secretRef} onChange={(event) => setSecretRef(event.target.value)} maxLength={255} placeholder="env:LIVE_DOWNTOWN_URL" /><small>Use env:VARIABLE_NAME; the full secret source URL stays on the agent.</small></label>
            <label className={styles.settingToggle}>
              <span><strong>Automatic on-air failover</strong><small>Use only for OBS/MediaMTX or another feed that permits a second health-check connection. Leave this off for single-client camera endpoints.</small></span>
              <span className={styles.switch}><input type="checkbox" checked={activeAutoFailover} onChange={(event) => setActiveAutoFailover(event.target.checked)} /><span aria-hidden="true" /></span>
            </label>
            <button className={styles.primaryButton} type="submit" disabled={Boolean(working)}>{working === "create-live" ? <Loader2 className={styles.spin} size={15} /> : <Plus size={15} />} Add and probe source</button>
          </form>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Input matrix</span><h3>Registered sources</h3></div><span className={styles.layerCount}>{data.liveSources.length} inputs</span></div>
        {data.liveSources.length ? (
          <div className={styles.sourceGrid}>
            {data.liveSources.map((source) => {
              const supported = isSupportedLiveProtocol(source.protocol);
              const canTake = outputCanTakeLive && source.status !== "live" && canTakeLiveSource(source);
              return (
              <article className={`${styles.sourceCard} ${preview?.id === source.id ? styles.sourceCardSelected : ""}`} key={source.id}>
                <button className={styles.sourcePreviewButton} type="button" onClick={() => setPreviewId(source.id)}>
                  <span className={styles.sourceIcon}><Video size={19} /></span>
                  <span className={styles.sourceCopy}><strong>{source.name}</strong><small>{source.protocol.toUpperCase()} · {safeEndpointLabel(source)}</small></span>
                  <StatusPill status={!supported ? "unsupported" : source.enabled ? source.status : "disabled"} />
                </button>
                <div className={styles.sourceMeta}><span>{supported ? source.lastSignalAt ? `Signal ${formatClock(source.lastSignalAt, data.output?.timeZone)}` : "No signal received" : "Protocol is not supported by this playout build"}</span><span>{source.activeAutoFailover ? "On-air failover armed" : "Manual on-air return"}</span></div>
                {source.lastError ? <div className={styles.inlineWarning}><AlertTriangle size={14} /> {source.lastError}</div> : null}
                <div className={styles.sourceActions}>
                  <button type="button" onClick={() => setPreviewId(source.id)}><MonitorPlay size={14} /> Inspect</button>
                  <button type="button" disabled={!canTake || Boolean(working)} title={!canTake ? outputCanTakeLive ? "The source must be enabled and report ready before Take is available." : "Start the main output before taking a source live." : undefined} onClick={() => void runAction(`take-live-${source.id}`, () => queuePlayoutCommandAction({ commandType: "take_live", liveSourceId: source.id }), `Take “${source.name}” live to program?`)}><Play size={14} /> Take</button>
                  <button type="button" disabled={source.status !== "live" || Boolean(working)} title={source.status !== "live" ? "Only the source currently on program can be removed." : undefined} onClick={() => void runAction(`remove-live-${source.id}`, () => queuePlayoutCommandAction({ commandType: "remove_live", liveSourceId: source.id }), `Remove “${source.name}” from program?`)}><X size={14} /> Remove live</button>
                  <button type="button" disabled={Boolean(working)} onClick={() => void runAction(
                    `failover-${source.id}`,
                    () => setLiveSourceAutoFailoverAction(source.id, !source.activeAutoFailover),
                    source.activeAutoFailover
                      ? undefined
                      : `Arm automatic failover for “${source.name}”? Enable this only if the source permits a second health-check connection.`,
                  )}><Zap size={14} /> {source.activeAutoFailover ? "Disarm failover" : "Arm failover"}</button>
                </div>
              </article>
              );
            })}
          </div>
        ) : <EmptyState icon={<Video size={24} />} title="No live sources">Add a test pattern or contribution feed to verify the input path.</EmptyState>}
      </section>

      <div className={styles.bridgeNote}>
        <span className={styles.bridgeIcon}><Settings2 size={19} /></span>
        <div><strong>Local camera bridge</strong><p>Use OBS for switching cameras and send one RTMP or SRT program feed to CasparCG. Use MediaMTX beside the agent to translate local RTSP security cameras into a stable SRT or RTMP input. DeckLink capture stays on the playout server and is selected here by its numeric device index.</p></div>
      </div>
    </>
  );
}

function SettingsView({ data, working, runAction }: ViewProps) {
  const [enabled, setEnabled] = useState(data.output?.enabled ?? false);
  const [alwaysOn, setAlwaysOn] = useState(data.output?.alwaysOn ?? false);
  const checks = [
    { label: "Media storage", detail: "BLOB_READ_WRITE_TOKEN", ready: data.configuration.blobReady, action: "Connect Vercel Blob" },
    { label: "Agent authentication", detail: "BROADCAST_AGENT_SECRET", ready: data.configuration.agentSecretReady, action: "Set shared agent secret" },
    { label: "Cloudflare ingest", detail: "RTMPS URL and stream key", ready: data.configuration.cloudflareIngestReady, action: "Connect Cloudflare Stream" },
    { label: "Public channel return", detail: "NEXT_PUBLIC_BROADCAST_HLS_URL", ready: data.configuration.publicHlsReady, action: "Add public HLS URL" },
  ];
  const readyCount = checks.filter((item) => item.ready).length;

  return (
    <>
      {sectionHeader("settings", <span className={styles.readinessScore}><strong>{readyCount}/{checks.length}</strong> delivery checks ready</span>)}
      <div className={styles.settingsGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Launch checklist</span><h3>Cloud playout readiness</h3></div><Cloud size={19} /></div>
          <div className={styles.checklist}>
            {checks.map((item, index) => (
              <div className={styles.checkRow} key={item.label}>
                <span className={item.ready ? styles.checkReady : styles.checkPending}>{item.ready ? <Check size={16} /> : index + 1}</span>
                <span className={styles.checkCopy}><strong>{item.label}</strong><small>{item.detail}</small></span>
                <span className={item.ready ? styles.readyLabel : styles.pendingLabel}>{item.ready ? "Configured" : item.action}</span>
              </div>
            ))}
          </div>
          <div className={styles.securityNote}><CheckCircle2 size={16} /><span>Secret values are never returned to this browser. Readiness reflects presence only.</span></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Automation policy</span><h3>Main channel</h3></div><RadioTower size={19} /></div>
          {data.output ? (
            <form
              className={styles.automationForm}
              onSubmit={(event) => {
                event.preventDefault();
                const confirmation = !enabled && data.output?.enabled ? "Disable broadcast automation? The agent will not start new scheduled events." : undefined;
                void runAction("save-automation", () => updateOutputAutomationAction({ enabled, alwaysOn: enabled && alwaysOn }), confirmation);
              }}
            >
              <label className={styles.settingToggle}>
                <span><strong>Enable automation</strong><small>Allow the assigned agent to execute published logs.</small></span>
                <span className={styles.switch}><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); if (!event.target.checked) setAlwaysOn(false); }} /><span aria-hidden="true" /></span>
              </label>
              <label className={styles.settingToggle}>
                <span><strong>Always-on output</strong><small>Maintain the encoder and fill every unscheduled gap.</small></span>
                <span className={styles.switch}><input type="checkbox" checked={alwaysOn} disabled={!enabled} onChange={(event) => setAlwaysOn(event.target.checked)} /><span aria-hidden="true" /></span>
              </label>
              <button className={styles.primaryButton} type="submit" disabled={Boolean(working)}>{working === "save-automation" ? <Loader2 className={styles.spin} size={15} /> : <Save size={15} />} Save automation policy</button>
            </form>
          ) : <EmptyState icon={<RadioTower size={24} />} title="Main output not installed">Run the broadcast database migration before enabling automation.</EmptyState>}
        </section>
      </div>

      <div className={styles.settingsGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Output profile</span><h3>Technical specification</h3></div><Settings2 size={19} /></div>
          <dl className={styles.specGrid}>
            <div><dt>Output</dt><dd>{data.output?.name ?? "Not configured"}</dd></div>
            <div><dt>Raster</dt><dd>{data.output ? `${data.output.width} × ${data.output.height}` : "—"}</dd></div>
            <div><dt>Frame rate</dt><dd>{data.output?.frameRate ?? "—"}</dd></div>
            <div><dt>Time zone</dt><dd>{data.output?.timeZone ?? "—"}</dd></div>
            <div><dt>Agent</dt><dd>{data.agent?.name ?? "Not assigned"}</dd></div>
            <div><dt>Software</dt><dd>{data.agent?.softwareVersion ?? "Awaiting heartbeat"}</dd></div>
          </dl>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.panelKicker}>Distribution return</span><h3>Website & future apps</h3></div><Wifi size={19} /></div>
          <div className={styles.deliveryDiagram}>
            <div><RadioTower size={18} /><span><strong>CasparCG</strong><small>Compose</small></span></div><ChevronRight size={15} />
            <div><Cloud size={18} /><span><strong>Cloudflare</strong><small>Encode & deliver</small></span></div><ChevronRight size={15} />
            <div><MonitorPlay size={18} /><span><strong>HLS player</strong><small>Web / Roku</small></span></div>
          </div>
          <p className={styles.panelCopy}>The same public HLS address can feed the NeuseCast website now and a Roku channel later. Connecting Cloudflare does not require a control-room code change.</p>
          {data.configuration.publicHlsUrl ? <a className={styles.fullButton} href={data.configuration.publicHlsUrl} target="_blank" rel="noreferrer"><Play size={14} /> Open public stream</a> : <div className={styles.inlineWarning}><AlertTriangle size={15} /> Public HLS has not been connected.</div>}
        </section>
      </div>
    </>
  );
}
