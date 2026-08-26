import type { PlayerItem } from "./types";

export const NEWSROOM_REPLAY_GAP_MS = 55 * 60 * 1_000;

export type PlayedAdvertisementState = {
  manifestVersion: string;
  ids: ReadonlySet<string>;
};

export function playableItemsForRuntime(
  items: PlayerItem[],
  options: {
    manifestVersion: string;
    playedAdvertisements: PlayedAdvertisementState;
    preview: boolean;
    serverNowMs: number;
  },
) {
  return items.filter((item) => {
    if (
      !options.preview
      && item.kind === "advertisement"
      && options.playedAdvertisements.manifestVersion === options.manifestVersion
      && options.playedAdvertisements.ids.has(item.id)
    ) return false;

    if (!item.expiresAt) return true;
    const expiresAt = Date.parse(item.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > options.serverNowMs;
  });
}

export function retainedActiveIndex(
  nextItems: PlayerItem[],
  currentItemId: string | null,
  previousItems: PlayerItem[] = [],
) {
  if (nextItems.length === 0) return 0;

  const retainedIndex = nextItems.findIndex((item) => item.id === currentItemId);
  if (retainedIndex >= 0) return retainedIndex;

  const previousIndex = previousItems.findIndex((item) => item.id === currentItemId);
  if (previousIndex >= 0) {
    for (let offset = 1; offset <= previousItems.length; offset += 1) {
      const successor = previousItems[(previousIndex + offset) % previousItems.length];
      const successorIndex = nextItems.findIndex((item) => item.id === successor.id);
      if (successorIndex >= 0) return successorIndex;
    }
  }

  return 0;
}

export function nextRotationIndex(
  items: PlayerItem[],
  playedItemId: string,
  options: {
    completedAt: number;
    lastNewsroomPlayAt: number;
    newsroomReplayGapMs?: number;
  },
) {
  if (items.length === 0) return 0;

  const playedIndex = items.findIndex((item) => item.id === playedItemId);
  const currentIndex = playedIndex >= 0 ? playedIndex : items.length - 1;
  const sequentialIndex = (currentIndex + 1) % items.length;
  const newsroomReplayGapMs = options.newsroomReplayGapMs ?? NEWSROOM_REPLAY_GAP_MS;

  for (let offset = 0; offset < items.length; offset += 1) {
    const candidateIndex = (currentIndex + 1 + offset) % items.length;
    const candidate = items[candidateIndex];
    const newsroomBlocked = candidate.source === "newsroom"
      && options.completedAt - options.lastNewsroomPlayAt < newsroomReplayGapMs;
    if (!newsroomBlocked) return candidateIndex;
  }

  // A one-item newsroom playlist still needs to keep playing rather than stop.
  return sequentialIndex;
}

export function shouldRefreshManifestAfterPlayback(item: PlayerItem) {
  return item.kind === "advertisement" && item.campaignId !== null;
}
