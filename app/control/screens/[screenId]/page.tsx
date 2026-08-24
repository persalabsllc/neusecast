import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Monitor, ShieldBan } from "lucide-react";
import { notFound } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { advertiserAccounts, screenAdvertiserBlocks, screens, venues } from "@/lib/db/schema";
import { setScreenActive } from "../actions";
import { updateAdvertiserBlock } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScreenDetailPage({ params, searchParams }: { params: Promise<{ screenId: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ screenId }, { created }] = await Promise.all([params, searchParams]);
  await ensureScreenManagementSchema();
  const database = getDatabase();
  const [screen] = await database.select({ id: screens.id, name: screens.name, playerKey: screens.providerScreenId, status: screens.status, active: screens.active, orientation: screens.orientation, lastSeenAt: screens.lastSeenAt, venueName: venues.name, venueType: venues.venueType, city: venues.city, state: venues.state, market: venues.market, hostClerkUserId: venues.hostClerkUserId }).from(screens).innerJoin(venues, eq(screens.venueId, venues.id)).where(eq(screens.id, screenId)).limit(1);
  if (!screen) notFound();
  const [advertisers, blocks] = await Promise.all([
    database.select({ id: advertiserAccounts.id, businessName: advertiserAccounts.businessName }).from(advertiserAccounts).where(eq(advertiserAccounts.active, true)),
    database.select({ advertiserAccountId: screenAdvertiserBlocks.advertiserAccountId, reason: screenAdvertiserBlocks.reason }).from(screenAdvertiserBlocks).where(eq(screenAdvertiserBlocks.screenId, screenId)),
  ]);
  const blocked = new Map(blocks.map((item) => [item.advertiserAccountId, item.reason]));
  const playerUrl = screen.playerKey ? `https://neusecast.vercel.app/player/${screen.playerKey}` : null;

  return <div className="control-page">
    <Link className="button button-quiet" href="/control/screens"><ArrowLeft size={16} /> All screens</Link>
    <header className="page-header"><div><p className="eyebrow">Screen management</p><h1>{screen.venueName}</h1><p className="page-description">{screen.name} · {screen.city}, {screen.state} · {screen.market}</p></div></header>
    {created ? <div className="success-banner">Screen activated. Open the permanent URL on the TV player and sign the host up with the assigned email.</div> : null}
    <section className="screen-detail-grid">
      <article className="panel"><div className="panel-heading"><div><p className="panel-kicker">Permanent player</p><h2><Monitor size={19} /> {screen.name}</h2></div></div><dl className="detail-list"><div><dt>Status</dt><dd>{screen.status}</dd></div><div><dt>Orientation</dt><dd>{screen.orientation}</dd></div><div><dt>Last seen</dt><dd>{screen.lastSeenAt?.toLocaleString() ?? "Never"}</dd></div><div><dt>Host assignment</dt><dd>{screen.hostClerkUserId?.startsWith("invited:") ? screen.hostClerkUserId.slice(8) : "Connected"}</dd></div></dl>{playerUrl ? <><code className="player-url">{playerUrl}</code><Link className="button button-primary" href={playerUrl} target="_blank"><ExternalLink size={16} /> Open player</Link></> : null}<form action={setScreenActive}><input type="hidden" name="screenId" value={screen.id} /><input type="hidden" name="active" value={screen.active ? "false" : "true"} /><button className="button button-secondary" type="submit">{screen.active ? "Take screen out of service" : "Reactivate screen"}</button></form></article>
      <article className="panel"><div className="panel-heading"><div><p className="panel-kicker">Venue rules</p><h2><ShieldBan size={19} /> Advertiser exclusions</h2><p>Network campaigns run here by default. Block only genuine competitors or venue conflicts.</p></div></div><div className="exclusion-list">
        {advertisers.map((advertiser) => { const isBlocked = blocked.has(advertiser.id); return <form action={updateAdvertiserBlock} className={`exclusion-row ${isBlocked ? "is-blocked" : ""}`} key={advertiser.id}><input type="hidden" name="screenId" value={screen.id} /><input type="hidden" name="advertiserAccountId" value={advertiser.id} /><input type="hidden" name="blocked" value={isBlocked ? "false" : "true"} /><div><strong>{advertiser.businessName}</strong><span>{isBlocked ? `Blocked · ${blocked.get(advertiser.id)}` : "Allowed on this screen"}</span></div>{!isBlocked ? <input name="reason" aria-label={`Reason for blocking ${advertiser.businessName}`} placeholder="Reason (optional)" /> : null}<button className={`button ${isBlocked ? "button-secondary" : "button-quiet"}`} type="submit">{isBlocked ? "Allow" : "Block"}</button></form>; })}
        {advertisers.length === 0 ? <p className="empty-state">Advertisers will appear here after creating an account.</p> : null}
      </div></article>
    </section>
  </div>;
}
