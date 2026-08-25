"use server";

import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { and, eq, ilike, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";
import { getDatabase } from "@/lib/db";
import { hostProspectActivities, hostProspects } from "@/lib/db/schema";
import { localDateTimeInputInZone } from "@/lib/time-zone";

const CONTROL_TIME_ZONE = "America/New_York";
type ProspectStatus = NonNullable<typeof hostProspects.$inferInsert.status>;
type ProspectPriority = NonNullable<typeof hostProspects.$inferInsert.priority>;

const prospectStatuses = new Set([
  "researching",
  "ready",
  "queued",
  "contacted",
  "follow_up",
  "replied",
  "meeting",
  "committed",
  "converted",
  "not_interested",
  "do_not_contact",
] as const);
const prospectPriorities = new Set(["high", "medium", "low"] as const);
const repliedProspectStatuses: ReadonlySet<ProspectStatus> = new Set(["replied", "meeting", "committed", "converted"]);
const suppressingProspectStatuses: ReadonlySet<ProspectStatus> = new Set([
  "replied",
  "meeting",
  "committed",
  "converted",
  "not_interested",
  "do_not_contact",
]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function value(formData: FormData, key: string, maximumLength: number) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, maximumLength) : "";
}

function recordValue(record: Record<string, unknown>, key: string, maximumLength: number) {
  const raw = record[key];
  return typeof raw === "string" ? raw.trim().slice(0, maximumLength) : "";
}

function optionalUrl(raw: string) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function prospectStatus(raw: string, fallback: ProspectStatus = "researching") {
  return prospectStatuses.has(raw as ProspectStatus) ? raw as ProspectStatus : fallback;
}

function prospectPriority(raw: string, fallback: ProspectPriority = "medium") {
  return prospectPriorities.has(raw as ProspectPriority) ? raw as ProspectPriority : fallback;
}

function followUpDate(raw: string) {
  if (!raw) return null;
  return localDateTimeInputInZone(raw, CONTROL_TIME_ZONE);
}

function defaultFollowUpDate(now = new Date()) {
  const followUp = new Date(now);
  let businessDays = 0;
  while (businessDays < 3) {
    followUp.setUTCDate(followUp.getUTCDate() + 1);
    if (followUp.getUTCDay() !== 0 && followUp.getUTCDay() !== 6) businessDays += 1;
  }
  followUp.setUTCHours(14, 0, 0, 0);
  return followUp;
}

async function requireControlUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);
  if (!user || !isControlRoomEmail(email)) throw new Error("Control Room authorization required.");
  return user;
}

export async function createHostProspect(formData: FormData) {
  const user = await requireControlUser();
  const businessName = value(formData, "businessName", 200);
  const venueType = value(formData, "venueType", 80);
  const city = value(formData, "city", 100) || "New Bern";
  const email = value(formData, "email", 320).toLowerCase();
  const emailVerified = Boolean(email) && formData.get("emailVerified") === "on";
  const websiteUrl = optionalUrl(value(formData, "websiteUrl", 2_000));
  const contactPageUrl = optionalUrl(value(formData, "contactPageUrl", 2_000));
  const researchSourceUrl = optionalUrl(value(formData, "researchSourceUrl", 2_000));
  const fitAngle = value(formData, "fitAngle", 3_000);

  if (!businessName || !venueType || !fitAngle || !researchSourceUrl || (email && !emailPattern.test(email))) {
    redirect("/control/prospects?error=required");
  }

  const database = getDatabase();
  const [duplicate] = await database
    .select({ id: hostProspects.id })
    .from(hostProspects)
    .where(or(
      and(ilike(hostProspects.businessName, businessName), ilike(hostProspects.city, city)),
      email ? eq(hostProspects.email, email) : undefined,
    ))
    .limit(1);
  if (duplicate) redirect("/control/prospects?error=duplicate");

  const prospectId = randomUUID();
  const status: ProspectStatus = emailVerified ? "ready" : "researching";
  await database.batch([
    database.insert(hostProspects).values({
      id: prospectId,
      businessName,
      venueType,
      addressLine1: value(formData, "addressLine1", 200) || null,
      city,
      state: value(formData, "state", 2).toUpperCase() || "NC",
      postalCode: value(formData, "postalCode", 12) || null,
      market: value(formData, "market", 100) || "New Bern",
      websiteUrl,
      contactPageUrl,
      researchSourceUrl,
      contactName: value(formData, "contactName", 160) || null,
      contactTitle: value(formData, "contactTitle", 120) || null,
      email: email || null,
      phone: value(formData, "phone", 40) || null,
      emailVerified,
      fitAngle,
      priority: prospectPriority(value(formData, "priority", 16)),
      status,
      nextAction: emailVerified ? "Draft personalized host invitation" : "Find a verified decision-maker email",
      createdByClerkUserId: user.id,
      notes: value(formData, "notes", 5_000) || null,
    }),
    database.insert(hostProspectActivities).values({
      id: randomUUID(),
      prospectId,
      activityType: "research",
      deliveryStatus: "completed",
      channel: "web",
      body: `Prospect added from a verified public source: ${researchSourceUrl}`,
      createdByClerkUserId: user.id,
      metadata: { researchSourceUrl, emailVerified },
    }),
  ] as const);

  revalidatePath("/control/prospects");
  redirect("/control/prospects?created=1");
}

export async function updateHostProspect(formData: FormData) {
  const user = await requireControlUser();
  const prospectId = value(formData, "prospectId", 36);
  if (!uuidPattern.test(prospectId)) redirect("/control/prospects?error=contact");
  const database = getDatabase();
  const [existing] = await database
    .select({
      status: hostProspects.status,
      optedOutAt: hostProspects.optedOutAt,
      email: hostProspects.email,
      emailVerified: hostProspects.emailVerified,
      lastRepliedAt: hostProspects.lastRepliedAt,
    })
    .from(hostProspects)
    .where(eq(hostProspects.id, prospectId))
    .limit(1);
  if (!existing) return;

  const submittedEmail = value(formData, "email", 320).toLowerCase();
  if (submittedEmail && !emailPattern.test(submittedEmail)) redirect("/control/prospects?error=contact");
  const email = existing.optedOutAt ? existing.email ?? "" : submittedEmail;
  const emailChanged = email !== (existing.email ?? "");
  const emailVerified = existing.optedOutAt
    ? existing.emailVerified
    : Boolean(email) && !emailChanged && formData.get("emailVerified") === "on";
  const websiteUrl = optionalUrl(value(formData, "websiteUrl", 2_000));
  const contactPageUrl = optionalUrl(value(formData, "contactPageUrl", 2_000));
  const researchSourceUrl = optionalUrl(value(formData, "researchSourceUrl", 2_000));
  const fitAngle = value(formData, "fitAngle", 3_000);
  if (emailVerified && (!researchSourceUrl || !fitAngle)) redirect("/control/prospects?error=contact");
  if (email && email !== existing.email) {
    const [duplicateEmail] = await database
      .select({ id: hostProspects.id })
      .from(hostProspects)
      .where(and(eq(hostProspects.email, email), ne(hostProspects.id, prospectId)))
      .limit(1);
    if (duplicateEmail) redirect("/control/prospects?error=duplicate");
  }
  const parsedStatus = prospectStatus(value(formData, "status", 32), existing.status);
  const requestedStatus = parsedStatus === "queued" && existing.status !== "queued" ? existing.status : parsedStatus;
  const contactChanged = emailChanged || emailVerified !== existing.emailVerified;
  const proposedStatus = existing.optedOutAt
    ? "do_not_contact"
    : !emailVerified && !suppressingProspectStatuses.has(requestedStatus)
      ? "researching"
    : requestedStatus === "researching" && emailVerified
      ? "ready"
      : requestedStatus;
  const status: ProspectStatus = proposedStatus === "queued" && contactChanged
    ? emailVerified ? "ready" : "researching"
    : proposedStatus;
  const now = new Date();
  const statusChanged = status !== existing.status;
  const queuedEmailMustBeCancelled = suppressingProspectStatuses.has(status)
    || contactChanged
    || (existing.status === "queued" && status !== "queued");
  const update = database
    .update(hostProspects)
    .set({
      contactName: value(formData, "contactName", 160) || null,
      contactTitle: value(formData, "contactTitle", 120) || null,
      email: email || null,
      emailVerified,
      phone: value(formData, "phone", 40) || null,
      websiteUrl,
      contactPageUrl,
      researchSourceUrl,
      fitAngle: fitAngle || null,
      status,
      priority: prospectPriority(value(formData, "priority", 16)),
      nextAction: value(formData, "nextAction", 1_000) || null,
      nextActionAt: followUpDate(value(formData, "nextActionAt", 32)),
      notes: value(formData, "notes", 5_000) || null,
      optedOutAt: status === "do_not_contact" ? existing.optedOutAt ?? now : existing.optedOutAt,
      lastRepliedAt: existing.lastRepliedAt ?? (statusChanged && repliedProspectStatuses.has(status) ? now : undefined),
      updatedAt: now,
    })
    .where(eq(hostProspects.id, prospectId));

  const cancelQueuedEmail = database
    .update(hostProspectActivities)
    .set({ deliveryStatus: "cancelled" })
    .where(and(
      eq(hostProspectActivities.prospectId, prospectId),
      eq(hostProspectActivities.activityType, "email"),
      eq(hostProspectActivities.deliveryStatus, "queued"),
    ));
  const statusActivity = database.insert(hostProspectActivities).values({
    id: randomUUID(),
    prospectId,
    activityType: status === "converted" ? "conversion" : "status_change",
    deliveryStatus: "completed",
    body: `Pipeline status changed from ${existing.status} to ${status}.`,
    createdByClerkUserId: user.id,
  });

  if (statusChanged && queuedEmailMustBeCancelled) {
    await database.batch([update, cancelQueuedEmail, statusActivity] as const);
  } else if (statusChanged) {
    await database.batch([
      update,
      statusActivity,
    ] as const);
  } else if (queuedEmailMustBeCancelled) {
    await database.batch([update, cancelQueuedEmail] as const);
  } else {
    await update;
  }

  revalidatePath("/control/prospects");
}

export async function queueHostProspectEmail(formData: FormData) {
  const user = await requireControlUser();
  const prospectId = value(formData, "prospectId", 36);
  const subject = value(formData, "subject", 240);
  const body = value(formData, "body", 10_000);
  if (!uuidPattern.test(prospectId) || !subject || !body) redirect("/control/prospects?error=queue");

  const now = new Date();
  const result = await getDatabase().execute(sql<{ prospectId: string }>`
    WITH eligible_prospect AS (
      SELECT "id", "email"
      FROM "host_prospects"
      WHERE "id" = ${prospectId}::uuid
        AND "email" IS NOT NULL
        AND "email_verified" = true
        AND "research_source_url" IS NOT NULL
        AND "fit_angle" IS NOT NULL
        AND "opted_out_at" IS NULL
        AND "status" IN ('ready'::"host_prospect_status", 'follow_up'::"host_prospect_status")
      FOR UPDATE
    ), queued_email AS (
      INSERT INTO "host_prospect_activities" (
        "id", "prospect_id", "activity_type", "delivery_status", "direction", "channel",
        "subject", "body", "occurred_at", "created_by_clerk_user_id", "metadata"
      )
      SELECT
        ${randomUUID()}::uuid, "id", 'email'::"host_prospect_activity_type",
        'queued'::"host_prospect_delivery_status", 'outbound', 'email', ${subject}, ${body}, ${now}, ${user.id},
        jsonb_build_object('recipient', "email")
      FROM eligible_prospect
      RETURNING "prospect_id"
    ), updated_prospect AS (
      UPDATE "host_prospects" AS prospects
      SET
        "status" = 'queued'::"host_prospect_status",
        "next_action" = 'Send queued host invitation from the NeuseCast Gmail account',
        "next_action_at" = ${now},
        "updated_at" = ${now}
      FROM queued_email
      WHERE prospects."id" = queued_email."prospect_id"
      RETURNING prospects."id"
    )
    SELECT "id" AS "prospectId" FROM updated_prospect
  `);
  if (!result.rows[0]) redirect("/control/prospects?error=queue");

  revalidatePath("/control/prospects");
  redirect("/control/prospects?queued=1");
}

export async function markHostProspectEmailSent(formData: FormData) {
  const user = await requireControlUser();
  const prospectId = value(formData, "prospectId", 36);
  const activityId = value(formData, "activityId", 36);
  if (!uuidPattern.test(prospectId) || !uuidPattern.test(activityId)) redirect("/control/prospects?error=queue");

  const now = new Date();
  const providerMessageId = value(formData, "providerMessageId", 255) || null;
  const providerThreadId = value(formData, "providerThreadId", 255) || null;
  const result = await getDatabase().execute(sql<{ prospectId: string }>`
    WITH eligible_email AS (
      SELECT activities."id" AS "activity_id", prospects."id" AS "prospect_id"
      FROM "host_prospects" AS prospects
      INNER JOIN "host_prospect_activities" AS activities
        ON activities."prospect_id" = prospects."id"
      WHERE prospects."id" = ${prospectId}::uuid
        AND activities."id" = ${activityId}::uuid
        AND activities."activity_type" = 'email'::"host_prospect_activity_type"
        AND activities."delivery_status" = 'queued'::"host_prospect_delivery_status"
        AND activities."metadata"->>'recipient' = prospects."email"
        AND prospects."email" IS NOT NULL
        AND prospects."email_verified" = true
        AND prospects."research_source_url" IS NOT NULL
        AND prospects."opted_out_at" IS NULL
        AND prospects."status" = 'queued'::"host_prospect_status"
      FOR UPDATE OF prospects, activities
    ), sent_email AS (
      UPDATE "host_prospect_activities" AS activities
      SET
        "delivery_status" = 'sent'::"host_prospect_delivery_status",
        "provider_message_id" = ${providerMessageId},
        "provider_thread_id" = ${providerThreadId},
        "occurred_at" = ${now}
      FROM eligible_email
      WHERE activities."id" = eligible_email."activity_id"
      RETURNING activities."prospect_id"
    ), contacted_prospect AS (
      UPDATE "host_prospects" AS prospects
      SET
        "status" = 'contacted'::"host_prospect_status",
        "last_contacted_at" = ${now},
        "next_action" = 'Follow up if there is no reply',
        "next_action_at" = ${defaultFollowUpDate(now)},
        "updated_at" = ${now}
      FROM sent_email
      WHERE prospects."id" = sent_email."prospect_id"
      RETURNING prospects."id"
    ), logged_status AS (
      INSERT INTO "host_prospect_activities" (
        "id", "prospect_id", "activity_type", "delivery_status", "body", "created_by_clerk_user_id"
      )
      SELECT
        ${randomUUID()}::uuid, "id", 'status_change'::"host_prospect_activity_type",
        'completed'::"host_prospect_delivery_status",
        'Queued outreach confirmed sent; follow-up clock started.', ${user.id}
      FROM contacted_prospect
      RETURNING "prospect_id"
    )
    SELECT "prospect_id" AS "prospectId" FROM logged_status
  `);
  if (!result.rows[0]) redirect("/control/prospects?error=queue");

  revalidatePath("/control/prospects");
  redirect("/control/prospects?sent=1");
}

export async function addHostProspectNote(formData: FormData) {
  const user = await requireControlUser();
  const prospectId = value(formData, "prospectId", 36);
  const body = value(formData, "note", 5_000);
  if (!uuidPattern.test(prospectId) || !body) return;

  await getDatabase().insert(hostProspectActivities).values({
    id: randomUUID(),
    prospectId,
    activityType: "note",
    deliveryStatus: "completed",
    body,
    createdByClerkUserId: user.id,
  });
  revalidatePath("/control/prospects");
}

export async function importHostProspectResearch(formData: FormData) {
  const user = await requireControlUser();
  const uploadedFile = formData.get("batchFile");
  let raw = value(formData, "batch", 120_000);
  if (uploadedFile instanceof File && uploadedFile.size > 0) {
    if (uploadedFile.size > 120_000) redirect("/control/prospects?error=import");
    raw = (await uploadedFile.text()).trim().slice(0, 120_000);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect("/control/prospects?error=import");
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 60) {
    redirect("/control/prospects?error=import");
  }

  const database = getDatabase();
  const existing = await database
    .select({ businessName: hostProspects.businessName, city: hostProspects.city, email: hostProspects.email })
    .from(hostProspects);
  const seen = new Set(existing.map((row) => `${row.businessName.trim().toLowerCase()}|${row.city.trim().toLowerCase()}`));
  const seenEmails = new Set(existing.flatMap((row) => row.email ? [row.email.trim().toLowerCase()] : []));
  const inserts: Array<typeof hostProspects.$inferInsert> = [];
  const activities: Array<typeof hostProspectActivities.$inferInsert> = [];
  let skipped = 0;

  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      skipped += 1;
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const businessName = recordValue(record, "businessName", 200);
    const venueType = recordValue(record, "venueType", 80);
    const city = recordValue(record, "city", 100) || "New Bern";
    const fitAngle = recordValue(record, "fitAngle", 3_000);
    const researchSourceUrl = optionalUrl(recordValue(record, "researchSourceUrl", 2_000));
    const key = `${businessName.toLowerCase()}|${city.toLowerCase()}`;
    if (!businessName || !venueType || !fitAngle || !researchSourceUrl || seen.has(key)) {
      skipped += 1;
      continue;
    }

    const email = recordValue(record, "email", 320).toLowerCase();
    const emailVerified = Boolean(email && emailPattern.test(email) && record.emailVerified === true);
    if (email && seenEmails.has(email)) {
      skipped += 1;
      continue;
    }
    const id = randomUUID();
    inserts.push({
      id,
      businessName,
      venueType,
      addressLine1: recordValue(record, "addressLine1", 200) || null,
      city,
      state: recordValue(record, "state", 2).toUpperCase() || "NC",
      postalCode: recordValue(record, "postalCode", 12) || null,
      market: recordValue(record, "market", 100) || "New Bern",
      websiteUrl: optionalUrl(recordValue(record, "websiteUrl", 2_000)),
      contactPageUrl: optionalUrl(recordValue(record, "contactPageUrl", 2_000)),
      researchSourceUrl,
      contactName: recordValue(record, "contactName", 160) || null,
      contactTitle: recordValue(record, "contactTitle", 120) || null,
      email: email || null,
      phone: recordValue(record, "phone", 40) || null,
      emailVerified,
      fitAngle,
      priority: prospectPriority(recordValue(record, "priority", 16)),
      status: emailVerified ? "ready" : "researching",
      nextAction: emailVerified ? "Draft personalized host invitation" : "Use the verified contact page",
      createdByClerkUserId: user.id,
      notes: recordValue(record, "notes", 5_000) || null,
    });
    activities.push({
      id: randomUUID(),
      prospectId: id,
      activityType: "research",
      deliveryStatus: "completed",
      channel: "web",
      body: `Imported from verified public research: ${researchSourceUrl}`,
      createdByClerkUserId: user.id,
      metadata: { researchSourceUrl, emailVerified },
    });
    seen.add(key);
    if (email) seenEmails.add(email);
  }

  if (inserts.length === 0) redirect(`/control/prospects?error=import&skipped=${skipped}`);
  await database.batch([
    database.insert(hostProspects).values(inserts),
    database.insert(hostProspectActivities).values(activities),
  ] as const);
  revalidatePath("/control/prospects");
  redirect(`/control/prospects?imported=${inserts.length}&skipped=${skipped}`);
}
