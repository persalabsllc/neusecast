import "server-only";

export type NewsroomSourceDefinition = {
  name: string;
  homepageUrl: string;
  sourceType: "government" | "public_data" | "established_media" | "community_publisher";
  trustTier: "primary" | "secondary";
  attributionLabel: string;
  mediaPolicy: "facts_only" | "licensed_media_only";
};

export const DEFAULT_NEWSROOM_SOURCES: readonly NewsroomSourceDefinition[] = [
  { name: "City of New Bern", homepageUrl: "https://www.newbernnc.gov/", sourceType: "government", trustTier: "primary", attributionLabel: "City of New Bern", mediaPolicy: "licensed_media_only" },
  { name: "Craven County", homepageUrl: "https://www.cravencountync.gov/", sourceType: "government", trustTier: "primary", attributionLabel: "Craven County", mediaPolicy: "licensed_media_only" },
  { name: "Craven County Schools", homepageUrl: "https://www.cravenk12.org/", sourceType: "government", trustTier: "primary", attributionLabel: "Craven County Schools", mediaPolicy: "licensed_media_only" },
  { name: "Craven County Active Bookings", homepageUrl: "https://gis.cravencountync.gov/images/activebookings/", sourceType: "public_data", trustTier: "primary", attributionLabel: "Craven County public booking records", mediaPolicy: "facts_only" },
  { name: "North Carolina Courts", homepageUrl: "https://www.nccourts.gov/", sourceType: "government", trustTier: "primary", attributionLabel: "North Carolina Judicial Branch", mediaPolicy: "facts_only" },
  { name: "North Carolina Board of Elections", homepageUrl: "https://www.ncsbe.gov/", sourceType: "government", trustTier: "primary", attributionLabel: "North Carolina State Board of Elections", mediaPolicy: "licensed_media_only" },
  { name: "NCDOT", homepageUrl: "https://www.ncdot.gov/", sourceType: "government", trustTier: "primary", attributionLabel: "North Carolina Department of Transportation", mediaPolicy: "licensed_media_only" },
  { name: "National Weather Service", homepageUrl: "https://www.weather.gov/", sourceType: "government", trustTier: "primary", attributionLabel: "National Weather Service", mediaPolicy: "licensed_media_only" },
  { name: "Visit New Bern", homepageUrl: "https://visitnewbern.com/", sourceType: "government", trustTier: "primary", attributionLabel: "Visit New Bern", mediaPolicy: "licensed_media_only" },
  { name: "U.S. Attorney EDNC", homepageUrl: "https://www.justice.gov/usao-ednc", sourceType: "government", trustTier: "primary", attributionLabel: "U.S. Attorney's Office, Eastern District of North Carolina", mediaPolicy: "licensed_media_only" },
  { name: "WITN", homepageUrl: "https://www.witn.com/", sourceType: "established_media", trustTier: "secondary", attributionLabel: "WITN", mediaPolicy: "facts_only" },
  { name: "WNCT", homepageUrl: "https://www.wnct.com/", sourceType: "established_media", trustTier: "secondary", attributionLabel: "WNCT", mediaPolicy: "facts_only" },
  { name: "WCTI News 12", homepageUrl: "https://wcti12.com/", sourceType: "established_media", trustTier: "secondary", attributionLabel: "WCTI News 12", mediaPolicy: "facts_only" },
  { name: "New Bern Now", homepageUrl: "https://newbernnow.com/", sourceType: "community_publisher", trustTier: "secondary", attributionLabel: "New Bern Now", mediaPolicy: "facts_only" },
  { name: "New Bern Live", homepageUrl: "https://newbernlive.org/", sourceType: "community_publisher", trustTier: "secondary", attributionLabel: "New Bern Live", mediaPolicy: "facts_only" },
] as const;

function normalizedHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "";
  }
}

export function newsroomSourceForUrl(url: string) {
  const hostname = normalizedHost(url);
  if (!hostname) return null;
  return DEFAULT_NEWSROOM_SOURCES.find((source) => {
    const sourceHost = normalizedHost(source.homepageUrl);
    return hostname === sourceHost || hostname.endsWith(`.${sourceHost}`);
  }) ?? null;
}

export function newsroomSourcePrompt() {
  return DEFAULT_NEWSROOM_SOURCES
    .map((source) => `${source.attributionLabel}: ${source.homepageUrl}`)
    .join(" | ");
}
