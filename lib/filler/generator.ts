import "server-only";

import { createHash } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { generatedContent, screens, venues } from "@/lib/db/schema";
import {
  AUTOMATIC_FILLER_CATEGORIES,
  FILLER_CATEGORIES,
  FILLER_THEMES,
  FILLER_VISUAL_TEMPLATES,
  type FillerCategory,
  type FillerTheme,
  type FillerVisualTemplate,
} from "./constants";
import { findEditorialArtwork, type EditorialArtwork } from "./artwork";
import { safeFillerVisualTemplate, storedAutomaticArtwork } from "./artwork-policy";
import { localSubjectPrompt } from "./local-subjects";

type GeneratedFillerItem = {
  category: FillerCategory;
  title: string;
  body: string;
  eyebrow: string;
  callToAction: string | null;
  sourceName: string;
  sourceUrl: string;
  theme: FillerTheme;
  durationSeconds: number;
  validUntil: string | null;
  artworkSearchQuery: string | null;
  visualTemplate: FillerVisualTemplate;
  locationLabel: string | null;
  artwork: EditorialArtwork | null;
};

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    action?: { sources?: Array<{ url?: string }> };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string }>;
    }>;
  }>;
  error?: { message?: string };
};

const SENSITIVE_NEWS_ARTWORK_PATTERN = /\b(?:arrest(?:ed)?|charg(?:e|ed)|victim|injur(?:y|ed)|kill(?:ed)?|died|death|dead|fatal|missing person|shooting|crash|collision|fire|investigat(?:e|ed|ing|ion)|alleg(?:e|ed|ation)|accus(?:e|ed|ation)|assault|abuse|homicide|murder|manslaughter|mugshot|private residence)\b/iu;
const ARTWORK_WORKER_LIMIT = 4;

export type FillerGenerationResult = {
  markets: number;
  created: number;
  skipped: number;
  errors: string[];
};

function fillerResponseSchema(categories: readonly FillerCategory[], itemsPerCategory: number) {
  const itemCount = categories.length * itemsPerCategory;
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: itemCount,
        maxItems: itemCount,
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: categories },
            title: { type: "string", minLength: 1, maxLength: 180 },
            body: { type: "string", minLength: 1, maxLength: 500 },
            eyebrow: { type: "string", minLength: 1, maxLength: 80 },
            callToAction: { type: ["string", "null"], maxLength: 120 },
            sourceName: { type: "string", minLength: 1, maxLength: 160 },
            sourceUrl: { type: "string", minLength: 8, maxLength: 2_000 },
            theme: { type: "string", enum: FILLER_THEMES },
            durationSeconds: { type: "integer", minimum: 8, maximum: 20 },
            validUntil: { type: ["string", "null"], maxLength: 40 },
            artworkSearchQuery: { type: ["string", "null"], maxLength: 120 },
            visualTemplate: { type: "string", enum: FILLER_VISUAL_TEMPLATES },
            locationLabel: { type: ["string", "null"], maxLength: 100 },
          },
          required: [
            "category",
            "title",
            "body",
            "eyebrow",
            "callToAction",
            "sourceName",
            "sourceUrl",
            "theme",
            "durationSeconds",
            "validUntil",
            "artworkSearchQuery",
            "visualTemplate",
            "locationLabel",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  } as const;
}

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function responseText(response: OpenAIResponse) {
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("");
}

function citedUrls(response: OpenAIResponse) {
  const urls = new Set<string>();
  for (const item of response.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (typeof source.url === "string") urls.add(source.url);
    }
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation" && typeof annotation.url === "string") urls.add(annotation.url);
      }
    }
  }
  return urls;
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return `${url.origin}${url.pathname.replace(/\/$/u, "")}`.toLowerCase();
  } catch {
    return "";
  }
}

function isCited(sourceUrl: string, citations: Set<string>) {
  const comparable = comparableUrl(sourceUrl);
  if (!comparable) return false;
  return [...citations].some((citation) => comparableUrl(citation) === comparable);
}

function locationArtworkQuery(item: GeneratedFillerItem, market: string) {
  const location = item.locationLabel?.trim();
  if (!location) return null;
  const regionalLabel = /north carolina/iu.test(market) ? market : `${market} North Carolina`;
  return location.toLowerCase().includes(market.toLowerCase())
    ? `${location} North Carolina`
    : `${location} ${regionalLabel}`;
}

async function attachArtwork(items: GeneratedFillerItem[], market: string) {
  const resolved = items.map((item) => ({ ...item }));
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(ARTWORK_WORKER_LIMIT, resolved.length) }, async () => {
    while (nextIndex < resolved.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = resolved[index];
      if (item.category === "news" && SENSITIVE_NEWS_ARTWORK_PATTERN.test(`${item.title} ${item.body}`)) continue;
      const locationQuery = locationArtworkQuery(item, market);
      const primaryQuery = item.artworkSearchQuery ?? locationQuery;
      if (!primaryQuery) continue;
      item.artwork = await findEditorialArtwork(
        primaryQuery,
        locationQuery && locationQuery.toLowerCase() !== primaryQuery.toLowerCase() ? [locationQuery] : [],
      );
    }
  }));
  return resolved;
}

function validateItems(
  value: unknown,
  citations: Set<string>,
  requestedCategories: readonly FillerCategory[],
  itemsPerCategory: number,
): GeneratedFillerItem[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) return [];
  const allowedCategories = new Set<string>(requestedCategories);
  const allowedThemes = new Set<string>(FILLER_THEMES);
  const allowedVisualTemplates = new Set<string>(FILLER_VISUAL_TEMPLATES);
  const categoryCounts = new Map<FillerCategory, number>();
  const items: GeneratedFillerItem[] = [];

  for (const raw of (value as { items: unknown[] }).items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<GeneratedFillerItem>;
    if (
      typeof item.category !== "string"
      || !allowedCategories.has(item.category)
      || typeof item.theme !== "string"
      || !allowedThemes.has(item.theme)
      || typeof item.visualTemplate !== "string"
      || !allowedVisualTemplates.has(item.visualTemplate)
    ) continue;
    const sourceUrl = boundedText(item.sourceUrl, 2_000);
    if (!isCited(sourceUrl, citations)) continue;
    const title = boundedText(item.title, 180);
    const body = boundedText(item.body, 500);
    const eyebrow = boundedText(item.eyebrow, 80);
    const sourceName = boundedText(item.sourceName, 160);
    if (!title || !body || !eyebrow || !sourceName) continue;
    const duration = Number(item.durationSeconds);
    const category = item.category as FillerCategory;
    const categoryCount = categoryCounts.get(category) ?? 0;
    if (categoryCount >= itemsPerCategory) continue;
    categoryCounts.set(category, categoryCount + 1);
    items.push({
      category,
      title,
      body,
      eyebrow,
      callToAction: boundedText(item.callToAction, 120) || null,
      sourceName,
      sourceUrl,
      theme: item.theme as FillerTheme,
      durationSeconds: Number.isFinite(duration) ? Math.max(8, Math.min(20, Math.round(duration))) : 12,
      validUntil: boundedText(item.validUntil, 40) || null,
      artworkSearchQuery: boundedText(item.artworkSearchQuery, 120) || null,
      visualTemplate: item.visualTemplate as FillerVisualTemplate,
      locationLabel: boundedText(item.locationLabel, 100) || null,
      artwork: null,
    });
  }

  return items;
}

function zonedDateTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number },
  timeZone: string,
) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const renderedAsUtc = Date.UTC(
      Number(rendered.year),
      Number(rendered.month) - 1,
      Number(rendered.day),
      Number(rendered.hour),
    );
    guess += target - renderedAsUtc;
  }
  return new Date(guess);
}

function nextEasternMidnight(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const rendered = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const tomorrow = new Date(Date.UTC(Number(rendered.year), Number(rendered.month) - 1, Number(rendered.day) + 1));
  return zonedDateTimeToUtc({
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate(),
  }, "America/New_York");
}

function expiryFor(item: GeneratedFillerItem, now: Date) {
  if (item.category === "on_this_day") return nextEasternMidnight(now);
  if (item.category === "event" && item.validUntil) {
    const eventExpiry = new Date(item.validUntil);
    const maxEventWindow = now.getTime() + 21 * 24 * 60 * 60 * 1_000;
    if (Number.isFinite(eventExpiry.getTime()) && eventExpiry > now && eventExpiry.getTime() <= maxEventWindow) {
      return eventExpiry;
    }
  }
  const hours = item.category === "weather"
    ? 4
    : item.category === "news"
      ? 48
      : item.category === "event"
        ? 7 * 24
        : 90 * 24;
  return new Date(now.getTime() + hours * 60 * 60 * 1_000);
}

function fingerprint(market: string, item: GeneratedFillerItem) {
  return createHash("sha256")
    .update(`${market}|${item.category}|${item.title}|${item.body}`.toLowerCase())
    .digest("hex");
}

async function recentAutomaticTitles(market: string) {
  const rows = await getDatabase()
    .select({ title: generatedContent.title })
    .from(generatedContent)
    .where(eq(generatedContent.market, market))
    .orderBy(desc(generatedContent.createdAt))
    .limit(80);
  return rows.map((row) => row.title).filter(Boolean);
}

async function requestMarketBatch(
  market: string,
  categories: readonly FillerCategory[],
  itemsPerCategory: number,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_FILLER_MODEL?.trim() || "gpt-5.6-luna";
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    dateStyle: "full",
  }).format(new Date());
  const recentTitles = await recentAutomaticTitles(market);
  const localSubjects = localSubjectPrompt(categories);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      store: false,
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      instructions: [
        "Create concise, family-safe digital-signage filler for NeuseCast in Eastern North Carolina.",
        "Every item must be factually supported by a live web source you actually consulted.",
        "Prefer official government, museum, library, tourism, weather, venue, and established local-news sources.",
        "Do not invent events, dates, weather, statistics, quotations, businesses, or URLs.",
        "For an event, use one occurring within the next 14 days and set validUntil to its end time as ISO 8601 with a numeric timezone offset. Set validUntil to null for every other category.",
        "For every item, make a serious attempt to provide a short artworkSearchQuery for an exact real public place, public building, landmark, landscape, historical artifact, or publicly displayed object directly connected to the card. Use the actual event venue for community events. Include New Bern, Craven County, or North Carolina when it improves accuracy. Set it to null only when no honest, non-misleading visual subject exists.",
        "For news involving a death, injury, arrest, charge, victim, missing person, crash, shooting, private residence, or active investigation, always set artworkSearchQuery to null. Never request a mugshot, victim, suspect, accident scene, private person, private home, publisher photo, logo, poster, or copyrighted news image.",
        "Choose visualTemplate from editorial_split, photo_feature, place_card, archival, and fact_reveal. Use place_card for recognizable destinations, archival for historical subjects, photo_feature for scenic places, fact_reveal for surprising facts, and editorial_split otherwise.",
        "Set locationLabel to the specific city, landmark, river, neighborhood, or county when relevant, otherwise null.",
        "Avoid generic national trivia. Favor New Bern first, then Craven County, the Neuse and Trent rivers, and the surrounding Eastern North Carolina region.",
        "Do not repeat or lightly rephrase any recent headline supplied in the request.",
        "Write for a television glance: one short headline and no more than two short body sentences.",
        `Return exactly ${itemsPerCategory} distinct item${itemsPerCategory === 1 ? "" : "s"} in every requested category.`,
      ].join(" "),
      input: `Today is ${today}. Research and create sourced cards for ${market}, North Carolina and the surrounding Eastern North Carolina region in these categories: ${categories.join(", ")}. Use a directly supporting source URL for each card. Use the following curated New Bern subjects when they fit, while varying the selections between batches: ${localSubjects || "none supplied"}. Recent headlines that must not be repeated: ${recentTitles.length ? recentTitles.join(" | ") : "none yet"}.`,
      text: {
        format: {
          type: "json_schema",
          name: "neusecast_filler_batch",
          strict: true,
          schema: fillerResponseSchema(categories, itemsPerCategory),
        },
      },
      max_output_tokens: 12_000,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const payload = await response.json().catch(() => null) as OpenAIResponse | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error?.message || `OpenAI returned ${response.status}.`);
  }
  const text = responseText(payload);
  if (!text) throw new Error("OpenAI returned no filler content.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenAI returned filler content that could not be parsed.");
  }
  const items = validateItems(parsed, citedUrls(payload), categories, itemsPerCategory);
  return attachArtwork(items, market);
}

async function saveMarketBatch(market: string, items: GeneratedFillerItem[]) {
  const database = getDatabase();
  const now = new Date();
  const existing = await database
    .select({
      id: generatedContent.id,
      category: generatedContent.category,
      approved: generatedContent.approved,
      expiresAt: generatedContent.expiresAt,
      artworkUrl: generatedContent.artworkUrl,
      metadata: generatedContent.metadata,
    })
    .from(generatedContent)
    .where(eq(generatedContent.market, market));
  const existingByFingerprint = new Map(existing.map((row) => {
    const value = row.metadata?.fingerprint;
    return [typeof value === "string" ? value : "", row] as const;
  }).filter(([fingerprint]) => Boolean(fingerprint)));
  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const itemFingerprint = fingerprint(market, item);
    const matching = existingByFingerprint.get(itemFingerprint);
    if (matching) {
      const retainedArtwork = item.artwork ?? storedAutomaticArtwork(matching.artworkUrl, matching.metadata);
      const visualTemplate = safeFillerVisualTemplate(
        item.category,
        item.visualTemplate,
        Boolean(retainedArtwork),
      );
      const refresh = database
        .update(generatedContent)
        .set({
          category: item.category,
          title: item.title,
          body: item.body,
          sourceName: item.sourceName,
          sourceUrl: item.sourceUrl,
          artworkUrl: retainedArtwork?.url ?? null,
          startsAt: now,
          expiresAt: expiryFor(item, now),
          approved: true,
          metadata: {
            ...(matching.metadata ?? {}),
            origin: "automatic",
            provider: "openai_web_search",
            fingerprint: itemFingerprint,
            eyebrow: item.eyebrow,
            callToAction: item.callToAction,
            theme: item.theme,
            durationSeconds: item.durationSeconds,
            generatedAt: now.toISOString(),
            validUntil: item.validUntil,
            artworkSearchQuery: item.artworkSearchQuery,
            artworkCredit: retainedArtwork?.credit ?? null,
            artworkLicense: retainedArtwork?.license ?? null,
            artworkSourceUrl: retainedArtwork?.sourceUrl ?? null,
            visualTemplate,
            locationLabel: item.locationLabel,
          },
          updatedAt: now,
        })
        .where(eq(generatedContent.id, matching.id));
      await refresh;
      skipped += 1;
      continue;
    }
    const visualTemplate = safeFillerVisualTemplate(
      item.category,
      item.visualTemplate,
      Boolean(item.artwork),
    );
    const insert = database.insert(generatedContent).values({
      category: item.category,
      market,
      title: item.title,
      body: item.body,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      artworkUrl: item.artwork?.url ?? null,
      startsAt: now,
      expiresAt: expiryFor(item, now),
      approved: true,
      metadata: {
        origin: "automatic",
        provider: "openai_web_search",
        fingerprint: itemFingerprint,
        eyebrow: item.eyebrow,
        callToAction: item.callToAction,
        theme: item.theme,
        durationSeconds: item.durationSeconds,
        generatedAt: now.toISOString(),
        validUntil: item.validUntil,
        artworkSearchQuery: item.artworkSearchQuery,
        artworkCredit: item.artwork?.credit ?? null,
        artworkLicense: item.artwork?.license ?? null,
        artworkSourceUrl: item.artwork?.sourceUrl ?? null,
        visualTemplate,
        locationLabel: item.locationLabel,
      },
    });
    await insert;
    existingByFingerprint.set(itemFingerprint, {
      id: "",
      category: item.category,
      approved: true,
      expiresAt: expiryFor(item, now),
      artworkUrl: item.artwork?.url ?? null,
      metadata: {
        origin: "automatic",
        fingerprint: itemFingerprint,
        artworkCredit: item.artwork?.credit ?? null,
        artworkLicense: item.artwork?.license ?? null,
        artworkSourceUrl: item.artwork?.sourceUrl ?? null,
        visualTemplate,
        locationLabel: item.locationLabel,
      },
    });
    created += 1;
  }

  const cleanupBefore = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000);
  const staleIds = existing
    .filter((row) => (
      !row.approved
      && row.metadata?.origin === "automatic"
      && row.expiresAt
      && row.expiresAt < cleanupBefore
    ))
    .map((row) => row.id);
  if (staleIds.length) {
    await database.delete(generatedContent).where(inArray(generatedContent.id, staleIds));
  }

  return { created, skipped };
}

export async function activeFillerMarkets() {
  const rows = await getDatabase()
    .selectDistinct({ market: venues.market })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .where(eq(screens.active, true));
  return rows.map((row) => row.market.trim()).filter(Boolean);
}

export async function generateAutomaticFiller(
  markets?: string[],
  categories: readonly FillerCategory[] = AUTOMATIC_FILLER_CATEGORIES,
  itemsPerCategory = 1,
): Promise<FillerGenerationResult> {
  const requestedMarkets = (markets?.length ? markets : await activeFillerMarkets())
    .map((market) => market.trim().slice(0, 100))
    .filter(Boolean);
  const uniqueMarkets = [...new Set(requestedMarkets)];
  const requestedCategories = [...new Set(categories)].filter((category) => FILLER_CATEGORIES.includes(category));
  const requestedItemCount = Math.max(1, Math.min(3, Math.round(itemsPerCategory)));
  const result: FillerGenerationResult = { markets: uniqueMarkets.length, created: 0, skipped: 0, errors: [] };
  if (requestedCategories.length === 0) return result;

  const generateMarket = async (market: string) => {
    try {
      const items = await requestMarketBatch(market, requestedCategories, requestedItemCount);
      const missing = requestedCategories.filter((category) => (
        items.filter((item) => item.category === category).length < requestedItemCount
      ));
      const saved = await saveMarketBatch(market, items);
      return {
        ...saved,
        errors: missing.length
          ? [`${market}: rejected ${missing.length} unsourced or missing categor${missing.length === 1 ? "y" : "ies"}.`]
          : [],
      };
    } catch (error) {
      return {
        created: 0,
        skipped: 0,
        errors: [`${market}: ${error instanceof Error ? error.message : "Generation failed."}`],
      };
    }
  };

  const marketResults: Array<{ created: number; skipped: number; errors: string[] }> = [];
  let nextMarketIndex = 0;
  const workerCount = Math.min(3, uniqueMarkets.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextMarketIndex < uniqueMarkets.length) {
      const marketIndex = nextMarketIndex;
      nextMarketIndex += 1;
      marketResults[marketIndex] = await generateMarket(uniqueMarkets[marketIndex]);
    }
  }));

  for (const marketResult of marketResults) {
    result.created += marketResult.created;
    result.skipped += marketResult.skipped;
    result.errors.push(...marketResult.errors);
  }

  return result;
}
