import type { Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, ShieldBan } from "lucide-react";
import { Brand } from "@/components/brand";
import { HostComposer } from "@/components/host-composer";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, screenAdvertiserBlocks, screens, venues } from "@/lib/db/schema";
import { requireHostUser, updateHostAdvertiserBlock } from "./actions";

export const metadata: Metadata = { title: "Host portal", description: "Create and schedule venue content for an assigned NeuseCast screen." };
export const dynamic = "force-dynamic";

export default async function HostPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [user, query] = await Promise.all([requireHostUser(), searchParams]);
  const database = getDatabase();
  const assignedScreens = await database.select({ id: screens.id, name: screens.name, playerKey: screens.providerScreenId, venueName: venues.name, city: venues.city, timeZone: venues.timeZone }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)).where(and(eq(venues.hostClerkUserId, user.id), eq(screens.active, true)));
  const screenIds = assignedScreens.map((screen) => screen.id);
  const [advertisers, blocks] = await Promise.all([
    database.select({ id: advertiserAccounts.id, businessName: advertiserAccounts.businessName }).from(advertiserAccounts).where(eq(advertiserAccounts.active, true)),
    screenIds.length ? database.select({ screenId: screenAdvertiserBlocks.screenId, advertiserAccountId: screenAdvertiserBlocks.advertiserAccountId }).from(screenAdvertiserBlocks) : Promise.resolve([]),
  ]);
  const blocked = new Set(blocks.filter((item) => screenIds.includes(item.screenId)).map((item) => `${item.screenId}:${item.advertiserAccountId}`));

  return <div className="host-page">
    <header className="host-header"><Brand href="/" /><div className="host-header-actions"><span className="host-status-pill"><BadgeCheck size={15} /> Host workspace</span><UserButton /><Link className="button button-quiet" href="/"><ArrowLeft size={16} /> Back to NeuseCast</Link></div></header>
    {query.saved ? <div className="success-banner host-alert">Your local content is saved and has been added to the selected screen.</div> : null}
    {query.error ? <div className="form-error host-alert">{query.error === "schedule" ? "Choose a valid local start and end time. The end must be after the start." : "Add a headline and message before publishing."}</div> : null}
    {assignedScreens.length ? <>
      <HostComposer screens={assignedScreens.map((screen) => ({ id: screen.id, label: `${screen.venueName} — ${screen.name}`, timeZone: screen.timeZone }))} />
      <section className="host-rules panel"><div className="panel-heading"><div><p className="panel-kicker">Venue controls</p><h2><ShieldBan size={18} /> Competitor restrictions</h2><p>All advertisers are allowed by default. A block affects only the selected screen.</p></div></div>
        {assignedScreens.map((screen) => <div className="host-rule-screen" key={screen.id}><h3>{screen.venueName} · {screen.name}</h3><div className="exclusion-list">{advertisers.map((advertiser) => { const key = `${screen.id}:${advertiser.id}`; const isBlocked = blocked.has(key); return <form action={updateHostAdvertiserBlock} className={`exclusion-row ${isBlocked ? "is-blocked" : ""}`} key={advertiser.id}><input type="hidden" name="screenId" value={screen.id} /><input type="hidden" name="advertiserAccountId" value={advertiser.id} /><input type="hidden" name="blocked" value={isBlocked ? "false" : "true"} /><div><strong>{advertiser.businessName}</strong><span>{isBlocked ? "Blocked on this screen" : "Allowed on this screen"}</span></div><button className={`button ${isBlocked ? "button-secondary" : "button-quiet"}`} type="submit">{isBlocked ? "Allow" : "Block"}</button></form>; })}{advertisers.length === 0 ? <p>No active advertisers yet.</p> : null}</div></div>)}
      </section>
    </> : <main className="host-main"><section className="panel host-unassigned"><h1>No screen is assigned yet.</h1><p>Ask NeuseCast Control Room to activate your venue using <strong>{user.primaryEmailAddress?.emailAddress}</strong>. Refresh this page after it is assigned.</p></section></main>}
    <footer className="host-footer"><span>NeuseCast host portal</span><span>Local businesses. Local stories. On screen.</span></footer>
  </div>;
}
