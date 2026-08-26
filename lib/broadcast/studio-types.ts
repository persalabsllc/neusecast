export type StudioAsset = {
  id: string;
  versionId: string | null;
  name: string;
  kind: "video" | "audio" | "image" | "caption" | "graphic";
  category: string;
  status: "uploading" | "processing" | "ready" | "failed" | "archived";
  durationMs: number | null;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  tags: string[];
  createdAt: string;
};

export type StudioProgramItem = {
  id: string;
  position: number;
  label: string;
  sourceKind: "asset" | "category" | "dynamic" | "live" | "break";
  category: string | null;
  status: string;
  plannedStartAt: string;
  plannedEndAt: string;
  durationMs: number;
  hardStart: boolean;
  allowTicker: boolean;
  mediaVersionId: string | null;
  mediaAssetId: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  mediaKind: StudioAsset["kind"] | null;
  liveSourceId: string | null;
  liveSourceName: string | null;
};

export type StudioLogSummary = {
  id: string;
  name: string;
  serviceDate: string;
  status: "draft" | "published" | "on_air" | "completed" | "cancelled" | "archived";
  revision: number;
  startsAt: string;
  endsAt: string;
  publishedAt: string | null;
  itemCount: number;
};

export type StudioTickerItem = {
  id: string;
  message: string;
  priority: "routine" | "important" | "urgent" | "emergency";
  status: string;
  sourceName: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  automated: boolean;
};

export type StudioGraphicLayer = {
  id: string;
  name: string;
  kind: "logo" | "clock" | "weather" | "ticker" | "lower_third" | "emergency" | "custom";
  layer: number;
  templateKey: string;
  enabled: boolean;
  persistent: boolean;
  data: Record<string, unknown>;
};

export type StudioLiveSource = {
  id: string;
  name: string;
  slug: string;
  protocol: string;
  status: string;
  endpointUrl: string | null;
  enabled: boolean;
  autoRecord: boolean;
  activeAutoFailover: boolean;
  lastSignalAt: string | null;
  lastError: string | null;
};

export type StudioDashboardData = {
  serverTime: string;
  output: {
    id: string;
    slug: string;
    name: string;
    status: string;
    enabled: boolean;
    alwaysOn: boolean;
    width: number;
    height: number;
    frameRate: string;
    timeZone: string;
    assignedAgentId: string | null;
    lastHeartbeatAt: string | null;
    lastError: string | null;
  } | null;
  agent: {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: string | null;
    softwareVersion: string | null;
    hostname: string | null;
    currentProgramItemId: string | null;
    healthy: boolean;
  } | null;
  assets: StudioAsset[];
  logs: StudioLogSummary[];
  selectedLog: StudioLogSummary | null;
  programItems: StudioProgramItem[];
  tickerItems: StudioTickerItem[];
  graphicLayers: StudioGraphicLayer[];
  liveSources: StudioLiveSource[];
  configuration: {
    blobReady: boolean;
    agentSecretReady: boolean;
    cloudflareIngestReady: boolean;
    publicHlsReady: boolean;
    publicHlsUrl: string | null;
  };
};
