import type { PlayerItem } from "./types";
import { HOUSE_AD_ID } from "../filler/constants";

export const NEUSECAST_HOUSE_AD: PlayerItem = {
  id: HOUSE_AD_ID,
  kind: "advertisement",
  source: "generated_content",
  campaignId: null,
  creativeId: null,
  durationSeconds: 15,
  eyebrow: "Grow your business",
  title: "You’re seeing this. So are your customers.",
  body: "Put your business on NeuseCast screens across Eastern Carolina for one simple monthly price.",
  callToAction: "Advertise at NeuseCast.com",
  mediaUrl: null,
  theme: "coral",
  sponsor: "NeuseCast",
};

const HOUSE_AD_PLACEMENT_SEPARATOR = "-placement-";

export function neusecastHouseAdPlacement(placementIndex: number): PlayerItem {
  return {
    ...NEUSECAST_HOUSE_AD,
    id: `${HOUSE_AD_ID}${HOUSE_AD_PLACEMENT_SEPARATOR}${placementIndex + 1}`,
  };
}

export function isNeusecastHouseAdId(itemId: string | null | undefined) {
  return itemId === HOUSE_AD_ID || itemId?.startsWith(`${HOUSE_AD_ID}${HOUSE_AD_PLACEMENT_SEPARATOR}`) === true;
}
