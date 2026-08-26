type HydratedProgramItem = {
  id: string;
  plannedStartAt: string;
  plannedEndAt: string;
  transition: unknown;
  overlayPolicy: unknown;
  media: { versionId: string; assetId: string } | null;
  liveSource: { id: string } | null;
};

/** Serializes only fields the playout agent consumes for wall-clock output. */
export function compactAgentProgramItem(item: HydratedProgramItem) {
  return {
    id: item.id,
    plannedStartAt: item.plannedStartAt,
    plannedEndAt: item.plannedEndAt,
    transition: item.transition,
    overlayPolicy: item.overlayPolicy,
    ...(item.media
      ? { mediaVersionId: item.media.versionId, assetId: item.media.assetId }
      : {}),
    ...(item.liveSource ? { liveSourceId: item.liveSource.id } : {}),
  };
}
