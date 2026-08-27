import Link from "next/link";
import { AlertTriangle, CloudSun, ExternalLink, Radio, RefreshCw, Save, Waves } from "lucide-react";
import { loadWeatherCenterDashboard } from "@/lib/weather-center/service";
import { WEATHER_CENTER_SCENES } from "@/lib/weather-center/types";
import { markSevereWeatherReviewedAction, refreshWeatherCenterAction, updateWeatherCenterAction } from "./actions";
import styles from "./weather.module.css";

export const dynamic = "force-dynamic";

function time(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default async function StudioWeatherPage() {
  const data = await loadWeatherCenterDashboard();
  const run = data.currentRun;
  const alerts = run?.data.alerts ?? [];
  return <div className={styles.page}>
    <header className={styles.header}><div><span>Automated local forecast</span><h2>Weather Center</h2><p>Generate, review, present, record and air the Eastern North Carolina forecast package.</p></div><div className={styles.headerActions}><Link href="/weather-center/teleprompter" target="_blank">Open teleprompter <ExternalLink size={15} /></Link><form action={refreshWeatherCenterAction}><button type="submit"><RefreshCw size={15} /> Refresh now</button></form></div></header>

    <section className={styles.statusGrid}>
      <article><CloudSun /><span>Current package</span><strong>{run ? "Air ready" : "Waiting for first update"}</strong><small>{run ? `Valid until ${time(run.validUntil)}` : "Use Refresh now"}</small></article>
      <article><AlertTriangle /><span>Official alerts</span><strong>{alerts.length}</strong><small>{alerts.length ? "Human review required for rewritten narration" : "No active alerts for New Bern"}</small></article>
      <article><Waves /><span>Marine &amp; tides</span><strong>{run?.data.marine.length ?? 0} periods</strong><small>Neuse River + NWS marine zone</small></article>
      <article><Radio /><span>Playout integration</span><strong>{data.output.assignedAgentId ? "Agent assigned" : "Prepared"}</strong><small>OBS and CasparCG URLs are ready</small></article>
    </section>

    {run ? <section className={styles.previewPanel}><div className={styles.panelHeading}><div><span>Program return</span><h3>Automated graphics sequence</h3></div><Link href="/weather-center" target="_blank">Full screen <ExternalLink size={14} /></Link></div><div className={styles.preview}><iframe src="/weather-center?compact=1" title="Weather Center program preview" /></div></section> : null}

    <div className={styles.columns}>
      <section className={styles.panel}><div className={styles.panelHeading}><div><span>Presenter rundown</span><h3>Automatically generated script</h3></div><small>{run ? time(run.issuedAt) : "Not generated"}</small></div><pre className={styles.script}>{run?.presenterScript ?? "Refresh the Weather Center to generate the first presenter script."}</pre>{run && alerts.length ? <form action={markSevereWeatherReviewedAction}><input type="hidden" name="runId" value={run.id} /><button className={styles.reviewButton} type="submit" disabled={run.severeWeatherReviewed}>{run.severeWeatherReviewed ? "Severe-weather copy reviewed" : "Mark severe-weather copy reviewed"}</button></form> : null}</section>

      <section className={styles.panel}><div className={styles.panelHeading}><div><span>Automation</span><h3>Weather Center settings</h3></div></div><form action={updateWeatherCenterAction} className={styles.settings}><label><span>Sponsor line</span><input name="sponsorLabel" defaultValue={data.center.sponsorLabel} required /></label><label><span>Primary location</span><input name="primaryLocation" defaultValue={data.center.primaryLocation} required /></label><label><span>Target report length</span><select name="reportDurationSeconds" defaultValue={String(data.center.reportDurationSeconds)}><option value="60">60 seconds</option><option value="90">90 seconds</option><option value="120">2 minutes</option><option value="180">3 minutes</option></select></label><label className={styles.check}><input type="checkbox" name="autoRefresh" defaultChecked={data.center.autoRefresh} /><span>Refresh official data automatically</span></label><label className={styles.check}><input type="checkbox" name="graphicsOnlyFallback" defaultChecked={data.center.graphicsOnlyFallback} /><span>Allow graphics-only forecast when no presenter report exists</span></label><label className={styles.check}><input type="checkbox" name="presenterMode" defaultChecked={data.center.presenterMode} /><span>Generate presenter script and teleprompter</span></label><button type="submit"><Save size={15} /> Save settings</button></form></section>
    </div>

    <section className={styles.panel}><div className={styles.panelHeading}><div><span>OBS and CasparCG browser sources</span><h3>Individual scenes</h3></div><small>1920×1080 · transparent-free program backgrounds</small></div><div className={styles.sceneGrid}>{WEATHER_CENTER_SCENES.map((scene) => <Link href={`/weather-center?scene=${scene}`} target="_blank" key={scene}><strong>{scene.replaceAll("-", " ")}</strong><code>/weather-center?scene={scene}</code></Link>)}</div></section>

    <section className={styles.panel}><div className={styles.panelHeading}><div><span>Recent generation history</span><h3>Forecast packages</h3></div></div><div className={styles.history}>{data.recentRuns.map((item) => <div key={item.id}><span className={`${styles.runStatus} ${styles[item.status]}`}>{item.status}</span><strong>{time(item.issuedAt)}</strong><small>{item.errorMessage ?? `Valid through ${time(item.validUntil)}`}</small></div>)}</div></section>
  </div>;
}
