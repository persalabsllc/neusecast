import { createHash } from "node:crypto";
import type { PlayerItem } from "./types";

const NETWORK_IDENTS = [
  {
    key: "logo",
    durationSeconds: 3,
    title: "NeuseCast",
    body: "Local screens, connected.",
    theme: "aqua" as const,
  },
  {
    key: "network",
    durationSeconds: 5,
    title: "This is the NeuseCast TV Network",
    body: "Eastern North Carolina · NeuseCast.com",
    theme: "blue" as const,
  },
  {
    key: "combo",
    durationSeconds: 6,
    title: "NeuseCast TV Network",
    body: "Local screens, connected. · NeuseCast.com",
    theme: "navy" as const,
  },
] as const;

function deterministicNumber(value: string) {
  return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

function identItem(templateIndex: number, gapIndex: number, seed: string): PlayerItem {
  const template = NETWORK_IDENTS[templateIndex % NETWORK_IDENTS.length];
  return {
    id: `neusecast-ident-${template.key}-${createHash("sha256").update(`${seed}:${gapIndex}`).digest("hex").slice(0, 12)}`,
    kind: "ident",
    source: "generated_content",
    campaignId: null,
    creativeId: null,
    durationSeconds: template.durationSeconds,
    eyebrow: "NeuseCast station identification",
    title: template.title,
    body: template.body,
    callToAction: "NeuseCast.com",
    mediaUrl: null,
    theme: template.theme,
    sponsor: "NeuseCast",
    contentCategory: `network_ident_${template.key}`,
    mediaCredit: null,
    expiresAt: null,
  };
}

export function insertNetworkIdents(items: PlayerItem[], channelSeed: string) {
  if (items.length < 4) return items;

  const seed = `${channelSeed}:${items.map((item) => item.id).join("|")}`;
  const maximumIdents = Math.min(3, Math.max(1, Math.floor(items.length / 4)));
  const templateOffset = deterministicNumber(`${seed}:template-order`) % NETWORK_IDENTS.length;
  const rotation: PlayerItem[] = [];
  let slidesSinceIdent = 0;
  let identCount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const nextItem = items[index + 1];
    rotation.push(item);
    slidesSinceIdent += 1;

    if (!nextItem || identCount >= maximumIdents || slidesSinceIdent < 2) continue;

    const chance = deterministicNumber(`${seed}:gap:${index}`) % 100;
    const shouldInsert = chance < 32 || slidesSinceIdent >= 5;
    if (!shouldInsert) continue;

    const templateIndex = (templateOffset + identCount) % NETWORK_IDENTS.length;
    rotation.push(identItem(templateIndex, index, seed));
    slidesSinceIdent = 0;
    identCount += 1;
  }

  return rotation;
}
