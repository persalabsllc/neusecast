import type { PlayerItem } from "./types";
import { HOUSE_AD_ID } from "@/lib/filler/constants";

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
