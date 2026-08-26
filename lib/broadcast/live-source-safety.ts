export const SUPPORTED_LIVE_PROTOCOLS = [
  "rtmp",
  "rtmps",
  "srt",
  "rtsp",
  "decklink",
  "test",
] as const;

const supportedProtocols = new Set<string>(SUPPORTED_LIVE_PROTOCOLS);
const takeableStatuses = new Set(["ready", "live"]);

export function isSupportedLiveProtocol(protocol: string) {
  return supportedProtocols.has(protocol);
}

export function isLiveSourceTakeable(source: {
  protocol: string;
  status: string;
  enabled: boolean;
}) {
  return source.enabled
    && isSupportedLiveProtocol(source.protocol)
    && takeableStatuses.has(source.status);
}
