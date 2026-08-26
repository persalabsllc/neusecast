export type EditorialArtwork = {
  url: string;
  credit: string;
  license: string;
  sourceUrl: string;
};

export type ResolvedArtwork = {
  url: string;
  credit: string | null;
};

const DOCUMENT_FILE_PATTERN = /\.(?:djvu|pdf|tiff?)(?:[/?#]|$)|\/page\d+-/iu;
const DOCUMENT_TITLE_PATTERN = /\b(?:annual report|audit|census|city directory|dictionary|electronic resource|encyclopedia|environmental statement|meeting minutes|proceedings|registered motor vehicle|report to the public|statutes at large)\b|\bpage\s+\d+\b/iu;
const PHOTO_DEPENDENT_TEMPLATES = new Set(["photo_feature", "place_card", "archival"]);

function metadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizedReference(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A malformed percent escape is still checked in its original form.
  }
  return decoded;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isCommerciallyReusableLicense(value: string) {
  return /^(?:public domain|cc0|cc by(?:-sa)?(?:\s|$))/iu.test(value)
    && !/(?:-nc|-nd)/iu.test(value);
}

function hasVisibleCommonsAttribution(credit: string, license: string) {
  return /^image:\s*\S/iu.test(credit)
    && credit.includes(license)
    && /\/\s*wikimedia commons\s*$/iu.test(credit);
}

export function isUnsafeArtworkReference(value: string | null | undefined) {
  if (!value) return false;
  const decoded = normalizedReference(value);
  const titleText = decoded.replace(/[_-]+/gu, " ");
  return DOCUMENT_FILE_PATTERN.test(decoded) || DOCUMENT_TITLE_PATTERN.test(titleText);
}

export function storedAutomaticArtwork(
  artworkUrl: string | null,
  metadata: Record<string, unknown> | null,
): EditorialArtwork | null {
  const credit = metadataString(metadata, "artworkCredit");
  const license = metadataString(metadata, "artworkLicense");
  const sourceUrl = metadataString(metadata, "artworkSourceUrl");
  if (
    !artworkUrl
    || !credit
    || !sourceUrl
    || !isHttpUrl(artworkUrl)
    || !isHttpUrl(sourceUrl)
    || !isCommerciallyReusableLicense(license)
    || !hasVisibleCommonsAttribution(credit, license)
    || isUnsafeArtworkReference(artworkUrl)
    || isUnsafeArtworkReference(sourceUrl)
  ) return null;

  try {
    if (new URL(artworkUrl).hostname !== "upload.wikimedia.org") return null;
    if (new URL(sourceUrl).hostname !== "commons.wikimedia.org") return null;
  } catch {
    return null;
  }

  return { url: artworkUrl, credit, license, sourceUrl };
}

export function resolveGeneratedArtwork(
  artworkUrl: string | null,
  metadata: Record<string, unknown> | null,
): ResolvedArtwork | null {
  if (!artworkUrl || !isHttpUrl(artworkUrl) || isUnsafeArtworkReference(artworkUrl)) return null;
  if (metadataString(metadata, "origin") === "manual") {
    return { url: artworkUrl, credit: metadataString(metadata, "artworkCredit") || null };
  }
  return storedAutomaticArtwork(artworkUrl, metadata);
}

export function resolveNewsroomArtwork(
  imageUrl: string | null,
  imageCredit: string | null,
  imageSourceUrl: string | null,
): ResolvedArtwork | null {
  if (
    !imageUrl
    || !imageCredit?.trim()
    || !imageSourceUrl
    || !isHttpUrl(imageUrl)
    || !isHttpUrl(imageSourceUrl)
    || isUnsafeArtworkReference(imageUrl)
    || isUnsafeArtworkReference(imageSourceUrl)
  ) return null;
  return { url: imageUrl, credit: imageCredit.trim() };
}

export function safeFillerVisualTemplate(
  category: string,
  requestedTemplate: string | null | undefined,
  hasArtwork: boolean,
) {
  if (hasArtwork || !requestedTemplate || !PHOTO_DEPENDENT_TEMPLATES.has(requestedTemplate)) {
    return requestedTemplate ?? "editorial_split";
  }
  return category === "fact" || category === "did_you_know"
    ? "fact_reveal"
    : "editorial_split";
}
