import { NEUSECAST_HOUSE_AD, neusecastHouseAdPlacement } from "./house-ad";
import type { PlayerItem } from "./types";

function interleaveSupport(hostItems: PlayerItem[], fillerItems: PlayerItem[]) {
  const support: PlayerItem[] = [];
  const max = Math.max(hostItems.length, fillerItems.length);
  for (let index = 0; index < max; index += 1) {
    if (hostItems[index]) support.push(hostItems[index]);
    if (fillerItems[index]) support.push(fillerItems[index]);
  }
  return support;
}

export function interleaveRotation(advertisements: PlayerItem[], hostItems: PlayerItem[], fillerItems: PlayerItem[]) {
  const support = interleaveSupport(hostItems, fillerItems);
  const advertisementQueue = advertisements.slice(0, Math.max(1, Math.ceil(support.length / 3)));
  const base: PlayerItem[] = [];
  let supportIndex = 0;
  let advertisementIndex = 0;

  while (supportIndex < support.length || advertisementIndex < advertisementQueue.length) {
    const supportTarget = advertisementIndex < advertisementQueue.length ? 3 : support.length;
    for (let index = 0; index < supportTarget && supportIndex < support.length; index += 1) {
      base.push(support[supportIndex]);
      supportIndex += 1;
    }

    if (advertisementIndex < advertisementQueue.length) {
      if (base.at(-1)?.kind === "advertisement") base.push(NEUSECAST_HOUSE_AD);
      base.push(advertisementQueue[advertisementIndex]);
      advertisementIndex += 1;
    }
  }

  const rotation: PlayerItem[] = [];
  let contentSinceHouseAd = 0;
  for (const item of base) {
    rotation.push(item);
    if (item.id === NEUSECAST_HOUSE_AD.id) {
      contentSinceHouseAd = 0;
    } else {
      contentSinceHouseAd += 1;
      if (contentSinceHouseAd >= 6) {
        rotation.push(NEUSECAST_HOUSE_AD);
        contentSinceHouseAd = 0;
      }
    }
  }
  if (rotation.at(-1)?.id !== NEUSECAST_HOUSE_AD.id) rotation.push(NEUSECAST_HOUSE_AD);

  let houseAdPlacementIndex = 0;
  return rotation.map((item) => {
    if (item.id !== NEUSECAST_HOUSE_AD.id) return item;
    const placement = neusecastHouseAdPlacement(houseAdPlacementIndex);
    houseAdPlacementIndex += 1;
    return placement;
  });
}
