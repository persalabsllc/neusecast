export const MAX_FILLER_ITEMS_PER_SCREEN = 120;
export const FILLER_ROTATION_WINDOW_MS = 60 * 60 * 1_000;

type FillerSelectionRow = {
  category: string;
  id?: string;
  title?: string;
  artworkUrl?: string | null;
  updatedAt?: Date | string | null;
};

function stableNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function updatedAtNumber(value: Date | string | null | undefined) {
  if (!value) return 0;
  const updatedAt = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(updatedAt) ? updatedAt : 0;
}

export function fillerRotationSeed(scope: string, nowMs: number) {
  return `${scope}:${Math.floor(nowMs / FILLER_ROTATION_WINDOW_MS)}`;
}

export function selectBalancedFiller<T extends FillerSelectionRow>(
  rows: readonly T[],
  limit = MAX_FILLER_ITEMS_PER_SCREEN,
  seed = "neusecast",
) {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.category);
    if (bucket) bucket.push(row);
    else buckets.set(row.category, [row]);
  }

  for (const [category, bucket] of buckets) {
    const remaining = [...bucket].sort((left, right) => {
      const updatedDifference = updatedAtNumber(right.updatedAt) - updatedAtNumber(left.updatedAt);
      if (updatedDifference) return updatedDifference;
      // Prefer the strongest television treatment when two cards have the same
      // update time, then use a stable identity order before seeded selection.
      const mediaDifference = Number(Boolean(right.artworkUrl)) - Number(Boolean(left.artworkUrl));
      if (mediaDifference) return mediaDifference;
      return String(left.id ?? left.title ?? "").localeCompare(String(right.id ?? right.title ?? ""));
    });

    const recencyBiasedOrder: T[] = [];
    while (remaining.length > 0) {
      // Pick from the next three newest cards. This gives recently refreshed
      // programming priority without locking the playlist into timestamp order.
      const choiceWindow = Math.min(3, remaining.length);
      const choiceIndex = stableNumber(`${seed}:${category}:${recencyBiasedOrder.length}`) % choiceWindow;
      recencyBiasedOrder.push(remaining.splice(choiceIndex, 1)[0]);
    }
    buckets.set(category, recencyBiasedOrder);
  }

  const categories = [...buckets.keys()].sort((left, right) => (
    stableNumber(`${seed}:${left}`) - stableNumber(`${seed}:${right}`)
  ));

  const selected: T[] = [];
  let index = 0;
  while (selected.length < limit) {
    let added = false;
    for (const category of categories) {
      const bucket = buckets.get(category) ?? [];
      const row = bucket[index];
      if (!row) continue;
      selected.push(row);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
    index += 1;
  }
  return selected;
}

export function selectCompleteFillerRotation<T extends FillerSelectionRow>(
  rows: readonly T[],
  seed: string,
) {
  // Venue and network players intentionally receive every eligible card.
  // Playback history must never reduce this set; it only affects newsroom and
  // paid-campaign scheduling in their respective scheduling layers.
  return selectBalancedFiller(rows, rows.length, seed);
}
