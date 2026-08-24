import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileWarning,
  Filter,
  ImagePlus,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { contentItems, type ContentStatus, type ContentType } from "@/lib/demo-data";

const statusLabels: Record<ContentStatus, string> = {
  approved: "Approved",
  pending: "Awaiting review",
  revision: "Needs revision",
  scheduled: "Auto-scheduled",
};

const typeAbbreviations: Record<ContentType, string> = {
  "Host message": "HOST",
  Advertisement: "AD",
  Weather: "WX",
  Community: "EVENT",
  "Local news": "NEWS",
  Filler: "LOCAL",
};

export default function ContentPage() {
  const approvedCount = contentItems.filter((item) => item.status === "approved").length;
  const pendingCount = contentItems.filter((item) => item.status === "pending").length;
  const automatedCount = contentItems.filter((item) => item.status === "scheduled").length;

  return (
    <div className="control-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Creative library</p>
          <h1>Content</h1>
          <p className="page-description">
            Review host submissions, manage creative, and keep automated local content ready to air.
          </p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" type="button">
            <Sparkles size={16} aria-hidden="true" /> Generate local filler
          </button>
          <button className="button button-primary" type="button">
            <Plus size={16} aria-hidden="true" /> New content
          </button>
        </div>
      </header>

      <section className="metric-grid metric-grid-3" aria-label="Content library summary">
        <article className="metric-card compact-metric-card">
          <span className="metric-icon metric-icon-gold"><Clock3 size={18} aria-hidden="true" /></span>
          <div><p className="metric-label">Awaiting review</p><p className="metric-value">{pendingCount}</p></div>
          <span className="metric-callout">Host supplied</span>
        </article>
        <article className="metric-card compact-metric-card">
          <span className="metric-icon metric-icon-green"><Check size={18} aria-hidden="true" /></span>
          <div><p className="metric-label">Ready to air</p><p className="metric-value">{approvedCount}</p></div>
          <span className="metric-callout">In active rotation</span>
        </article>
        <article className="metric-card compact-metric-card">
          <span className="metric-icon metric-icon-teal"><Sparkles size={18} aria-hidden="true" /></span>
          <div><p className="metric-label">Automated feeds</p><p className="metric-value">{automatedCount + 3}</p></div>
          <span className="metric-callout">Healthy</span>
        </article>
      </section>

      <section className="panel">
        <div className="panel-toolbar panel-toolbar-wrap">
          <div className="segmented-control" aria-label="Filter content">
            <button className="segment is-active" type="button">All <span>{contentItems.length}</span></button>
            <button className="segment" type="button">Review queue <span>{pendingCount + 1}</span></button>
            <button className="segment" type="button">Advertisements</button>
            <button className="segment" type="button">Automated</button>
          </div>
          <div className="toolbar-actions">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search content</span>
              <input type="search" placeholder="Search content" />
            </label>
            <button className="icon-button icon-button-bordered" type="button" aria-label="Filter content">
              <Filter size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="content-list">
          {contentItems.map((item) => (
            <article className="content-row" key={item.id}>
              <div className={`creative-thumb creative-thumb-${item.accent}`} aria-hidden="true">
                <span>{typeAbbreviations[item.type]}</span>
                {item.type === "Advertisement" ? <ImagePlus size={21} /> : <Sparkles size={21} />}
              </div>
              <div className="content-main">
                <div className="content-title-line">
                  <h2>{item.title}</h2>
                  <span className={`status-badge status-${item.status}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p>{item.owner}</p>
                <div className="metadata-row">
                  <span><Clock3 size={13} aria-hidden="true" /> {item.duration} sec</span>
                  <span><CalendarDays size={13} aria-hidden="true" /> {item.submitted}</span>
                  <span>{item.destinations}</span>
                </div>
                {item.note && (
                  <p className={`content-note ${item.status === "revision" ? "content-note-warning" : ""}`}>
                    {item.status === "revision" && <FileWarning size={14} aria-hidden="true" />}
                    {item.note}
                  </p>
                )}
              </div>
              <button className="icon-button row-chevron" type="button" aria-label={`Open ${item.title}`}>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
