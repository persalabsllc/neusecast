export const MAX_FILLER_ITEMS_PER_SCREEN = 24;

export function selectBalancedFiller<T extends { category: string }>(
  rows: readonly T[],
  limit = MAX_FILLER_ITEMS_PER_SCREEN,
) {
  if (rows.length <= limit) return [...rows];

  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.category);
    if (bucket) bucket.push(row);
    else buckets.set(row.category, [row]);
  }

  const selected: T[] = [];
  let index = 0;
  while (selected.length < limit) {
    let added = false;
    for (const bucket of buckets.values()) {
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
