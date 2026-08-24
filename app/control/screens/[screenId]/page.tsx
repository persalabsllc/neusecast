import Link from "next/link";
import { eq } from "drizzle-orm";
import { Activity, ArrowLeft, Clock3, KeyRound, Monitor, Radio, ShieldBan, TriangleAlert, Wifi } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ResetPlayerDeviceForm } from "@/components/reset-player-device-form";
import { ScreenFleetRefresh } from "@/components/screen-fleet-refresh";
import { ScreenPlayerActions } from "@/components/screen-player-actions";
import { getDatabase } from "@/lib/db";
import { ensureScreenManagementSchema } from "@/lib/db/ensure-screen-management";
import { advertiserAccounts, appUsers, screenAdvertiserBlocks, screens, venues } from "@/lib/db/schema";
import { deriveScreenHealth, type ScreenHealth } from "@/lib/player/health";
import { pairingCookieName } from "@/lib/player/pairing";
import { setScreenActive } from "../actions";
import { createPlayerPairingLink, resetPlayerDevice } from "./device-actions";
import { updateAdvertiserBlock } from "./actions";

export const dynamic = "force-dynamic";

const healthLabels: Record<ScreenHealth, string> = {
  never_connected: "Never connected",
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
  maintenance: "Maintenance",
  retired: "Retired",
};

function formatAge(timestamp: Date | null, now: Date) {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.floor((now.getTime() - timestamp.getTime()) / 1_000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTimestamp(timestamp: Date | null, timeZone: string) {
  if (!timestamp) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(timestamp);
}

function shortVersion(value: string | null) {
  if (!value) return "Not reported";
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
}

function siteRoot() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://neusecast.vercel.app";
}

export default async function ScreenDetailPage({ params, searchParams }: {
  params: Promise<{ screenId: string }>;
  searchParams: Promise<{ created?: string; pairing?: string; reset?: string }>;
}) {
  const [{ screenId }, query] = await Promise.all([params, searchParams]);
  await ensureScreenManagementSchema();
  const database = getDatabase();
  const [screen] = await database
    .select({
      id: screens.id,
      name: screens.name,
      playerKey: screens.providerScreenId,
      status: screens.status,
      active: screens.active,
      orientation: screens.orientation,
      lastSeenAt: screens.lastSeenAt,
      deviceId: screens.deviceId,
      deviceClaimedAt: screens.deviceClaimedAt,
      pairingTokenExpiresAt: screens.pairingTokenExpiresAt,
      lastHeartbeatAt: screens.lastHeartbeatAt,
      lastManifestAt: screens.lastManifestAt,
      lastManifestVersion: screens.lastManifestVersion,
      lastPlaybackAt: screens.lastPlaybackAt,
      currentItemId: screens.currentItemId,
      currentManifestVersion: screens.currentManifestVersion,
      playerVersion: screens.playerVersion,
      sessionId: screens.sessionId,
      viewportWidth: screens.viewportWidth,
      viewportHeight: screens.viewportHeight,
      lastError: screens.lastError,
      lastErrorAt: screens.lastErrorAt,
      venueName: venues.name,
      venueType: venues.venueType,
      city: venues.city,
      state: venues.state,
      market: venues.market,
      timeZone: venues.timeZone,
      hostClerkUserId: venues.hostClerkUserId,
      hostName: appUsers.displayName,
      hostEmail: appUsers.email,
    })
    .from(screens)
    .innerJoin(venues, eq(screens.venueId, venues.id))
    .leftJoin(appUsers, eq(venues.hostClerkUserId, appUsers.clerkUserId))
    .where(eq(screens.id, screenId))
    .limit(1);
  if (!screen) notFound();

  const [advertisers, blocks] = await Promise.all([
    database.select({ id: advertiserAccounts.id, businessName: advertiserAccounts.businessName }).from(advertiserAccounts).where(eq(advertiserAccounts.active, true)),
    database.select({ advertiserAccountId: screenAdvertiserBlocks.advertiserAccountId, reason: screenAdvertiserBlocks.reason }).from(screenAdvertiserBlocks).where(eq(screenAdvertiserBlocks.screenId, screenId)),
  ]);
  const blocked = new Map(blocks.map((item) => [item.advertiserAccountId, item.reason]));
  const now = new Date();
  const heartbeatAt = screen.lastHeartbeatAt;
  const health = deriveScreenHealth({ active: screen.active, status: screen.status, lastHeartbeatAt: heartbeatAt }, now);
  const playerUrl = screen.playerKey ? `${siteRoot()}/player/${screen.playerKey}` : null;
  const pairingToken = (await cookies()).get(pairingCookieName(screen.id))?.value;
  const pairingUrl = playerUrl && !screen.deviceClaimedAt && pairingToken
    ? `${playerUrl}?pair=${encodeURIComponent(pairingToken)}`
    : null;
  const installUrl = screen.deviceClaimedAt ? playerUrl : pairingUrl;

  return (
    <div className="control-page">
      <div className="screen-detail-toolbar">
        <Link className="button button-quiet" href="/control/screens"><ArrowLeft size={16} /> All screens</Link>
        <ScreenFleetRefresh />
      </div>
      <header className="page-header">
        <div><p className="eyebrow">Screen management</p><h1>{screen.venueName}</h1><p className="page-description">{screen.name} · {screen.city}, {screen.state} · {screen.market}</p></div>
        <span className={`status-badge status-${health} status-badge-large`}><span className="status-dot" />{healthLabels[health]}</span>
      </header>
      {query.created || query.pairing || query.reset ? <div className="success-banner">{query.reset ? "Device pairing reset. Use the new one-time link below on the replacement player." : "One-time pairing link ready. Open it on the venue player before it expires."}</div> : null}
      {screen.lastError ? <div className="screen-error-banner"><TriangleAlert size={18} /><div><strong>Player reported an error</strong><span>{screen.lastError}</span><small>{formatTimestamp(screen.lastErrorAt, screen.timeZone)}</small></div></div> : null}

      <section className="screen-telemetry-grid" aria-label="Screen telemetry">
        <article className={`telemetry-card telemetry-${health}`}><span className="telemetry-icon"><Wifi size={18} /></span><div><p>Connection</p><strong>{healthLabels[health]}</strong><span>Heartbeat {formatAge(heartbeatAt, now)}</span></div></article>
        <article className="telemetry-card"><span className="telemetry-icon"><Radio size={18} /></span><div><p>Playlist sync</p><strong>{formatAge(screen.lastManifestAt, now)}</strong><span>{screen.lastManifestVersion ? `Manifest ${shortVersion(screen.lastManifestVersion)}` : "No manifest received"}</span></div></article>
        <article className="telemetry-card"><span className="telemetry-icon"><Activity size={18} /></span><div><p>Proof of play</p><strong>{formatAge(screen.lastPlaybackAt, now)}</strong><span>{screen.currentItemId ? `Item ${shortVersion(screen.currentItemId)}` : "Nothing reported playing"}</span></div></article>
        <article className="telemetry-card"><span className="telemetry-icon"><Monitor size={18} /></span><div><p>Player device</p><strong>{screen.deviceClaimedAt ? "Paired" : "Awaiting pairing"}</strong><span>{screen.playerVersion ? `v${screen.playerVersion}` : "Version unknown"}{screen.viewportWidth && screen.viewportHeight ? ` · ${screen.viewportWidth}×${screen.viewportHeight}` : ""}</span></div></article>
      </section>

      <section className="screen-detail-grid">
        <article className="panel screen-player-panel">
          <div className="panel-heading"><div><p className="panel-kicker">Permanent player</p><h2><Monitor size={19} /> {screen.name}</h2></div></div>
          <dl className="detail-list">
            <div><dt>Connection health</dt><dd><span className={`status-badge status-${health}`}><span className="status-dot" />{healthLabels[health]}</span></dd></div>
            <div><dt>Last heartbeat</dt><dd>{formatTimestamp(heartbeatAt, screen.timeZone)}</dd></div>
            <div><dt>Last playlist sync</dt><dd>{formatTimestamp(screen.lastManifestAt, screen.timeZone)}</dd></div>
            <div><dt>Last proof of play</dt><dd>{formatTimestamp(screen.lastPlaybackAt, screen.timeZone)}</dd></div>
            <div><dt>Manifest on device</dt><dd>{shortVersion(screen.currentManifestVersion)}</dd></div>
            <div><dt>Orientation</dt><dd>{screen.orientation}</dd></div>
            <div><dt>Venue type</dt><dd>{screen.venueType}</dd></div>
            <div><dt>Venue timezone</dt><dd>{screen.timeZone}</dd></div>
            <div><dt>Host assignment</dt><dd>{screen.hostName || screen.hostEmail || screen.hostClerkUserId?.replace(/^invited:/, "") || "Unassigned"}</dd></div>
            <div><dt>Paired at</dt><dd>{formatTimestamp(screen.deviceClaimedAt, screen.timeZone)}</dd></div>
            <div><dt>Device ID</dt><dd>{shortVersion(screen.deviceId)}</dd></div>
            <div><dt>Device session</dt><dd>{shortVersion(screen.sessionId)}</dd></div>
          </dl>
          {playerUrl ? <>
            <p className="install-url-label"><Clock3 size={14} /> {screen.deviceClaimedAt ? "Permanent player URL" : pairingUrl ? "One-time pairing URL" : "Player pairing"}</p>
            {installUrl ? <code className="player-url">{installUrl}</code> : <p className="device-waiting-note">Generate a one-time link, then open it on the player attached to this venue TV.</p>}
            {pairingUrl && screen.pairingTokenExpiresAt ? <small className="pairing-expiry">Pairing token expires {formatTimestamp(screen.pairingTokenExpiresAt, screen.timeZone)}.</small> : null}
            <ScreenPlayerActions installUrl={installUrl ?? undefined} orientation={screen.orientation} previewLabel={`${screen.venueName} · ${screen.name}`} previewUrl={`/player/${screen.playerKey}?preview=1`} />
            {!screen.deviceClaimedAt && !pairingUrl ? <form action={createPlayerPairingLink} className="pairing-link-form"><input type="hidden" name="screenId" value={screen.id} /><button className="button button-primary" type="submit"><KeyRound size={16} /> Generate one-time pairing link</button></form> : null}
          </> : null}
          <div className="screen-device-actions">
            {screen.deviceClaimedAt || screen.deviceId ? <ResetPlayerDeviceForm screenId={screen.id} action={resetPlayerDevice} /> : <p className="device-waiting-note">This screen has not paired with a player device yet.</p>}
            <form action={setScreenActive}><input type="hidden" name="screenId" value={screen.id} /><input type="hidden" name="active" value={screen.active ? "false" : "true"} /><button className="button button-secondary" type="submit">{screen.active ? "Take screen out of service" : "Reactivate screen"}</button></form>
          </div>
        </article>

        <article className="panel screen-rules-panel">
          <div className="panel-heading"><div><p className="panel-kicker">Venue rules</p><h2><ShieldBan size={19} /> Advertiser exclusions</h2><p>Network campaigns run here by default. Block only genuine competitors or venue conflicts.</p></div></div>
          <div className="exclusion-list">
            {advertisers.map((advertiser) => {
              const isBlocked = blocked.has(advertiser.id);
              return <form action={updateAdvertiserBlock} className={`exclusion-row ${isBlocked ? "is-blocked" : ""}`} key={advertiser.id}><input type="hidden" name="screenId" value={screen.id} /><input type="hidden" name="advertiserAccountId" value={advertiser.id} /><input type="hidden" name="blocked" value={isBlocked ? "false" : "true"} /><div><strong>{advertiser.businessName}</strong><span>{isBlocked ? `Blocked · ${blocked.get(advertiser.id)}` : "Allowed on this screen"}</span></div>{!isBlocked ? <input name="reason" aria-label={`Reason for blocking ${advertiser.businessName}`} placeholder="Reason (optional)" /> : null}<button className={`button ${isBlocked ? "button-secondary" : "button-quiet"}`} type="submit">{isBlocked ? "Allow" : "Block"}</button></form>;
            })}
            {advertisers.length === 0 ? <p className="empty-state">Advertisers will appear here after creating an account.</p> : null}
          </div>
        </article>
      </section>
    </div>
  );
}
