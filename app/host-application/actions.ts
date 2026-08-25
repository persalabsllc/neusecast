"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { hostProspectActivities, hostProspects } from "@/lib/db/schema";

const NOTIFICATION_EMAIL = "kyle@neusecast.com";
const PUBLIC_APPLICATION_ACTOR = "public-host-application";

function value(formData: FormData, key: string, max = 500) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendApplicationNotification(application: {
  eventId: string;
  businessName: string;
  venueType: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  dailyVisitors: string;
  notes: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const sendingDomain = process.env.RESEND_EMAIL_DOMAIN;
  const from = process.env.RESEND_FROM_EMAIL
    ?? (sendingDomain ? `NeuseCast <applications@${sendingDomain}>` : undefined);
  if (!apiKey || !from) return false;

  const rows = [
    ["Business", application.businessName],
    ["Venue type", application.venueType],
    ["Contact", application.contactName],
    ["Email", application.email],
    ["Phone", application.phone],
    ["Location", application.address],
    ["Website", application.website || "Not provided"],
    ["Estimated daily visitors", application.dailyVisitors],
    ["Placement notes", application.notes || "None provided"],
  ];
  const htmlRows = rows.map(([label, entry]) => `<tr><td style="padding:8px 14px 8px 0;color:#607277;vertical-align:top"><strong>${escapeHtml(label)}</strong></td><td style="padding:8px 0;color:#10242a">${escapeHtml(entry)}</td></tr>`).join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `host-application-${application.eventId}`,
    },
    body: JSON.stringify({
      from,
      to: [NOTIFICATION_EMAIL],
      reply_to: application.email,
      subject: `New NeuseCast host application · ${application.businessName}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:28px"><p style="color:#20bda4;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">New host application</p><h1 style="color:#10242a;margin:8px 0 12px">${escapeHtml(application.businessName)} wants to host a screen.</h1><p style="color:#607277;line-height:1.6">This application was submitted through NeuseCast.com. Reply to this email to contact ${escapeHtml(application.contactName)} directly.</p><table style="width:100%;margin-top:22px;border-collapse:collapse">${htmlRows}</table></div>`,
    }),
  });
  return response.ok;
}

export async function submitHostApplication(formData: FormData) {
  // Honeypot submissions receive the normal success redirect without creating
  // records or email, which gives simple bots no feedback to optimize against.
  if (value(formData, "faxNumber", 100)) redirect("/?hostApplication=received#hosts");

  const businessName = value(formData, "businessName", 200);
  const venueType = value(formData, "venueType", 80);
  const contactName = value(formData, "contactName", 160);
  const email = value(formData, "email", 320).toLowerCase();
  const phone = value(formData, "phone", 40);
  const addressLine1 = value(formData, "addressLine1", 200);
  const city = value(formData, "city", 100);
  const state = value(formData, "state", 2).toUpperCase() || "NC";
  const postalCode = value(formData, "postalCode", 12);
  const websiteUrl = value(formData, "websiteUrl", 500);
  const dailyVisitors = value(formData, "dailyVisitors", 80);
  const notes = value(formData, "notes", 1500);
  const acknowledged = value(formData, "acknowledged", 5) === "yes";
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!businessName || !venueType || !contactName || !emailValid || !phone || !addressLine1 || !city || !postalCode || !dailyVisitors || !acknowledged) {
    redirect("/?hostApplication=error#hosts");
  }

  const database = getDatabase();
  const now = new Date();
  const [recent] = await database
    .select({ updatedAt: hostProspects.updatedAt })
    .from(hostProspects)
    .where(eq(hostProspects.email, email))
    .limit(1);
  if (recent && now.getTime() - recent.updatedAt.getTime() < 2 * 60 * 1000) {
    redirect("/?hostApplication=received#hosts");
  }

  const applicationNotes = [
    "Inbound application submitted at NeuseCast.com.",
    `Estimated daily visitors: ${dailyVisitors}.`,
    notes ? `Applicant notes: ${notes}` : "",
  ].filter(Boolean).join("\n");
  const [prospect] = await database
    .insert(hostProspects)
    .values({
      businessName,
      venueType,
      addressLine1,
      city,
      state,
      postalCode,
      market: city,
      websiteUrl: websiteUrl || null,
      contactName,
      email,
      phone,
      emailVerified: false,
      fitAngle: "Inbound venue application requesting a NeuseCast screen.",
      priority: "high",
      status: "replied",
      lastRepliedAt: now,
      nextAction: "Review inbound host application and contact applicant",
      nextActionAt: now,
      createdByClerkUserId: PUBLIC_APPLICATION_ACTOR,
      notes: applicationNotes,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: hostProspects.email,
      set: {
        businessName,
        venueType,
        addressLine1,
        city,
        state,
        postalCode,
        market: city,
        websiteUrl: websiteUrl || null,
        contactName,
        phone,
        fitAngle: "Inbound venue application requesting a NeuseCast screen.",
        priority: "high",
        status: "replied",
        lastRepliedAt: now,
        nextAction: "Review inbound host application and contact applicant",
        nextActionAt: now,
        notes: applicationNotes,
        updatedAt: now,
      },
    })
    .returning({ id: hostProspects.id });

  const eventId = randomUUID();
  const notificationSent = await sendApplicationNotification({
    eventId,
    businessName,
    venueType,
    contactName,
    email,
    phone,
    address: `${addressLine1}, ${city}, ${state} ${postalCode}`,
    website: websiteUrl,
    dailyVisitors,
    notes,
  }).catch(() => false);

  await database.insert(hostProspectActivities).values({
    id: eventId,
    prospectId: prospect.id,
    activityType: "note",
    deliveryStatus: notificationSent ? "sent" : "failed",
    direction: "inbound",
    channel: "website_form",
    subject: "Host screen application",
    body: applicationNotes,
    occurredAt: now,
    createdByClerkUserId: PUBLIC_APPLICATION_ACTOR,
    metadata: { source: "public_host_application", notificationEmail: NOTIFICATION_EMAIL, notificationSent },
  });

  redirect("/?hostApplication=received#hosts");
}
