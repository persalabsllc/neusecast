export const MAX_FILLER_ITEMS_PER_SCREEN = 120;

function stableNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectBalancedFiller<T extends { category: string; id?: string; title?: string; artworkUrl?: string | null }>(
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
    bucket.sort((left, right) => {
      // Lead each category with its strongest television treatment while still
      // preserving a stable rotation among cards with the same media state.
      const mediaDifference = Number(Boolean(right.artworkUrl)) - Number(Boolean(left.artworkUrl));
      if (mediaDifference) return mediaDifference;
      return stableNumber(`${seed}:${category}:${left.id ?? left.title ?? ""}`)
        - stableNumber(`${seed}:${category}:${right.id ?? right.title ?? ""}`);
    });
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
