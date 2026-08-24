import {
  CalendarClock,
  ChevronDown,
  CirclePlay,
  Clock3,
  Copy,
  GripVertical,
  LockKeyhole,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { scheduleSlots, type ScheduleKind } from "@/lib/demo-data";

const kindClass: Record<ScheduleKind, string> = {
  Host: "host",
  Ad: "ad",
  Weather: "weather",
  Events: "events",
  News: "news",
  Filler: "filler",
};

export default function SchedulePage() {
  const loopSeconds = scheduleSlots.reduce((total, slot) => total + slot.duration, 0);
  const adSeconds = scheduleSlots
    .filter((slot) => slot.kind === "Ad")
    .reduce((total, slot) => total + slot.duration, 0);
  const adShare = Math.round((adSeconds / loopSeconds) * 100);

  return (
    <div className="control-page schedule-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Playlist clock</p>
          <h1>Schedule</h1>
          <p className="page-description">
            Shape the master rotation, then let each venue inherit the right local version.
          </p>
        </div>
        <div className="page-actions">
          <button className="button button-secondary" type="button">
            <Copy size={16} aria-hidden="true" /> Duplicate clock
          </button>
          <button className="button button-primary" type="button">
            Publish changes
          </button>
        </div>
      </header>

      <section className="schedule-toolbar panel">
        <div className="schedule-selector">
          <span className="metric-icon metric-icon-teal"><CalendarClock size={18} aria-hidden="true" /></span>
          <div><span>Master rotation</span><strong>Weekday · All day</strong></div>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
        <div className="schedule-stat"><span>Applies to</span><strong>5 screens · 4 zones</strong></div>
        <div className="schedule-stat"><span>Loop length</span><strong>1:{String(loopSeconds).padStart(2, "0")}</strong></div>
        <div className="schedule-stat"><span>Ad share</span><strong>{adShare}%</strong></div>
        <button className="button button-quiet" type="button"><RotateCcw size={15} aria-hidden="true" /> Revert</button>
      </section>

      <div className="schedule-workspace">
        <section className="panel playlist-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">One complete loop</p><h2>Rotation order</h2></div>
            <button className="button button-secondary button-small" type="button"><Plus size={15} aria-hidden="true" /> Add slot</button>
          </div>

          <ol className="playlist-list">
            {scheduleSlots.map((slot, index) => (
              <li className="playlist-item" key={slot.id}>
                <button className="drag-handle" type="button" aria-label={`Reorder ${slot.title}`}>
                  <GripVertical size={17} aria-hidden="true" />
                </button>
                <span className="playlist-position">{String(index + 1).padStart(2, "0")}</span>
                <span className={`slot-kind slot-kind-${kindClass[slot.kind]}`}>{slot.kind}</span>
                <div className="playlist-copy">
                  <h3>{slot.title}</h3>
                  <p>{slot.source} · {slot.destinations}</p>
                </div>
                <span className="slot-time"><Clock3 size={13} aria-hidden="true" /> {slot.time}</span>
                <strong className="slot-duration">{slot.duration}s</strong>
                {slot.locked ? (
                  <span className="slot-lock" title="Required slot"><LockKeyhole size={15} aria-label="Required slot" /></span>
                ) : (
                  <span className="slot-lock" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </section>

        <aside className="schedule-sidebar">
          <section className="panel clock-preview-card">
            <div className="panel-heading compact-panel-heading">
              <div><p className="eyebrow">Visual balance</p><h2>Clock preview</h2></div>
              <CirclePlay size={20} aria-hidden="true" />
            </div>
            <div className="clock-bars" aria-label="Playlist content mix">
              {scheduleSlots.map((slot) => (
                <span
                  className={`clock-bar clock-bar-${kindClass[slot.kind]}`}
                  key={slot.id}
                  style={{ flexGrow: slot.duration }}
                  title={`${slot.kind}: ${slot.duration} seconds`}
                />
              ))}
            </div>
            <div className="clock-legend">
              {(["Host", "Ad", "Weather", "Events", "News", "Filler"] as const).map((kind) => (
                <span key={kind}><i className={`legend-dot legend-dot-${kindClass[kind]}`} />{kind}</span>
              ))}
            </div>
          </section>

          <section className="panel autofill-card">
            <span className="metric-icon metric-icon-violet"><Sparkles size={18} aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Smart fill</p>
              <h2>Never air a blank screen</h2>
              <p>When paid or host content is unavailable, NeuseCast can select approved trivia, local history, weather, or events for that venue.</p>
              <button className="button button-secondary button-full" type="button">Configure auto-fill</button>
            </div>
          </section>

          <section className="panel guardrail-card">
            <h2>Clock guardrails</h2>
            <ul className="check-list">
              <li><span className="check-dot" /> Host content every loop</li>
              <li><span className="check-dot" /> No competing ads back-to-back</li>
              <li><span className="check-dot" /> Weather refreshes every 15 min</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
