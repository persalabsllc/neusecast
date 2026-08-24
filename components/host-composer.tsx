"use client";

import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  Eye,
  Info,
  MapPin,
  Megaphone,
  PartyPopper,
  Save,
  Send,
  Sparkles,
  Store,
  Utensils,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

type TemplateId = "special" | "event" | "announcement" | "menu";

type Template = {
  id: TemplateId;
  label: string;
  description: string;
  eyebrow: string;
  accent: string;
  icon: LucideIcon;
};

const templates: Template[] = [
  {
    id: "special",
    label: "Special",
    description: "A timely deal or offer",
    eyebrow: "Today’s local special",
    accent: "#f5a65b",
    icon: Sparkles,
  },
  {
    id: "event",
    label: "Event",
    description: "Promote what’s happening",
    eyebrow: "Save the date",
    accent: "#5dd7c7",
    icon: PartyPopper,
  },
  {
    id: "announcement",
    label: "Announcement",
    description: "Share an important update",
    eyebrow: "Community update",
    accent: "#83b8ff",
    icon: Megaphone,
  },
  {
    id: "menu",
    label: "Menu item",
    description: "Spotlight a favorite",
    eyebrow: "Made here",
    accent: "#e9879b",
    icon: Utensils,
  },
];

const venueOptions = [
  "The Chelsea — Dining room",
  "Baker’s Kitchen — Front counter",
  "Carolina Colours — Clubhouse",
  "Captain Ratty’s — Upstairs bar",
];

const fieldDefaults: Record<
  TemplateId,
  { headline: string; body: string; detail: string; cta: string }
> = {
  special: {
    headline: "Lunch on the Neuse",
    body: "Choose any sandwich, side, and fountain drink.",
    detail: "$12.97",
    cta: "Available today until 3 PM",
  },
  event: {
    headline: "Downtown ArtWalk",
    body: "Meet local artists, hear live music, and explore new work.",
    detail: "Friday · 5–8 PM",
    cta: "Free and open to everyone",
  },
  announcement: {
    headline: "We’re opening early",
    body: "Join us one hour earlier this Saturday for MumFest weekend.",
    detail: "Doors open at 8 AM",
    cta: "See you downtown",
  },
  menu: {
    headline: "Carolina Shrimp & Grits",
    body: "Local shrimp, stone-ground grits, smoked tomato, and scallions.",
    detail: "$19",
    cta: "Ask your server about tonight’s pairing",
  },
};

function formatSchedule(date: string, time: string) {
  if (!date) return "Starts when approved";

  const [year, month, day] = date.split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: year === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(year, month - 1, day));

  if (!time) return `Starts ${label}`;

  const [hours, minutes] = time.split(":").map(Number);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hours, minutes));

  return `Starts ${label} at ${timeLabel}`;
}

export function HostComposer() {
  const [templateId, setTemplateId] = useState<TemplateId>("special");
  const [headline, setHeadline] = useState(fieldDefaults.special.headline);
  const [body, setBody] = useState(fieldDefaults.special.body);
  const [detail, setDetail] = useState(fieldDefaults.special.detail);
  const [cta, setCta] = useState(fieldDefaults.special.cta);
  const [venue, setVenue] = useState(venueOptions[0]);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submissionState, setSubmissionState] = useState<
    "idle" | "draft" | "submitted"
  >("idle");

  const activeTemplate =
    templates.find((template) => template.id === templateId) ?? templates[0];
  const ActiveTemplateIcon = activeTemplate.icon;
  const scheduleLabel = formatSchedule(startDate, startTime);
  const previewStyle = {
    "--preview-accent": activeTemplate.accent,
  } as CSSProperties;

  function chooseTemplate(nextTemplate: Template) {
    const defaults = fieldDefaults[nextTemplate.id];
    setTemplateId(nextTemplate.id);
    setHeadline(defaults.headline);
    setBody(defaults.body);
    setDetail(defaults.detail);
    setCta(defaults.cta);
    setSubmissionState("idle");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmissionState("submitted");
  }

  return (
    <main className="host-main">
      <section className="host-intro" aria-labelledby="host-page-title">
        <div>
          <div className="eyebrow">Venue content studio</div>
          <h1 id="host-page-title">Turn a quick update into screen-ready content.</h1>
          <p>
            Choose a format, add the details, and preview exactly what your guests
            will see. NeuseCast handles the design for you.
          </p>
        </div>

        <div className="host-demo-notice" role="status">
          <Info size={18} aria-hidden="true" />
          <div>
            <strong>Demo mode</strong>
            <span>Nothing is saved or sent to a screen yet.</span>
          </div>
        </div>
      </section>

      <form className="host-composer" onSubmit={handleSubmit}>
        <section className="host-editor" aria-label="Create screen content">
          <div className="host-section-heading">
            <span className="host-step">01</span>
            <div>
              <h2>Choose a format</h2>
              <p>Start with the kind of message you want to share.</p>
            </div>
          </div>

          <div className="template-grid" role="group" aria-label="Content format">
            {templates.map((template) => {
              const TemplateIcon = template.icon;
              const isActive = template.id === templateId;

              return (
                <button
                  className={`template-option${isActive ? " is-active" : ""}`}
                  key={template.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => chooseTemplate(template)}
                >
                  <span
                    className="template-icon"
                    style={{ "--template-accent": template.accent } as CSSProperties}
                  >
                    <TemplateIcon size={19} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{template.label}</strong>
                    <small>{template.description}</small>
                  </span>
                  {isActive ? (
                    <Check className="template-check" size={16} aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="host-form-section">
            <div className="host-section-heading">
              <span className="host-step">02</span>
              <div>
                <h2>Add your message</h2>
                <p>Keep it brief—the preview updates as you type.</p>
              </div>
            </div>

            <div className="host-fields">
              <label className="field field-wide">
                <span className="field-label">Headline</span>
                <input
                  type="text"
                  value={headline}
                  maxLength={52}
                  required
                  onChange={(event) => {
                    setHeadline(event.target.value);
                    setSubmissionState("idle");
                  }}
                  aria-describedby="headline-help"
                />
                <span className="field-help" id="headline-help">
                  {headline.length}/52 characters
                </span>
              </label>

              <label className="field field-wide">
                <span className="field-label">Supporting text</span>
                <textarea
                  value={body}
                  rows={3}
                  maxLength={120}
                  required
                  onChange={(event) => {
                    setBody(event.target.value);
                    setSubmissionState("idle");
                  }}
                  aria-describedby="body-help"
                />
                <span className="field-help" id="body-help">
                  {body.length}/120 characters
                </span>
              </label>

              <label className="field">
                <span className="field-label">
                  {templateId === "menu" || templateId === "special"
                    ? "Price or offer"
                    : "Key detail"}
                </span>
                <input
                  type="text"
                  value={detail}
                  maxLength={32}
                  onChange={(event) => {
                    setDetail(event.target.value);
                    setSubmissionState("idle");
                  }}
                />
              </label>

              <label className="field">
                <span className="field-label">Call to action</span>
                <input
                  type="text"
                  value={cta}
                  maxLength={52}
                  onChange={(event) => {
                    setCta(event.target.value);
                    setSubmissionState("idle");
                  }}
                />
              </label>
            </div>
          </div>

          <div className="host-form-section">
            <div className="host-section-heading">
              <span className="host-step">03</span>
              <div>
                <h2>Choose where and when</h2>
                <p>Target your venue screen and set an optional run window.</p>
              </div>
            </div>

            <div className="host-fields">
              <label className="field field-wide">
                <span className="field-label">
                  <MapPin size={15} aria-hidden="true" /> Venue screen
                </span>
                <select value={venue} onChange={(event) => setVenue(event.target.value)}>
                  {venueOptions.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">
                  <CalendarDays size={15} aria-hidden="true" /> Start date
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">
                  <Clock3 size={15} aria-hidden="true" /> Start time
                </span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </label>

              <label className="field field-wide">
                <span className="field-label">Remove after</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                />
                <span className="field-help">
                  Leave blank to keep it active until you replace it.
                </span>
              </label>
            </div>
          </div>

          <div className="host-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setSubmissionState("draft")}
            >
              <Save size={17} aria-hidden="true" />
              Save demo draft
            </button>
            <button className="button button-primary" type="submit">
              <Send size={17} aria-hidden="true" />
              Submit for approval
            </button>
          </div>

          <p className="host-submit-status" aria-live="polite">
            {submissionState === "draft"
              ? "Demo draft captured for this session. It has not been stored."
              : submissionState === "submitted"
                ? "Preview submitted in demo mode. No screen or approver was contacted."
                : "Host submissions will enter the NeuseCast approval queue before airing."}
          </p>
        </section>

        <aside className="host-preview-panel" aria-label="Live screen preview">
          <div className="preview-toolbar">
            <div>
              <span className="preview-live-dot" aria-hidden="true" />
              <strong>Live preview</strong>
            </div>
            <span><Eye size={15} aria-hidden="true" /> 16:9 screen</span>
          </div>

          <div className="screen-frame">
            <div className="screen-preview" style={previewStyle}>
              <span className="preview-orb preview-orb-one" aria-hidden="true" />
              <span className="preview-orb preview-orb-two" aria-hidden="true" />
              <div className="preview-grid-lines" aria-hidden="true" />

              <div className="preview-content">
                <div className="preview-kicker">
                  <span className="preview-icon">
                    <ActiveTemplateIcon size={18} aria-hidden="true" />
                  </span>
                  {activeTemplate.eyebrow}
                </div>
                <h2>{headline || "Your headline goes here"}</h2>
                <p>{body || "Add a short, useful message for your guests."}</p>
                <div className="preview-detail-row">
                  {detail ? <strong>{detail}</strong> : <span />}
                  {cta ? <span>{cta}</span> : null}
                </div>
              </div>

              <div className="preview-brand-bar">
                <span><Store size={14} aria-hidden="true" /> {venue.split(" — ")[0]}</span>
                <span>NEUSECAST</span>
              </div>
            </div>
          </div>

          <div className="preview-summary">
            <div>
              <WandSparkles size={17} aria-hidden="true" />
              <span>
                <strong>Auto-designed</strong>
                Layout, color, and type update with the selected format.
              </span>
            </div>
            <div>
              <CalendarDays size={17} aria-hidden="true" />
              <span>
                <strong>{scheduleLabel}</strong>
                {endDate ? `Runs through ${endDate}` : "No automatic end date"}
              </span>
            </div>
          </div>
        </aside>
      </form>
    </main>
  );
}
