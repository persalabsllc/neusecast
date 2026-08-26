export type SchedulableAsset = {
  assetId: string;
  versionId: string;
  name: string;
  category: string;
  durationMs: number;
};

export type PlannedAsset = SchedulableAsset & {
  position: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
};

// A full day of 30-second events contains 2,880 items. This cap also keeps the
// compact agent snapshot comfortably below Vercel's Function payload limit.
export const MAX_PUBLISHED_LOG_ITEMS = 3_000;

function seededHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function deterministicOrder(assets: SchedulableAsset[], seed: string) {
  return [...assets].sort((left, right) => (
    seededHash(`${seed}:${left.versionId}`) - seededHash(`${seed}:${right.versionId}`)
  ));
}

/**
 * Expands the current air-ready library into an exact, deterministic broadcast
 * day. The same inputs always produce the same log, which makes recovery and
 * audit comparisons straightforward.
 */
export function buildDailySchedule(
  assets: SchedulableAsset[],
  startsAt: Date,
  endsAt: Date,
  seed: string,
): PlannedAsset[] {
  const available = deterministicOrder(
    assets.filter((asset) => (
      asset.versionId
      && Number.isInteger(asset.durationMs)
      && asset.durationMs >= 1_000
      && asset.durationMs <= 86_400_000
    )),
    seed,
  );
  if (!available.length || endsAt <= startsAt) return [];

  const result: PlannedAsset[] = [];
  let cursor = startsAt.getTime();
  let sourceIndex = 0;
  let previous: SchedulableAsset | null = null;

  while (cursor < endsAt.getTime() && result.length < MAX_PUBLISHED_LOG_ITEMS) {
    let selected = available[sourceIndex % available.length];

    // When choices exist, avoid back-to-back repeats and adjacent commercial
    // breaks. This is intentionally deterministic rather than random.
    if (previous && available.length > 1) {
      for (let offset = 0; offset < available.length; offset += 1) {
        const candidate = available[(sourceIndex + offset) % available.length];
        const sameAsset = candidate.versionId === previous.versionId;
        const adjacentCommercials = candidate.category === "commercial" && previous.category === "commercial";
        if (!sameAsset && !adjacentCommercials) {
          selected = candidate;
          sourceIndex += offset;
          break;
        }
      }
    }

    const remainingMs = endsAt.getTime() - cursor;
    const durationMs = Math.min(selected.durationMs, remainingMs);
    if (durationMs < 1_000) break;
    const plannedStartAt = new Date(cursor);
    const plannedEndAt = new Date(cursor + durationMs);
    result.push({
      ...selected,
      durationMs,
      position: result.length,
      plannedStartAt,
      plannedEndAt,
    });
    cursor = plannedEndAt.getTime();
    previous = selected;
    sourceIndex += 1;
  }

  return result;
}
