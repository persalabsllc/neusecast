export const REGIONAL_CONTENT_MARKET = "Eastern North Carolina";
export const NETWORK_WIDE_CONTENT_MARKET = "Network-wide";

export function generatedContentMarketsForScreen(screenMarket: string) {
  return [...new Set([
    screenMarket.trim(),
    REGIONAL_CONTENT_MARKET,
    NETWORK_WIDE_CONTENT_MARKET,
  ].filter(Boolean))];
}
