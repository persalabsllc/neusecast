import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { UserButton } from "@clerk/nextjs";
import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, CalendarDays, Eye, Pencil, Pause, Play, ShieldBan } from "lucide-react";
import { Brand } from "@/components/brand";
import { HostComposer } from "@/components/host-composer";
import { DeleteHostContentForm } from "@/components/host-content-actions";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, hostContent, screenAdvertiserBlocks, screens, venues } from "@/lib/db/schema";
import { deleteHostContent, requireHostUser, setHostContentActive, updateHostAdvertiserBlock, updateHostContent } from "./actions";

export const metadata: Metadata = { title: "Host portal", description: "Create and schedule venue content for an assigned NeuseCast screen." };
export const dynamic = "force-dynamic";

function dateTimeInputValue(timestamp: Date | null, timeZone: string) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp).replace(" ", "T");
}

function contentState(item: { status: string; startsAt: Date | null; endsAt: Date | null }, now: Date) {
  if (item.status === "draft") return { key: "paused", label: "Paused", active: false };
  if (item.status === "rejected") return { key: "revision", label: "Removed by NeuseCast", active: false };
  if (item.endsAt && item.endsAt <= now) return { key: "expired", label: "Expired", active: false };
  if (item.startsAt && item.startsAt > now) return { key: "scheduled", label: "Scheduled", active: true };
  return { key: "airing", label: "Airing", active: true };
}

const templateLabels: Record<string, string> = {
  special: "Special",
  event: "Event",
  announcement: "Announcement",
  menu: "Menu item",
};

export default async function HostPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; contentUpdated?: string; contentDeleted?: string; contentStatus?: string; contentError?: string }> }) {
  const [user, query] = await Promise.all([requireHostUser(), searchParams]);
  const database = getDatabase();
  const assignedScreens = await database.select({ id: screens.id, name: screens.name, playerKey: screens.providerScreenId, venueName: venues.name, city: venues.city, timeZone: venues.timeZone }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)).where(and(eq(venues.hostClerkUserId, user.id), eq(screens.active, true)));
  const screenIds = assignedScreens.map((screen) => screen.id);
  const [advertisers, blocks, contentRows] = await Promise.all([
    database.select({ id: advertiserAccounts.id, businessName: advertiserAccounts.businessName }).from(advertiserAccounts).where(eq(advertiserAccounts.active, true)),
    screenIds.length ? database.select({ screenId: screenAdvertiserBlocks.screenId, advertiserAccountId: screenAdvertiserBlocks.advertiserAccountId }).from(screenAdvertiserBlocks) : Promise.resolve([]),
    screenIds.length
      ? database
        .select({
          id: hostContent.id,
          screenId: hostContent.screenId,
          headline: hostContent.headline,
          body: hostContent.body,
          callToAction: hostContent.callToAction,
          template: hostContent.template,
          status: hostContent.status,
          startsAt: hostContent.startsAt,
          endsAt: hostContent.endsAt,
          updatedAt: hostContent.updatedAt,
          screenName: screens.name,
          venueName: venues.name,
          timeZone: venues.timeZone,
        })
        .from(hostContent)
        .innerJoin(venues, eq(hostContent.venueId, venues.id))
        .leftJoin(screens, eq(hostContent.screenId, screens.id))
        .where(and(eq(venues.hostClerkUserId, user.id), inArray(hostContent.screenId, screenIds)))
        .orderBy(desc(hostContent.updatedAt))
      : Promise.resolve([]),
  ]);
  const blocked = new Set(blocks.filter((item) => screenIds.includes(item.screenId)).map((item) => `${item.screenId}:${item.advertiserAccountId}`));

  return <div className="host-page">
    <header className="host-header"><Brand href="/" /><div className="host-header-actions"><span className="host-status-pill"><BadgeCheck size={15} /> Host workspace</span><UserButton /><Link className="button button-quiet" href="/"><ArrowLeft size={16} /> Back to NeuseCast</Link></div></header>
    {query.saved ? <div className="success-banner host-alert">Your local content is saved and has been added to the selected screen.</div> : null}
    {query.contentUpdated ? <div className="success-banner host-alert">Your message was updated on the screen.</div> : null}
    {query.contentDeleted ? <div className="success-banner host-alert">The message was deleted and removed from the screen rotation.</div> : null}
    {query.contentStatus ? <div className="success-banner host-alert">The message is now {query.contentStatus === "paused" ? "paused" : "active"}.</div> : null}
    {query.error ? <div className="form-error host-alert">{query.error === "schedule" ? "Choose a valid local start and end time. The end must be after the start." : "Add a headline and message before publishing."}</div> : null}
    {query.contentError ? <div className="form-error host-alert">{query.contentError === "schedule" ? "Choose a valid local start and end time. The end must be after the start." : query.contentError === "unavailable" ? "This message was removed by NeuseCast and cannot be reactivated from the Host Workspace." : "Add a headline and message before saving."}</div> : null}
    {assignedScreens.length ? <>
      <HostComposer screens={assignedScreens.map((screen) => ({ id: screen.id, label: `${screen.venueName} — ${screen.name}`, timeZone: screen.timeZone }))} />
      <section className="host-content-library panel">
        <div className="panel-heading"><div><p className="panel-kicker">Your screen content</p><h2>Published messages</h2><p>Edit, pause, preview, or remove messages running on your assigned screens.</p></div></div>
        {contentRows.length ? <div className="host-content-list">{contentRows.map((item) => {
          const state = contentState(item, new Date());
          const screenLabel = `${item.venueName} · ${item.screenName ?? "Venue screen"}`;
          const previewStyle = { "--host-card-accent": item.template === "event" ? "#5dd7c7" : item.template === "announcement" ? "#83b8ff" : item.template === "menu" ? "#e9879b" : "#f5a65b" } as CSSProperties;
          return <article className="host-content-card" key={item.id}>
            <div className="host-content-preview" style={previewStyle} aria-label={`Preview of ${item.headline}`}>
              <span>{templateLabels[item.template] ?? "Message"}</span>
              <strong>{item.headline}</strong>
              <small>{item.body}</small>
              {item.callToAction ? <em>{item.callToAction}</em> : null}
            </div>
            <div className="host-content-summary">
              <div className="content-title-line"><h3>{item.headline}</h3><span className={`status-badge status-${state.key}`}><span className="status-dot" />{state.label}</span></div>
              <p>{item.body}</p>
              <div className="metadata-row"><span>{screenLabel}</span><span>{templateLabels[item.template] ?? item.template}</span><span>{item.startsAt ? `Starts ${item.startsAt.toLocaleString("en-US", { timeZone: item.timeZone, timeZoneName: "short" })}` : "Starts immediately"}</span>{item.endsAt ? <span>Ends {item.endsAt.toLocaleString("en-US", { timeZone: item.timeZone, timeZoneName: "short" })}</span> : <span>No expiration</span>}</div>
            </div>
            <div className="host-content-quick-actions">
              {item.status !== "rejected" ? <form action={setHostContentActive}><input type="hidden" name="contentId" value={item.id} /><input type="hidden" name="active" value={state.active ? "false" : "true"} /><button className="button button-secondary button-small" type="submit">{state.active ? <Pause size={14} /> : <Play size={14} />}{state.active ? "Pause" : "Reactivate"}</button></form> : null}
              <DeleteHostContentForm action={deleteHostContent} contentId={item.id} title={item.headline} />
            </div>
            {item.status !== "rejected" ? <details className="host-content-edit">
              <summary><Pencil size={15} /> Edit message</summary>
              <form action={updateHostContent} className="host-content-edit-form">
                <input type="hidden" name="contentId" value={item.id} />
                <label className="field"><span className="field-label">Format</span><select name="template" defaultValue={item.template}><option value="special">Special</option><option value="event">Event</option><option value="announcement">Announcement</option><option value="menu">Menu item</option></select></label>
                <label className="field"><span className="field-label">Venue screen</span><select name="screenId" defaultValue={item.screenId ?? ""} required>{assignedScreens.map((screen) => <option value={screen.id} key={screen.id}>{screen.venueName} — {screen.name}</option>)}</select></label>
                <label className="field field-wide"><span className="field-label">Headline</span><input name="headline" defaultValue={item.headline} maxLength={52} required /></label>
                <label className="field field-wide"><span className="field-label">Supporting text</span><textarea name="body" defaultValue={item.body ?? ""} rows={3} maxLength={120} required /></label>
                <label className="field field-wide"><span className="field-label">Key detail or call to action</span><input name="callToAction" defaultValue={item.callToAction ?? ""} maxLength={120} /></label>
                <label className="field"><span className="field-label"><CalendarDays size={14} /> Start</span><input name="startsAt" type="datetime-local" defaultValue={dateTimeInputValue(item.startsAt, item.timeZone)} /></label>
                <label className="field"><span className="field-label"><CalendarDays size={14} /> Remove after</span><input name="endsAt" type="datetime-local" defaultValue={dateTimeInputValue(item.endsAt, item.timeZone)} /></label>
                <div className="host-content-edit-actions field-wide"><span><Eye size={14} /> The preview updates after saving.</span><button className="button button-primary" type="submit">Save changes</button></div>
              </form>
            </details> : null}
          </article>;
        })}</div> : <div className="empty-state host-content-empty"><h3>No published messages yet</h3><p>Messages created above will appear here for future editing and scheduling.</p></div>}
      </section>
      <section className="host-rules panel"><div className="panel-heading"><div><p className="panel-kicker">Venue controls</p><h2><ShieldBan size={18} /> Competitor restrictions</h2><p>All advertisers are allowed by default. A block affects only the selected screen.</p></div></div>
        {assignedScreens.map((screen) => <div className="host-rule-screen" key={screen.id}><h3>{screen.venueName} · {screen.name}</h3><div className="exclusion-list">{advertisers.map((advertiser) => { const key = `${screen.id}:${advertiser.id}`; const isBlocked = blocked.has(key); return <form action={updateHostAdvertiserBlock} className={`exclusion-row ${isBlocked ? "is-blocked" : ""}`} key={advertiser.id}><input type="hidden" name="screenId" value={screen.id} /><input type="hidden" name="advertiserAccountId" value={advertiser.id} /><input type="hidden" name="blocked" value={isBlocked ? "false" : "true"} /><div><strong>{advertiser.businessName}</strong><span>{isBlocked ? "Blocked on this screen" : "Allowed on this screen"}</span></div><button className={`button ${isBlocked ? "button-secondary" : "button-quiet"}`} type="submit">{isBlocked ? "Allow" : "Block"}</button></form>; })}{advertisers.length === 0 ? <p>No active advertisers yet.</p> : null}</div></div>)}
      </section>
    </> : <main className="host-main"><section className="panel host-unassigned"><h1>No screen is assigned yet.</h1><p>Ask NeuseCast Control Room to activate your venue using <strong>{user.primaryEmailAddress?.emailAddress}</strong>. Refresh this page after it is assigned.</p></section></main>}
    <footer className="host-footer"><span>NeuseCast host portal</span><span>Local businesses. Local stories. On screen.</span></footer>
  </div>;
}
