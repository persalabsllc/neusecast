import "server-only";

export type EditorialArtwork = {
  url: string;
  credit: string;
  license: string;
  sourceUrl: string;
};

type CommonsMetadataValue = { value?: string };

type CommonsResponse = {
  query?: {
    pages?: Record<string, {
      title?: string;
      imageinfo?: Array<{
        width?: number;
        height?: number;
        thumburl?: string;
        url?: string;
        descriptionurl?: string;
        extmetadata?: {
          Artist?: CommonsMetadataValue;
          Credit?: CommonsMetadataValue;
          LicenseShortName?: CommonsMetadataValue;
          LicenseUrl?: CommonsMetadataValue;
          ImageDescription?: CommonsMetadataValue;
        };
      }>;
    }>;
  };
};

const MAX_ARTWORK_QUERIES = 2;
const DOCUMENT_SCAN_PATTERN = /\b(?:census|city directory|environmental statement|meeting minutes|proceedings|registered motor vehicle|report to the public|statutes at large)\b|\bpage\s+\d+\b|\.(?:djvu|pdf|tiff?)(?:\b|$)/iu;

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/gu, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#039;", "'")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function isCommerciallyReusableLicense(value: string) {
  return /^(?:public domain|cc0|cc by(?:-sa)?(?:\s|$))/iu.test(value)
    && !/(?:-nc|-nd)/iu.test(value);
}

function artworkQueries(searchQuery: string, fallbackQueries: readonly string[]) {
  const queries = [searchQuery, ...fallbackQueries]
    .map((query) => cleanText(query, 120))
    .filter(Boolean);
  return [...new Map(queries.map((query) => [query.toLowerCase(), query])).values()]
    .slice(0, MAX_ARTWORK_QUERIES);
}

async function searchCommonsArtwork(query: string): Promise<EditorialArtwork | null> {
  const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    // Restrict the search itself to raster artwork. Without this filter,
    // Commons frequently ranks report covers, directories, and PDF scans ahead
    // of the actual landmark or location the card is describing.
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "24",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1600",
  }).toString();

  const response = await fetch(endpoint, {
    headers: { "User-Agent": "NeuseCast/1.0 (https://neusecast.com; Hello@NeuseCast.com)" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as CommonsResponse | null;
  const queryTerms = new Set(query.toLowerCase().split(/\W+/u).filter((term) => term.length > 3));
  const pages = Object.values(payload?.query?.pages ?? {}).sort((left, right) => {
    const score = (page: typeof left) => {
      const title = (page.title ?? "").toLowerCase();
      const info = page.imageinfo?.[0];
      const termScore = [...queryTerms].filter((term) => title.includes(term)).length * 10;
      const landscapeScore = (info?.width ?? 0) >= (info?.height ?? Number.POSITIVE_INFINITY) ? 4 : 0;
      const resolutionScore = (info?.width ?? 0) >= 1_200 ? 2 : 0;
      const documentPenalty = DOCUMENT_SCAN_PATTERN.test(page.title ?? "") ? 100 : 0;
      return termScore + landscapeScore + resolutionScore - documentPenalty;
    };
    return score(right) - score(left);
  });
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const license = cleanText(info?.extmetadata?.LicenseShortName?.value, 80);
    const url = info?.thumburl ?? info?.url ?? "";
    const sourceUrl = info?.descriptionurl ?? "";
    if (
      !url.startsWith("https://")
      || !sourceUrl.startsWith("https://")
      || !isCommerciallyReusableLicense(license)
      || DOCUMENT_SCAN_PATTERN.test(page.title ?? "")
      || /\.(?:svg|gif|pdf|djvu|tiff?)(?:\?|$)/iu.test(url)
      || (info?.width ?? 0) < 900
      || (info?.height ?? 0) < 500
    ) continue;
    try {
      if (new URL(url).hostname !== "upload.wikimedia.org") continue;
      if (!new URL(sourceUrl).hostname.endsWith("commons.wikimedia.org")) continue;
    } catch {
      continue;
    }
    const artist = cleanText(info?.extmetadata?.Artist?.value, 100)
      || cleanText(info?.extmetadata?.Credit?.value, 100)
      || "Wikimedia Commons contributor";
    return {
      url,
      credit: `Image: ${artist} / ${license} / Wikimedia Commons`,
      license,
      sourceUrl,
    };
  }
  return null;
}

export async function findEditorialArtwork(
  searchQuery: string,
  fallbackQueries: readonly string[] = [],
): Promise<EditorialArtwork | null> {
  for (const query of artworkQueries(searchQuery, fallbackQueries)) {
    try {
      const artwork = await searchCommonsArtwork(query);
      if (artwork) return artwork;
    } catch {
      // Artwork is an enhancement, not a reason to reject sourced content. The
      // player retains its designed graphic fallback when Commons is unavailable.
    }
  }
  return null;
}
