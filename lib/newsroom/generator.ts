import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import {
  newsroomEditions,
  newsroomSources,
  newsroomStories,
  screens,
  venues,
  type NewsroomStoryPackage,
} from "@/lib/db/schema";
import { findEditorialArtwork, type EditorialArtwork } from "@/lib/filler/artwork";
import {
  NEWSROOM_CATEGORIES,
  NEWSROOM_VISUAL_TEMPLATES,
  type NewsroomCategory,
  type NewsroomRiskLevel,
  type NewsroomSlot,
  type NewsroomVisualTemplate,
} from "./types";
import {
  DEFAULT_NEWSROOM_SOURCES,
  newsroomSourceForUrl,
  newsroomSourcePrompt,
} from "./sources";

type GeneratedStory = {
  category: NewsroomCategory;
  headline: string;
  summary: string;
  narration: string;
  ticker: string;
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  locationLabel: string | null;
  riskLevel: NewsroomRiskLevel;
  durationSeconds: number;
  visualTemplate: NewsroomVisualTemplate;
  artworkSearchQuery: string | null;
  artwork: EditorialArtwork | null;
};

type OpenAIResponse = {
  output?: Array<{
    action?: { sources?: Array<{ url?: string }> };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string }>;
    }>;
  }>;
  error?: { message?: string };
};

export type NewsroomGenerationResult = {
  editionId: string | null;
  market: string;
  slot: NewsroomSlot;
  createdStories: number;
  autoApprovedStories: number;
  reviewStories: number;
  published: boolean;
  skipped: boolean;
  error: string | null;
};

const STORY_TARGET = 8;
const MINIMUM_AIRABLE_STORIES = 4;
const SENSITIVE_PATTERN = /\b(?:arrest|charged|citation|cited|shooting|fire|injur|killed|dead|death|missing|suspect|police|sheriff|crime|felony|misdemeanor|crash|collision|election|candidate|campaign)\b/iu;
const CRITICAL_PATTERN = /\b(?:minor|child|juvenile|sexual|abuse|rape|murder|homicide|accusation|allegation|investigation into)\b/iu;

function responseSchema() {
  return {
    type: "object",
    properties: {
      stories: {
        type: "array",
        minItems: 6,
        maxItems: 9,
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: NEWSROOM_CATEGORIES },
            headline: { type: "string", minLength: 1, maxLength: 180 },
            summary: { type: "string", minLength: 1, maxLength: 420 },
            narration: { type: "string", minLength: 1, maxLength: 850 },
            ticker: { type: "string", minLength: 1, maxLength: 300 },
            sourceName: { type: "string", minLength: 1, maxLength: 180 },
            sourceUrl: { type: "string", minLength: 8, maxLength: 2_000 },
            sourcePublishedAt: { type: ["string", "null"], maxLength: 40 },
            locationLabel: { type: ["string", "null"], maxLength: 120 },
            riskLevel: { type: "string", enum: ["low", "sensitive", "critical"] },
            durationSeconds: { type: "integer", minimum: 20, maximum: 38 },
            visualTemplate: { type: "string", enum: NEWSROOM_VISUAL_TEMPLATES },
            artworkSearchQuery: { type: ["string", "null"], maxLength: 140 },
          },
          required: [
            "category",
            "headline",
            "summary",
            "narration",
            "ticker",
            "sourceName",
            "sourceUrl",
            "sourcePublishedAt",
            "locationLabel",
            "riskLevel",
            "durationSeconds",
            "visualTemplate",
            "artworkSearchQuery",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["stories"],
    additionalProperties: false,
  } as const;
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
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
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid|gclid)/u.test(key)) url.searchParams.delete(key);
    }
    return `${url.origin}${url.pathname.replace(/\/$/u, "")}${url.search}`.toLowerCase();
  } catch {
    return "";
  }
}

function isCited(sourceUrl: string, citations: Set<string>) {
  const comparable = comparableUrl(sourceUrl);
  if (!comparable) return false;
  return [...citations].some((citation) => {
    const candidate = comparableUrl(citation);
    return candidate === comparable || candidate.startsWith(`${comparable}?`) || comparable.startsWith(`${candidate}?`);
  });
}

function riskForStory(story: Pick<GeneratedStory, "category" | "headline" | "summary" | "narration" | "riskLevel">): NewsroomRiskLevel {
  const text = `${story.headline} ${story.summary} ${story.narration}`;
  if (CRITICAL_PATTERN.test(text)) return "critical";
  if (story.category === "public_safety" || story.category === "elections" || SENSITIVE_PATTERN.test(text)) return "sensitive";
  return story.riskLevel;
}

function parseStories(value: unknown, citations: Set<string>) {
  if (!value || typeof value !== "object" || !Array.isArray((value as { stories?: unknown }).stories)) return [];
  const allowedCategories = new Set<string>(NEWSROOM_CATEGORIES);
  const allowedTemplates = new Set<string>(NEWSROOM_VISUAL_TEMPLATES);
  const seen = new Set<string>();
  const stories: GeneratedStory[] = [];

  for (const raw of (value as { stories: unknown[] }).stories) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const category = cleanText(item.category, 40) as NewsroomCategory;
    const sourceUrl = cleanText(item.sourceUrl, 2_000);
    const headline = cleanText(item.headline, 180);
    const summary = cleanText(item.summary, 420);
    const narration = cleanText(item.narration, 850);
    const ticker = cleanText(item.ticker, 300);
    const sourceName = cleanText(item.sourceName, 180);
    const visualTemplate = cleanText(item.visualTemplate, 40) as NewsroomVisualTemplate;
    if (
      !allowedCategories.has(category)
      || !allowedTemplates.has(visualTemplate)
      || !headline
      || !summary
      || !narration
      || !ticker
      || !sourceName
      || !newsroomSourceForUrl(sourceUrl)
      || !isCited(sourceUrl, citations)
    ) continue;
    const fingerprint = createHash("sha256").update(`${sourceUrl}|${headline}`.toLowerCase()).digest("hex");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const duration = Number(item.durationSeconds);
    const riskValue = cleanText(item.riskLevel, 20);
    const baseRisk: NewsroomRiskLevel = riskValue === "critical" || riskValue === "sensitive" ? riskValue : "low";
    const story: GeneratedStory = {
      category,
      headline,
      summary,
      narration,
      ticker,
      sourceName,
      sourceUrl,
      sourcePublishedAt: cleanText(item.sourcePublishedAt, 40) || null,
      locationLabel: cleanText(item.locationLabel, 120) || null,
      riskLevel: baseRisk,
      durationSeconds: Number.isFinite(duration) ? Math.max(20, Math.min(38, Math.round(duration))) : 26,
      visualTemplate,
      artworkSearchQuery: cleanText(item.artworkSearchQuery, 140) || null,
      artwork: null,
    };
    story.riskLevel = riskForStory(story);
    stories.push(story);
  }
  return stories.slice(0, 9);
}

function easternDateParts(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function easternDayKey(now: Date) {
  const { year, month, day } = easternDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function editionLabel(slot: NewsroomSlot, now: Date) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(now);
  const slotLabel = slot === "morning" ? "Morning Edition" : slot === "afternoon" ? "Afternoon Update" : slot === "breaking" ? "Breaking News" : "News Update";
  return `${slotLabel} · ${date}`;
}

function safePublishedAt(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const now = Date.now();
  if (timestamp.getTime() > now + 30 * 24 * 60 * 60 * 1_000 || timestamp.getTime() < now - 365 * 24 * 60 * 60 * 1_000) return null;
  return timestamp;
}

function storyFingerprint(market: string, story: GeneratedStory) {
  return createHash("sha256")
    .update(`${market}|${story.sourceUrl}|${story.headline}|${story.summary}`.toLowerCase())
    .digest("hex");
}

function normalizeStoryPackages(stories: NewsroomStoryPackage[]) {
  const packages = stories.map((story) => ({ ...story }));
  const fixedSeconds = 8 + 18 + 10;
  let duration = fixedSeconds + packages.reduce((sum, story) => sum + story.durationSeconds, 0);
  let cursor = 0;
  while (duration < 180 && packages.length) {
    const story = packages[cursor % packages.length];
    if (story.durationSeconds < 42) {
      story.durationSeconds += 1;
      duration += 1;
    }
    cursor += 1;
    if (cursor > 1_000) break;
  }
  return { stories: packages, durationSeconds: Math.max(180, Math.min(300, duration)) };
}

export async function ensureNewsroomSources() {
  const database = getDatabase();
  await database.insert(newsroomSources).values(DEFAULT_NEWSROOM_SOURCES.map((source) => ({
    name: source.name,
    homepageUrl: source.homepageUrl,
    sourceType: source.sourceType,
    trustTier: source.trustTier,
    attributionLabel: source.attributionLabel,
    mediaPolicy: source.mediaPolicy,
    market: source.trustTier === "primary" && /new bern|craven/iu.test(source.name) ? "Eastern North Carolina" : null,
    metadata: { configuredBy: "neusecast_newsroom", ingestMode: "openai_web_search" },
  }))).onConflictDoNothing();
  return database.select().from(newsroomSources).where(eq(newsroomSources.active, true));
}

export async function rebuildNewsroomEdition(
  editionId: string,
  options: { publish?: boolean; approvedByClerkUserId?: string | null; preservePublished?: boolean } = {},
) {
  const database = getDatabase();
  const [edition] = await database.select().from(newsroomEditions).where(eq(newsroomEditions.id, editionId)).limit(1);
  if (!edition) return null;
  const rows = await database
    .select()
    .from(newsroomStories)
    .where(and(eq(newsroomStories.editionId, editionId), eq(newsroomStories.status, "approved")))
    .orderBy(newsroomStories.createdAt);
  const packages = rows.map((story): NewsroomStoryPackage => ({
    id: story.id,
    category: story.category,
    headline: story.headline,
    summary: story.summary,
    narration: story.narration,
    ticker: story.ticker,
    sourceName: story.sourceName,
    sourceUrl: story.sourceUrl,
    sourcePublishedAt: story.sourcePublishedAt?.toISOString() ?? null,
    locationLabel: story.locationLabel,
    imageUrl: story.imageUrl,
    imageCredit: story.imageCredit,
    imageSourceUrl: story.imageSourceUrl,
    riskLevel: story.riskLevel,
    durationSeconds: story.durationSeconds,
    visualTemplate: story.visualTemplate,
  }));
  const normalized = normalizeStoryPackages(packages);
  const publish = options.publish === true || (options.preservePublished !== false && edition.status === "published");
  const now = new Date();
  const sourceHash = createHash("sha256").update(JSON.stringify(normalized.stories.map((story) => [story.id, story.headline, story.summary]))).digest("hex");
  const [updated] = await database
    .update(newsroomEditions)
    .set({
      headline: normalized.stories[0]?.headline ?? edition.headline,
      stories: normalized.stories,
      script: normalized.stories.map((story) => story.narration).join("\n\n"),
      ticker: normalized.stories.map((story) => story.ticker).join("     •     "),
      durationSeconds: normalized.durationSeconds,
      sourceHash,
      status: publish && normalized.stories.length >= MINIMUM_AIRABLE_STORIES ? "published" : "review",
      publishedAt: publish && normalized.stories.length >= MINIMUM_AIRABLE_STORIES ? now : edition.publishedAt,
      approvedByClerkUserId: options.approvedByClerkUserId ?? edition.approvedByClerkUserId,
      revision: edition.revision + 1,
      updatedAt: now,
    })
    .where(eq(newsroomEditions.id, editionId))
    .returning();
  return updated;
}

async function recentStoryContext(market: string) {
  const rows = await getDatabase()
    .select({ headline: newsroomStories.headline, sourceUrl: newsroomStories.sourceUrl, updatedAt: newsroomStories.updatedAt })
    .from(newsroomStories)
    .where(and(eq(newsroomStories.market, market), gte(newsroomStories.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000))))
    .orderBy(desc(newsroomStories.createdAt))
    .limit(40);
  return rows.map((row) => `${row.headline} (${row.sourceUrl}; last used ${row.updatedAt.toISOString()})`);
}

async function requestStories(market: string, slot: NewsroomSlot) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_NEWSROOM_MODEL?.trim() || process.env.OPENAI_FILLER_MODEL?.trim() || "gpt-5.6-luna";
  const now = new Date();
  const recent = await recentStoryContext(market);
  const editionName = slot === "morning" ? "morning edition" : slot === "afternoon" ? "afternoon update" : "news update";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      store: false,
      tools: [{ type: "web_search", search_context_size: "high" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      instructions: [
        "You are the assignment editor for NeuseCast Newsroom, a neutral hyperlocal television service in Eastern North Carolina.",
        `Build one ${editionName} containing ${STORY_TARGET} concise, materially useful stories for ${market} and the New Bern/Craven County region.`,
        "Search current sources and use only the supplied approved source domains. Prefer original government records, agendas, minutes, election data, school notices, public safety releases, road information, and weather data. Use local publishers to discover or corroborate facts, never copy their wording.",
        "Every story must use one directly supporting URL you actually consulted and that URL must appear in the web-search citations. Do not invent URLs, facts, quotations, vote totals, allegations, dates, arrests, charges, events, or weather.",
        "Never quote a person unless the exact quotation appears in the cited source. Prefer paraphrase. Never infer motive or guilt.",
        "For arrests or charges, use alleged/charged/arrested language, state that a charge is not a conviction in the narration, omit home addresses and mugshots, and classify the story sensitive. Exclude minors and sexual-offense details entirely.",
        "Classify elections, candidate disputes, allegations, deaths, serious injuries, fires with victims, and named criminal accusations as sensitive or critical. These items require human review and must be written neutrally.",
        "Use low risk only for routine government actions, meeting notices, school operations, roads, public weather, business openings, and community information without allegations or named criminal defendants.",
        "Keep the headline under 12 words. Summary is one or two on-screen sentences. Narration should be 55 to 90 words and understandable without audio because the summary will also be captioned. Ticker is one clean sentence.",
        "Select varied visual templates. Use map for location-driven stories, civic for meetings and votes, numbers for election or budget data, photo only for non-sensitive places with a commercially reusable image likely available, lead for the strongest story, and headline otherwise.",
        "Set artworkSearchQuery only for a real public place, government building, roadway, school exterior, landscape, or landmark. Never request a victim, suspect, arrest, mugshot, private residence, accident scene, or copyrighted news image.",
        "Do not repeat an earlier story unless the current source contains a material update. When news is light, favor upcoming public meetings, road work, school decisions, public deadlines, civic projects, and community events instead of padding or rewriting old facts.",
      ].join(" "),
      input: [
        `Current time: ${now.toISOString()}. Market: ${market}. Edition slot: ${slot}.`,
        `Approved sources: ${newsroomSourcePrompt()}.`,
        `Stories used in the last seven days: ${recent.length ? recent.join(" | ") : "none yet"}.`,
      ].join("\n"),
      text: { format: { type: "json_schema", name: "neusecast_newsroom_edition", strict: true, schema: responseSchema() } },
      max_output_tokens: 18_000,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json().catch(() => null) as OpenAIResponse | null;
  if (!response.ok || !payload) throw new Error(payload?.error?.message || `OpenAI returned ${response.status}.`);
  const text = responseText(payload);
  if (!text) throw new Error("OpenAI returned no newsroom rundown.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The newsroom rundown could not be parsed.");
  }
  const stories = parseStories(parsed, citedUrls(payload));
  if (stories.length < MINIMUM_AIRABLE_STORIES) throw new Error("Fewer than four verified stories survived source and safety checks.");
  return Promise.all(stories.map(async (story) => ({
    ...story,
    artwork: story.artworkSearchQuery
      ? await findEditorialArtwork(story.artworkSearchQuery).catch(() => null)
      : null,
  })));
}

export async function generateNewsroomEdition({
  market,
  slot,
  force = false,
}: {
  market: string;
  slot: NewsroomSlot;
  force?: boolean;
}): Promise<NewsroomGenerationResult> {
  const cleanMarket = market.trim().slice(0, 100);
  const result: NewsroomGenerationResult = {
    editionId: null,
    market: cleanMarket,
    slot,
    createdStories: 0,
    autoApprovedStories: 0,
    reviewStories: 0,
    published: false,
    skipped: false,
    error: null,
  };
  if (!cleanMarket) return { ...result, error: "A market is required." };
  const database = getDatabase();
  const now = new Date();
  const dayKey = easternDayKey(now);
  const recentEditionCutoff = new Date(now.getTime() - 6 * 60 * 60 * 1_000);
  if (!force) {
    const [existing] = await database
      .select({ id: newsroomEditions.id, status: newsroomEditions.status })
      .from(newsroomEditions)
      .where(and(
        eq(newsroomEditions.market, cleanMarket),
        eq(newsroomEditions.slot, slot),
        gte(newsroomEditions.createdAt, recentEditionCutoff),
      ))
      .orderBy(desc(newsroomEditions.createdAt))
      .limit(1);
    if (existing) return { ...result, editionId: existing.id, published: existing.status === "published", skipped: true };
  }

  try {
    const sourceRows = await ensureNewsroomSources();
    const sourceByHost = new Map(sourceRows.map((source) => {
      const host = new URL(source.homepageUrl).hostname.toLowerCase().replace(/^www\./u, "");
      return [host, source] as const;
    }));
    const stories = await requestStories(cleanMarket, slot);
    const expiresAt = new Date(now.getTime() + (slot === "morning" ? 18 : 20) * 60 * 60 * 1_000);
    const [edition] = await database.insert(newsroomEditions).values({
      market: cleanMarket,
      slot,
      label: editionLabel(slot, now),
      headline: stories[0]?.headline ?? "Your Eastern North Carolina update",
      status: "draft",
      scheduledAt: now,
      expiresAt,
      durationSeconds: 180,
      stories: [],
      metadata: {
        editionDay: dayKey,
        safetyPolicy: "sensitive_review_required",
        presentation: "native_broadcast_with_video_fallback",
      },
    }).returning();
    result.editionId = edition.id;
    const storyRows = stories.map((story) => {
      const sourceHost = new URL(story.sourceUrl).hostname.toLowerCase().replace(/^www\./u, "");
      const source = [...sourceByHost.entries()].find(([host]) => sourceHost === host || sourceHost.endsWith(`.${host}`))?.[1];
      const autoApproved = story.riskLevel === "low";
      if (autoApproved) result.autoApprovedStories += 1;
      else result.reviewStories += 1;
      return {
        editionId: edition.id,
        sourceId: source?.id ?? null,
        market: cleanMarket,
        category: story.category,
        headline: story.headline,
        summary: story.summary,
        narration: story.narration,
        ticker: story.ticker,
        sourceName: source?.attributionLabel ?? story.sourceName,
        sourceUrl: story.sourceUrl,
        sourcePublishedAt: safePublishedAt(story.sourcePublishedAt),
        locationLabel: story.locationLabel,
        imageUrl: story.artwork?.url ?? null,
        imageCredit: story.artwork?.credit ?? null,
        imageSourceUrl: story.artwork?.sourceUrl ?? null,
        riskLevel: story.riskLevel,
        status: autoApproved ? "approved" as const : "review" as const,
        durationSeconds: story.durationSeconds,
        visualTemplate: story.visualTemplate,
        fingerprint: storyFingerprint(cleanMarket, story),
        metadata: {
          provider: "openai_web_search",
          generatedAt: now.toISOString(),
          artworkLicense: story.artwork?.license ?? null,
          humanReviewRequired: !autoApproved,
        },
      };
    });
    await database.insert(newsroomStories).values(storyRows);
    result.createdStories = storyRows.length;
    const rebuilt = await rebuildNewsroomEdition(edition.id, { publish: result.autoApprovedStories >= MINIMUM_AIRABLE_STORIES });
    result.published = rebuilt?.status === "published";
    const usedSourceIds = storyRows.flatMap((story) => story.sourceId ? [story.sourceId] : []);
    if (usedSourceIds.length) {
      await database.update(newsroomSources).set({ lastCheckedAt: now, lastSuccessAt: now, lastError: null, updatedAt: now }).where(inArray(newsroomSources.id, usedSourceIds));
    }
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Newsroom generation failed.";
    return result;
  }
}

export async function activeNewsroomMarkets() {
  const rows = await getDatabase()
    .selectDistinct({ market: venues.market })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .where(eq(screens.active, true));
  return [...new Set(rows.map((row) => row.market.trim()).filter(Boolean))];
}

export async function generateNewsroomForActiveMarkets(slot: NewsroomSlot, force = false) {
  const markets = await activeNewsroomMarkets();
  const results: NewsroomGenerationResult[] = [];
  for (const market of markets) {
    results.push(await generateNewsroomEdition({ market, slot, force }));
  }
  return results;
}
