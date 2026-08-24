"use client";

import type { CSSProperties } from "react";
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
  Send,
  Sparkles,
  Store,
  Utensils,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { submitHostContent } from "@/app/host/actions";

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

type HostScreenOption = { id: string; label: string };

export function HostComposer({ screens }: { screens: HostScreenOption[] }) {
  const [templateId, setTemplateId] = useState<TemplateId>("special");
  const [headline, setHeadline] = useState(fieldDefaults.special.headline);
  const [body, setBody] = useState(fieldDefaults.special.body);
  const [detail, setDetail] = useState(fieldDefaults.special.detail);
  const [cta, setCta] = useState(fieldDefaults.special.cta);
  const [screenId, setScreenId] = useState(screens[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");

  const activeTemplate =
    templates.find((template) => template.id === templateId) ?? templates[0];
  const ActiveTemplateIcon = activeTemplate.icon;
  const scheduleLabel = formatSchedule(startDate, startTime);
  const previewStyle = {
    "--preview-accent": activeTemplate.accent,
  } as CSSProperties;
  const selectedScreen = screens.find((screen) => screen.id === screenId) ?? screens[0];

  function chooseTemplate(nextTemplate: Template) {
    const defaults = fieldDefaults[nextTemplate.id];
    setTemplateId(nextTemplate.id);
    setHeadline(defaults.headline);
    setBody(defaults.body);
    setDetail(defaults.detail);
    setCta(defaults.cta);
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
            <strong>Your assigned screen</strong>
            <span>Changes here affect only the location you select below.</span>
          </div>
        </div>
      </section>

      <form className="host-composer" action={submitHostContent}>
        <input type="hidden" name="template" value={templateId} />
        <input type="hidden" name="startsAt" value={startDate ? `${startDate}T${startTime || "00:00"}` : ""} />
        <input type="hidden" name="endsAt" value={endDate ? `${endDate}T23:59` : ""} />
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
                  name="headline"
                  value={headline}
                  maxLength={52}
                  required
                  onChange={(event) => setHeadline(event.target.value)}
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
                  name="body"
                  rows={3}
                  maxLength={120}
                  required
                  onChange={(event) => setBody(event.target.value)}
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
                  name="detail"
                  value={detail}
                  maxLength={32}
                  onChange={(event) => setDetail(event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Call to action</span>
                <input
                  type="text"
                  name="callToAction"
                  value={cta}
                  maxLength={52}
                  onChange={(event) => setCta(event.target.value)}
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
                <select name="screenId" value={screenId} onChange={(event) => setScreenId(event.target.value)} required>
                  {screens.map((screen) => (
                    <option value={screen.id} key={screen.id}>
                      {screen.label}
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
            <button className="button button-primary" type="submit">
              <Send size={17} aria-hidden="true" />
              Publish to this screen
            </button>
          </div>

          <p className="host-submit-status" aria-live="polite">
            Local venue content publishes only to the selected screen. NeuseCast can still review or remove it from the Control Room.
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
                <span><Store size={14} aria-hidden="true" /> {selectedScreen?.label.split(" — ")[0] ?? "Your venue"}</span>
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
