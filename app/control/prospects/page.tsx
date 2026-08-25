import Link from "next/link";
import { desc } from "drizzle-orm";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileUp,
  Mail,
  MailPlus,
  MapPin,
  MessageSquareReply,
  Plus,
  Search,
  StickyNote,
  Users,
} from "lucide-react";
import { getDatabase } from "@/lib/db";
import { hostProspectActivities, hostProspects } from "@/lib/db/schema";
import { NEUSECAST_CONTACT } from "@/lib/legal";
import {
  addHostProspectNote,
  createHostProspect,
  importHostProspectResearch,
  markHostProspectEmailSent,
  queueHostProspectEmail,
  updateHostProspect,
} from "./actions";

export const dynamic = "force-dynamic";

const statusLabels = {
  researching: "Researching",
  ready: "Ready",
  queued: "Queued",
  contacted: "Contacted",
  follow_up: "Follow-up",
  replied: "Replied",
  meeting: "Meeting",
  committed: "Committed",
  converted: "Converted",
  not_interested: "Not interested",
  do_not_contact: "Do not contact",
} as const;

const priorityLabels = {
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

type ProspectStatus = keyof typeof statusLabels;

function formatEastern(date: Date | null) {
  if (!date) return "Not scheduled";
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateTimeInputValue(date: Date | null) {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function suggestedPitch(prospect: typeof hostProspects.$inferSelect) {
  const greeting = prospect.contactName ? `Hi ${prospect.contactName.split(" ")[0]},` : `Hi ${prospect.businessName} team,`;
  return `${greeting}

I’m Kyle with NeuseCast, a new local screen network here in New Bern. ${prospect.fitAngle ?? "Your location looks like a strong fit for useful local information and venue announcements."}

We provide and mount a TV at no cost, give you a simple portal to post your own specials, events, and messages, and promote ${prospect.businessName} free across the rest of the NeuseCast network. There is no equipment charge, monthly fee, or advertising commitment—we only ask that you host the screen.

Would you be open to a quick 10-minute conversation about where it could fit in your location?

Kyle Kratoville
NeuseCast
${NEUSECAST_CONTACT.phone}
https://neusecast.com
${NEUSECAST_CONTACT.addressLine1}
${NEUSECAST_CONTACT.addressLine2}

Business solicitation from NeuseCast.
If this is not a fit, reply “no thanks” and I will not follow up.`;
}

export default async function HostProspectsPage({ searchParams }: {
  searchParams: Promise<{
    created?: string;
    queued?: string;
    sent?: string;
    imported?: string;
    skipped?: string;
    error?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const database = getDatabase();
  const [query, prospectRows, activityRows] = await Promise.all([
    searchParams,
    database.select().from(hostProspects).orderBy(desc(hostProspects.updatedAt)),
    database.select().from(hostProspectActivities).orderBy(desc(hostProspectActivities.occurredAt)),
  ]);

  const now = new Date();
  const activitiesByProspect = new Map<string, typeof activityRows>();
  for (const activity of activityRows) {
    const prospectActivities = activitiesByProspect.get(activity.prospectId) ?? [];
    prospectActivities.push(activity);
    activitiesByProspect.set(activity.prospectId, prospectActivities);
  }

  const selectedStatus = query.status && query.status in statusLabels ? query.status as ProspectStatus : "all";
  const search = query.q?.trim().toLowerCase() ?? "";
  const prospects = prospectRows.filter((prospect) => {
    if (selectedStatus !== "all" && prospect.status !== selectedStatus) return false;
    if (!search) return true;
    return [prospect.businessName, prospect.venueType, prospect.city, prospect.contactName, prospect.email]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(search));
  });

  const ready = prospectRows.filter((prospect) => prospect.emailVerified && ["ready", "queued"].includes(prospect.status)).length;
  const queued = activityRows.filter((activity) => activity.activityType === "email" && activity.deliveryStatus === "queued").length;
  const replies = prospectRows.filter((prospect) => ["replied", "meeting"].includes(prospect.status)).length;
  const won = prospectRows.filter((prospect) => ["committed", "converted"].includes(prospect.status)).length;
  const due = prospectRows.filter((prospect) => (
    prospect.nextActionAt
    && prospect.nextActionAt <= now
    && !["converted", "not_interested", "do_not_contact"].includes(prospect.status)
  )).length;

  const errorMessage = {
    required: "Business, venue type, verified research source, and a specific fit angle are required.",
    duplicate: "That business is already in the New Bern host pipeline.",
    queue: "The email could not be queued. Confirm the recipient is verified and has not opted out.",
    contact: "Enter a valid published email address, or leave the email blank.",
    import: "The research batch was invalid, empty, duplicated, or missing required source details.",
  }[query.error ?? ""];

  return (
    <div className="control-page prospect-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Host acquisition</p>
          <h1>Host prospects</h1>
          <p className="page-description">Research high-dwell New Bern locations, verify every recipient, queue personalized outreach, and track committed hosts through screen activation.</p>
        </div>
        <div className="page-actions">
          <span className="prospect-due-badge"><Clock3 size={15} /> {due} follow-up{due === 1 ? "" : "s"} due</span>
        </div>
      </header>

      <section className="metric-grid metric-grid-4" aria-label="Host prospect summary">
        <article className="metric-card"><span className="metric-icon metric-icon-blue"><Building2 size={18} /></span><div><p className="metric-label">Researched locations</p><p className="metric-value">{prospectRows.length}</p><p className="metric-detail">Verified local opportunities</p></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-green"><BadgeCheck size={18} /></span><div><p className="metric-label">Email-ready</p><p className="metric-value">{ready}</p><p className="metric-detail">Public recipient verified</p></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-gold"><Mail size={18} /></span><div><p className="metric-label">Queued outreach</p><p className="metric-value">{queued}</p><p className="metric-detail">Awaiting NeuseCast Gmail</p></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-violet"><Users size={18} /></span><div><p className="metric-label">Replies / wins</p><p className="metric-value">{replies} / {won}</p><p className="metric-detail">Live pipeline outcomes</p></div></article>
      </section>

      {query.created ? <div className="success-banner" role="status"><BadgeCheck size={18} /> Prospect added to the host pipeline.</div> : null}
      {query.queued ? <div className="success-banner" role="status"><MailPlus size={18} /> Personalized email saved in the queue. Nothing has been sent yet.</div> : null}
      {query.sent ? <div className="success-banner" role="status"><BadgeCheck size={18} /> Sent outreach recorded and the follow-up clock is running.</div> : null}
      {query.imported ? <div className="success-banner" role="status"><FileUp size={18} /> Imported {query.imported} verified prospect{query.imported === "1" ? "" : "s"}.{Number(query.skipped ?? 0) > 0 ? ` Skipped ${query.skipped} duplicate or incomplete row${query.skipped === "1" ? "" : "s"}.` : ""}</div> : null}
      {errorMessage ? <div className="form-error" role="alert">{errorMessage}</div> : null}

      <section className="prospect-create-grid">
        <details className="panel prospect-editor" open={prospectRows.length === 0 || query.error === "required"}>
          <summary><Plus size={18} /><span><strong>Add one prospect</strong><small>Require a real source and a location-specific reason</small></span><ChevronDown size={17} /></summary>
          <form action={createHostProspect} className="prospect-form">
            <label className="field"><span className="field-label">Business</span><input name="businessName" required /></label>
            <label className="field"><span className="field-label">Venue type</span><input name="venueType" placeholder="Laundromat, brewery, waiting room…" required /></label>
            <label className="field field-wide"><span className="field-label">Street address</span><input name="addressLine1" /></label>
            <label className="field"><span className="field-label">City</span><input name="city" defaultValue="New Bern" required /></label>
            <label className="field"><span className="field-label">State</span><input name="state" defaultValue="NC" maxLength={2} required /></label>
            <label className="field"><span className="field-label">ZIP</span><input name="postalCode" /></label>
            <label className="field"><span className="field-label">Market</span><input name="market" defaultValue="New Bern" required /></label>
            <label className="field"><span className="field-label">Website</span><input name="websiteUrl" type="url" placeholder="https://" /></label>
            <label className="field"><span className="field-label">Contact page</span><input name="contactPageUrl" type="url" placeholder="https://" /></label>
            <label className="field field-wide"><span className="field-label">Verified research source</span><input name="researchSourceUrl" type="url" placeholder="Official website or authoritative listing" required /><small className="field-help">Every lead must retain the page that supports the contact information.</small></label>
            <label className="field"><span className="field-label">Decision maker</span><input name="contactName" /></label>
            <label className="field"><span className="field-label">Title</span><input name="contactTitle" /></label>
            <label className="field"><span className="field-label">Public email</span><input name="email" type="email" /></label>
            <label className="field"><span className="field-label">Phone</span><input name="phone" type="tel" /></label>
            <label className="prospect-checkbox field-wide"><input name="emailVerified" type="checkbox" /><span><strong>Email is explicitly published</strong><small>Never mark inferred addresses as verified.</small></span></label>
            <label className="field"><span className="field-label">Priority</span><select name="priority" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label className="field field-wide"><span className="field-label">Why this location fits</span><textarea name="fitAngle" placeholder="Specific dwell time, audience, events, waiting area, or multi-location advantage…" required /></label>
            <label className="field field-wide"><span className="field-label">Internal notes</span><textarea name="notes" /></label>
            <button className="button button-primary field-wide" type="submit"><Plus size={17} /> Add to pipeline</button>
          </form>
        </details>

        <details className="panel prospect-editor">
          <summary><FileUp size={18} /><span><strong>Import research batch</strong><small>Up to 60 verified JSON records; duplicates are skipped</small></span><ChevronDown size={17} /></summary>
          <form action={importHostProspectResearch} className="prospect-import-form">
            <label className="field"><span className="field-label">Research JSON</span><textarea name="batch" required placeholder={'[{"businessName":"Example","venueType":"Waiting room","researchSourceUrl":"https://…","fitAngle":"Customers wait 30–60 minutes","email":"hello@example.com","emailVerified":true}]'} /></label>
            <p>Required per row: businessName, venueType, researchSourceUrl, and fitAngle. Public email addresses are accepted only when <code>emailVerified</code> is true.</p>
            <button className="button button-secondary" type="submit"><FileUp size={17} /> Validate and import</button>
          </form>
        </details>
      </section>

      <section className="panel prospect-pipeline-panel">
        <div className="panel-heading prospect-toolbar">
          <div><p className="panel-kicker">New Bern market</p><h2>Host pipeline</h2></div>
          <form className="prospect-filter-form" method="get">
            <label><span className="sr-only">Search host prospects</span><Search size={15} aria-hidden="true" /><input name="q" defaultValue={query.q ?? ""} placeholder="Business, type, contact…" /></label>
            <select name="status" defaultValue={selectedStatus} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([status, label]) => <option value={status} key={status}>{label}</option>)}
            </select>
            <button className="button button-secondary button-small" type="submit">Filter</button>
            {search || selectedStatus !== "all" ? <Link className="button button-quiet button-small" href="/control/prospects">Clear</Link> : null}
          </form>
        </div>

        <div className="prospect-list">
          {prospects.map((prospect) => {
            const activities = activitiesByProspect.get(prospect.id) ?? [];
            const isClosed = ["converted", "not_interested", "do_not_contact"].includes(prospect.status);
            const canQueueEmail = ["ready", "follow_up"].includes(prospect.status);
            const queuedEmail = activities.find((activity) => activity.activityType === "email" && activity.deliveryStatus === "queued");
            return (
              <details className={`prospect-card priority-${prospect.priority}`} key={prospect.id}>
                <summary>
                  <span className="prospect-summary-main"><span className={`status-badge status-${prospect.status}`}>{statusLabels[prospect.status]}</span><strong>{prospect.businessName}</strong><small><MapPin size={12} /> {prospect.venueType} · {prospect.city}</small></span>
                  <span className="prospect-summary-fit">{prospect.fitAngle}</span>
                  <span className="prospect-summary-contact"><strong>{prospect.contactName || "General business contact"}</strong><small>{prospect.email || "Contact page / research needed"}</small>{prospect.emailVerified ? <em><BadgeCheck size={12} /> Verified</em> : null}</span>
                  <span className="prospect-summary-next"><strong>{prospect.nextAction || "No next action"}</strong><small><CalendarClock size={12} /> {formatEastern(prospect.nextActionAt)}</small></span>
                  <ChevronDown className="prospect-card-chevron" size={18} />
                </summary>

                <div className="prospect-card-body">
                  <div className="prospect-source-strip">
                    <span><strong>{priorityLabels[prospect.priority]} priority</strong>{prospect.addressLine1 ? ` · ${prospect.addressLine1}` : ""}</span>
                    <div>
                      {prospect.websiteUrl ? <Link href={prospect.websiteUrl} target="_blank" rel="noopener noreferrer">Website <ExternalLink size={12} /></Link> : null}
                      {prospect.contactPageUrl ? <Link href={prospect.contactPageUrl} target="_blank" rel="noopener noreferrer">Contact page <ExternalLink size={12} /></Link> : null}
                      {prospect.researchSourceUrl ? <Link href={prospect.researchSourceUrl} target="_blank" rel="noopener noreferrer">Research source <ExternalLink size={12} /></Link> : null}
                    </div>
                  </div>

                  <div className="prospect-workspace-grid">
                    <form action={updateHostProspect} className="prospect-update-form">
                      <input type="hidden" name="prospectId" value={prospect.id} />
                      <div className="form-heading"><span>Pipeline control</span><h2>Outcome and next step</h2></div>
                      <label className="field"><span className="field-label">Decision maker</span><input name="contactName" defaultValue={prospect.contactName ?? ""} /></label>
                      <label className="field"><span className="field-label">Title</span><input name="contactTitle" defaultValue={prospect.contactTitle ?? ""} /></label>
                      <label className="field"><span className="field-label">Public email</span><input name="email" type="email" defaultValue={prospect.email ?? ""} /></label>
                      <label className="field"><span className="field-label">Phone</span><input name="phone" type="tel" defaultValue={prospect.phone ?? ""} /></label>
                      <label className="prospect-checkbox field-wide"><input name="emailVerified" type="checkbox" defaultChecked={prospect.emailVerified} /><span><strong>Email is explicitly published</strong><small>Changing the address clears verification; review the source and save once more to verify it.</small></span></label>
                      <label className="field"><span className="field-label">Website</span><input name="websiteUrl" type="url" defaultValue={prospect.websiteUrl ?? ""} /></label>
                      <label className="field"><span className="field-label">Contact page</span><input name="contactPageUrl" type="url" defaultValue={prospect.contactPageUrl ?? ""} /></label>
                      <label className="field field-wide"><span className="field-label">Research source</span><input name="researchSourceUrl" type="url" defaultValue={prospect.researchSourceUrl ?? ""} /></label>
                      <label className="field field-wide"><span className="field-label">Why this location fits</span><textarea name="fitAngle" defaultValue={prospect.fitAngle ?? ""} /></label>
                      <label className="field"><span className="field-label">Status</span><select name="status" defaultValue={prospect.status}>{Object.entries(statusLabels).filter(([status]) => status !== "queued" || prospect.status === "queued").map(([status, label]) => <option value={status} key={status}>{label}</option>)}</select></label>
                      <label className="field"><span className="field-label">Priority</span><select name="priority" defaultValue={prospect.priority}>{Object.entries(priorityLabels).map(([priority, label]) => <option value={priority} key={priority}>{label}</option>)}</select></label>
                      <label className="field field-wide"><span className="field-label">Next action</span><input name="nextAction" defaultValue={prospect.nextAction ?? ""} /></label>
                      <label className="field field-wide"><span className="field-label">Next action time</span><input name="nextActionAt" type="datetime-local" defaultValue={dateTimeInputValue(prospect.nextActionAt)} /></label>
                      <label className="field field-wide"><span className="field-label">Internal notes</span><textarea name="notes" defaultValue={prospect.notes ?? ""} /></label>
                      <button className="button button-secondary field-wide" type="submit">Save pipeline update</button>
                    </form>

                    <div className="prospect-outreach-card">
                      <div className="form-heading"><span>Personalized outreach</span><h2>{prospect.emailVerified ? `Email ${prospect.email}` : "Recipient not email-ready"}</h2></div>
                      {prospect.emailVerified && prospect.email && !prospect.optedOutAt && !isClosed && (canQueueEmail || queuedEmail) ? (
                        queuedEmail ? <div className="prospect-queue-state prospect-queue-review"><div className="prospect-queue-heading"><Mail size={18} /><div><strong>Approved email is queued.</strong><span>Send this exact copy from the NeuseCast Gmail account, then record it here.</span></div></div><label className="field"><span className="field-label">To</span><input readOnly value={prospect.email} /></label><label className="field"><span className="field-label">Subject</span><input readOnly value={queuedEmail.subject ?? ""} /></label><label className="field"><span className="field-label">Approved message</span><textarea readOnly value={queuedEmail.body ?? ""} /></label><form action={markHostProspectEmailSent}><input type="hidden" name="prospectId" value={prospect.id} /><input type="hidden" name="activityId" value={queuedEmail.id} /><button className="button button-secondary button-small" type="submit">Mark sent</button></form></div> :
                        <form action={queueHostProspectEmail} className="prospect-email-form">
                          <input type="hidden" name="prospectId" value={prospect.id} />
                          <label className="field"><span className="field-label">Subject</span><input name="subject" defaultValue={`Would ${prospect.businessName} host a NeuseCast screen?`} required /></label>
                          <label className="field"><span className="field-label">Message</span><textarea name="body" defaultValue={suggestedPitch(prospect)} required /></label>
                          <button className="button button-primary" type="submit"><MailPlus size={17} /> Add to sending queue</button>
                          <small>Queueing records the approved copy. It does not send until the correct Workspace mailbox is connected.</small>
                        </form>
                      ) : <div className="prospect-queue-state"><Mail size={18} /><strong>{prospect.optedOutAt || prospect.status === "do_not_contact" ? "Outreach is permanently blocked." : prospect.emailVerified && prospect.email ? "Outreach is paused at this pipeline stage." : "Find and verify a published address first."}</strong><span>{prospect.emailVerified && prospect.email ? "Move the prospect to Follow-up when a new email is appropriate." : "Use the official contact page or an authoritative local business listing—never infer an address."}</span></div>}
                    </div>
                  </div>

                  <div className="prospect-activity-section">
                    <div><span className="panel-kicker"><MessageSquareReply size={13} /> Activity</span><h3>Research and contact history</h3></div>
                    <form action={addHostProspectNote} className="prospect-note-form"><input type="hidden" name="prospectId" value={prospect.id} /><label><span className="sr-only">Add a prospect note</span><StickyNote size={15} aria-hidden="true" /><input name="note" placeholder="Add a note, objection, or reply summary…" required /></label><button className="button button-secondary button-small">Add note</button></form>
                    <div className="prospect-activity-list">
                      {activities.slice(0, 5).map((activity) => <article key={activity.id}><span className={`status-badge status-${activity.deliveryStatus}`}>{activity.activityType.replaceAll("_", " ")} · {activity.deliveryStatus}</span><strong>{activity.subject || activity.body?.slice(0, 150) || "Activity recorded"}</strong><small>{formatEastern(activity.occurredAt)}</small></article>)}
                      {activities.length === 0 ? <p>No activity recorded yet.</p> : null}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
          {prospects.length === 0 ? <div className="control-empty"><Building2 size={25} /><strong>No prospects match this view.</strong><span>Add research above or clear the current filters.</span></div> : null}
        </div>
      </section>
    </div>
  );
}
