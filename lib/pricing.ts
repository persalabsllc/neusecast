export const MEDIA_PLANS = {
  screens: {
    key: "screens",
    name: "NeuseCast Screens",
    amountCents: 7_500,
    currency: "USD",
    interval: "month",
    includedScreens: "Every active NeuseCast screen",
    radioAcknowledgmentsPerMonth: 0,
    description: "NeuseCast advertising on every active network screen, billed monthly.",
  },
  hear_see: {
    key: "hear_see",
    name: "Hear It + See It",
    amountCents: 14_900,
    currency: "USD",
    interval: "month",
    includedScreens: "Every active NeuseCast screen",
    radioAcknowledgmentsPerMonth: 120,
    description: "NeuseCast advertising plus 120 Captain 97.1 underwriting acknowledgments each month, billed monthly.",
  },
  local_dominance: {
    key: "local_dominance",
    name: "Local Dominance",
    amountCents: 24_900,
    currency: "USD",
    interval: "month",
    includedScreens: "Every active NeuseCast screen",
    radioAcknowledgmentsPerMonth: 360,
    description: "NeuseCast advertising plus 360 Captain 97.1 underwriting acknowledgments each month, billed monthly.",
  },
} as const;

export type MediaPlanKey = keyof typeof MEDIA_PLANS;
export type MediaPlan = (typeof MEDIA_PLANS)[MediaPlanKey];

export const DEFAULT_MEDIA_PLAN_KEY: MediaPlanKey = "screens";

export function isMediaPlanKey(value: unknown): value is MediaPlanKey {
  return typeof value === "string" && Object.hasOwn(MEDIA_PLANS, value);
}

export function getMediaPlan(value: unknown): MediaPlan | null {
  return isMediaPlanKey(value) ? MEDIA_PLANS[value] : null;
}

export function mediaPlanOrDefault(value: unknown): MediaPlan {
  return getMediaPlan(value) ?? MEDIA_PLANS[DEFAULT_MEDIA_PLAN_KEY];
}

export function planIncludesRadio(plan: MediaPlan) {
  return plan.radioAcknowledgmentsPerMonth > 0;
}
