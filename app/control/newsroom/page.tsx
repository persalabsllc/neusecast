import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import {
  ArrowUpRight,
  BadgeCheck,
  CircleAlert,
  Clock3,
  Newspaper,
  Play,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { getDatabase } from "@/lib/db";
import { newsroomEditions, newsroomSources, newsroomStories } from "@/lib/db/schema";
import {
  generateNewsroomEditionAction,
  publishNewsroomEditionAction,
  reviewNewsroomStoryAction,
  updateNewsroomStoryAction,
  withdrawNewsroomEditionAction,
} from "./actions";

function shortDate(value: Date | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function NewsroomControlPage() {
  const database = getDatabase();
  const [editions, reviewStories, sources] = await Promise.all([
    database.select().from(newsroomEditions).orderBy(desc(newsroomEditions.createdAt)).limit(12),
    database
      .select()
      .from(newsroomStories)
      .where(eq(newsroomStories.status, "review"))
      .orderBy(desc(newsroomStories.createdAt))
      .limit(30),
    database.select().from(newsroomSources).orderBy(newsroomSources.trustTier, newsroomSources.name),
  ]);
  const editionIds = editions.map((edition) => edition.id);
  const editionStories = editionIds.length
    ? await database.select().from(newsroomStories).where(inArray(newsroomStories.editionId, editionIds))
    : [];
  const storyCounts = new Map<string, { approved: number; review: number; total: number }>();
  for (const story of editionStories) {
    const count = storyCounts.get(story.editionId) ?? { approved: 0, review: 0, total: 0 };
    count.total += 1;
    if (story.status === "approved") count.approved += 1;
    if (story.status === "review") count.review += 1;
    storyCounts.set(story.editionId, count);
  }
  const published = editions.find((edition) => edition.status === "published");
  const healthySources = sources.filter((source) => source.active && !source.lastError).length;

  return (
    <div className="control-page newsroom-control-page">
      <section className="dashboard-intro">
        <div>
          <p className="eyebrow">Hyperlocal programming</p>
          <h2>NeuseCast Newsroom</h2>
          <p>Two daily, source-attributed local editions with animated broadcast graphics and mandatory review for sensitive reporting.</p>
        </div>
        <div className="dashboard-actions newsroom-generate-actions">
          <form action={generateNewsroomEditionAction}>
            <input type="hidden" name="market" value="Eastern North Carolina" />
            <input type="hidden" name="slot" value="morning" />
            <button className="button button-secondary" type="submit"><Newspaper size={16} /> Generate morning</button>
          </form>
          <form action={generateNewsroomEditionAction}>
            <input type="hidden" name="market" value="Eastern North Carolina" />
            <input type="hidden" name="slot" value="afternoon" />
            <button className="button button-primary" type="submit"><Radio size={16} /> Generate update</button>
          </form>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Newsroom status">
        <article className="metric-card"><span className="metric-icon metric-icon-teal"><Play size={18} /></span><div><span>Latest on air</span><strong>{published?.label ?? "No edition"}</strong><small>{published ? shortDate(published.publishedAt) : "Generate the first edition"}</small></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-coral"><CircleAlert size={18} /></span><div><span>Review queue</span><strong>{reviewStories.length}</strong><small>Sensitive stories remain off-air</small></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-blue"><Clock3 size={18} /></span><div><span>Program length</span><strong>{published ? `${Math.floor(published.durationSeconds / 60)}:${String(published.durationSeconds % 60).padStart(2, "0")}` : "3–5 min"}</strong><small>Scheduled about once per hour</small></div></article>
        <article className="metric-card"><span className="metric-icon metric-icon-gold"><ShieldCheck size={18} /></span><div><span>Approved sources</span><strong>{healthySources} / {sources.length}</strong><small>Official records prioritized</small></div></article>
      </section>

      {reviewStories.length ? (
        <section className="panel newsroom-review-panel">
          <div className="panel-heading"><div><span className="panel-kicker"><CircleAlert size={14} /> Human review required</span><h2>Sensitive story queue</h2></div><p>Verify the cited source, wording, names, and context before approval.</p></div>
          <div className="newsroom-review-grid">
            {reviewStories.map((story) => (
              <article className="newsroom-review-card" key={story.id}>
                <div className="content-title-line"><span className={`status-badge newsroom-risk-${story.riskLevel}`}>{story.riskLevel}</span><span className="metadata-row">{story.category.replaceAll("_", " ")}</span></div>
                <form action={updateNewsroomStoryAction} className="newsroom-story-form">
                  <input type="hidden" name="storyId" value={story.id} />
                  <input type="hidden" name="editionId" value={story.editionId} />
                  <label><span>Headline</span><input name="headline" defaultValue={story.headline} maxLength={180} required /></label>
                  <label><span>On-screen summary</span><textarea name="summary" defaultValue={story.summary} rows={3} maxLength={420} required /></label>
                  <label><span>Caption / narration</span><textarea name="narration" defaultValue={story.narration} rows={5} maxLength={1200} required /></label>
                  <label><span>Ticker</span><textarea name="ticker" defaultValue={story.ticker} rows={2} maxLength={300} required /></label>
                  <a className="text-link" href={story.sourceUrl} target="_blank" rel="noopener noreferrer">Open {story.sourceName} source <ArrowUpRight size={14} /></a>
                  <button className="button button-primary" type="submit"><BadgeCheck size={16} /> Save and approve</button>
                </form>
                <div className="newsroom-review-actions">
                  <form action={reviewNewsroomStoryAction}><input type="hidden" name="storyId" value={story.id} /><input type="hidden" name="editionId" value={story.editionId} /><input type="hidden" name="decision" value="reject" /><button className="button button-secondary" type="submit">Reject</button></form>
                  <form action={reviewNewsroomStoryAction}><input type="hidden" name="storyId" value={story.id} /><input type="hidden" name="editionId" value={story.editionId} /><input type="hidden" name="decision" value="kill" /><button className="button button-quiet" type="submit">Kill immediately</button></form>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel"><div className="control-empty"><BadgeCheck size={24} /><strong>The sensitive-story queue is clear.</strong><span>Routine verified stories can publish automatically; higher-risk items will stop here first.</span></div></section>
      )}

      <section className="panel">
        <div className="panel-heading"><div><span className="panel-kicker"><Newspaper size={14} /> Rundowns</span><h2>Recent editions</h2></div></div>
        {editions.length ? <div className="content-list">{editions.map((edition) => {
          const counts = storyCounts.get(edition.id) ?? { approved: 0, review: 0, total: 0 };
          return <article className="content-row newsroom-edition-row" key={edition.id}>
            <div className="content-main"><div className="content-title-line"><h2>{edition.label}</h2><span className={`status-badge status-${edition.status === "published" ? "online" : edition.status === "review" ? "pending" : "offline"}`}><span className="status-dot" />{edition.status}</span></div><p>{edition.headline}</p><div className="metadata-row"><span>{edition.market}</span><span>{edition.durationSeconds}s</span><span>{counts.approved} approved</span><span>{counts.review} review</span><span>revision {edition.revision}</span></div></div>
            <div className="newsroom-edition-actions"><Link className="button button-secondary" href={`/control/newsroom/${edition.id}`} target="_blank"><Play size={15} /> Preview</Link>{edition.status !== "published" ? <form action={publishNewsroomEditionAction}><input type="hidden" name="editionId" value={edition.id} /><button className="button button-primary" type="submit" disabled={counts.approved < 4}>Publish</button></form> : <form action={withdrawNewsroomEditionAction}><input type="hidden" name="editionId" value={edition.id} /><button className="button button-quiet" type="submit">Withdraw</button></form>}</div>
          </article>;
        })}</div> : <div className="empty-state"><h3>No editions yet</h3><p>Generate the first morning or afternoon rundown.</p></div>}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="panel-kicker"><ShieldCheck size={14} /> Editorial policy</span><h2>Approved source desk</h2></div><p>Facts are rewritten and attributed. Publisher wording and photos are never republished without permission.</p></div>
        <div className="newsroom-source-grid">{sources.map((source) => <article key={source.id}><strong>{source.attributionLabel}</strong><span>{source.trustTier} · {source.mediaPolicy.replaceAll("_", " ")}</span><a href={source.homepageUrl} target="_blank" rel="noopener noreferrer">Open source <ArrowUpRight size={13} /></a></article>)}</div>
      </section>
    </div>
  );
}
