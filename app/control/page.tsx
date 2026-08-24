import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  CloudSun,
  DollarSign,
  Eye,
  ExternalLink,
  HeartPulse,
  Megaphone,
  MonitorCheck,
  Play,
  Radio,
  Sparkles,
  TimerReset,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";

const metrics = [
  {
    label: "Screens online",
    value: "3 / 5",
    detail: "Two players need attention",
    trend: "60% reporting",
    icon: MonitorCheck,
    tone: "teal",
  },
  {
    label: "Active campaigns",
    value: "7",
    detail: "3,248 plays this week",
    trend: "+12% vs last week",
    icon: Megaphone,
    tone: "coral",
  },
  {
    label: "Inventory sold",
    value: "62%",
    detail: "38% available to sell",
    trend: "+8 points this month",
    icon: TrendingUp,
    tone: "blue",
  },
  {
    label: "Monthly booked",
    value: "$2,850",
    detail: "$4,600 network capacity",
    trend: "$750 awaiting approval",
    icon: DollarSign,
    tone: "gold",
  },
] as const;

const operationsQueue = [
  {
    title: "Approve Persimmons dinner special",
    meta: "Submitted by host · 18 minutes ago",
    action: "Review",
    icon: BadgeCheck,
    tone: "teal",
  },
  {
    title: "Replace Trent Buick spring creative",
    meta: "Campaign changes tomorrow at 6:00 AM",
    action: "Open campaign",
    icon: TimerReset,
    tone: "coral",
  },
  {
    title: "Reconnect SoundSide Outfitters",
    meta: "Player last checked in 2 hours ago",
    action: "Troubleshoot",
    icon: CircleAlert,
    tone: "amber",
  },
] as const;

const screens = [
  {
    name: "Baker’s Kitchen",
    location: "Downtown New Bern",
    status: "Online",
    heartbeat: "Just now",
    playlist: "Breakfast rotation",
    fill: 72,
  },
  {
    name: "Persimmons Waterfront",
    location: "East Front Street",
    status: "Online",
    heartbeat: "1 min ago",
    playlist: "Lunch + waterfront",
    fill: 64,
  },
  {
    name: "Cella Ford",
    location: "Havelock · US-70 corridor",
    status: "Online",
    heartbeat: "44 sec ago",
    playlist: "Customer lounge",
    fill: 58,
  },
  {
    name: "Coastal Carolina Health",
    location: "Neuse Boulevard",
    status: "Attention",
    heartbeat: "9 min ago",
    playlist: "Waiting room",
    fill: 60,
  },
  {
    name: "SoundSide Outfitters",
    location: "Morehead City",
    status: "Offline",
    heartbeat: "2 hours ago",
    playlist: "Last cached rotation",
    fill: 48,
  },
] as const;

const hourFill = [38, 52, 64, 58, 72, 82, 74, 62, 57, 68, 78, 60];

export default function ControlDashboard() {
  return (
    <div className="dashboard-page">
      <section className="dashboard-intro" aria-labelledby="dashboard-summary-title">
        <div>
          <p className="dashboard-date">
            <CalendarDays size={16} aria-hidden="true" /> Monday, August 24
          </p>
          <h2 id="dashboard-summary-title">Your local network at a glance.</h2>
          <p>See what is playing, what needs attention, and where there is room to sell.</p>
        </div>
        <div className="dashboard-actions">
          <Link className="button button-secondary" href="/player/demo-new-bern" target="_blank" rel="noreferrer">
            <Play size={17} aria-hidden="true" /> Open live player
          </Link>
          <Link className="button button-secondary" href="/host">
            <Sparkles size={17} aria-hidden="true" /> Create host content
          </Link>
          <Link className="button button-primary" href="/control/campaigns">
            New campaign <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="metric-grid" aria-label="Network performance">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className={`metric-card metric-card-${metric.tone}`} key={metric.label}>
              <div className="metric-heading">
                <span>{metric.label}</span>
                <span className="metric-icon" aria-hidden="true">
                  <Icon size={19} />
                </span>
              </div>
              <strong className="metric-value">{metric.value}</strong>
              <p>{metric.detail}</p>
              <span className="metric-trend">{metric.trend}</span>
            </article>
          );
        })}
      </section>

      <section className="dashboard-primary-grid">
        <article className="panel now-running-panel" aria-labelledby="now-running-title">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">
                <Radio size={14} aria-hidden="true" /> Live network
              </span>
              <h2 id="now-running-title">Now running</h2>
            </div>
            <Link className="text-link" href="/control/schedule">
              Full schedule <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="now-running-body">
            <div className="screen-preview" aria-label="Preview of the current NeuseCast slide">
              <div className="screen-preview-topline">
                <span className="preview-brand">NEUSECAST</span>
                <span className="preview-live-badge">
                  <span aria-hidden="true" /> LIVE
                </span>
              </div>
              <div className="preview-weather">
                <CloudSun size={24} aria-hidden="true" />
                <span>
                  <strong>84°</strong>
                  <small>New Bern</small>
                </span>
              </div>
              <div className="preview-message">
                <span className="preview-eyebrow">Around town</span>
                <strong>Surf, sip &amp; stay local.</strong>
                <p>Make the most of a beautiful day on the Neuse.</p>
              </div>
              <div className="preview-footer">
                <span>
                  <Waves size={16} aria-hidden="true" /> High tide 4:18 PM
                </span>
                <span>Local businesses. Local stories.</span>
              </div>
            </div>

            <div className="now-running-details">
              <span className="content-type-badge">Community filler</span>
              <h3>Eastern Carolina summer</h3>
              <p>Auto-generated local lifestyle card · Network-wide</p>

              <dl className="now-running-stats">
                <div>
                  <dt>On air</dt>
                  <dd>
                    <Play size={14} aria-hidden="true" /> 4 screens
                  </dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>
                    <Clock3 size={14} aria-hidden="true" /> 12 seconds
                  </dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>CarolinaEast Health</dd>
                </div>
              </dl>

              <div className="play-progress" aria-label="Current slide is 72 percent complete">
                <span style={{ width: "72%" }} />
              </div>
              <div className="play-progress-labels" aria-hidden="true">
                <span>00:08</span>
                <span>00:12</span>
              </div>
              <Link className="button button-primary now-running-player-link" href="/player/demo-new-bern" target="_blank" rel="noreferrer">
                View full-screen player <ExternalLink size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </article>

        <article className="panel operations-panel" aria-labelledby="operations-title">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Today&apos;s work</span>
              <h2 id="operations-title">Operations queue</h2>
            </div>
            <span className="queue-count">3</span>
          </div>

          <div className="operations-list">
            {operationsQueue.map((item) => {
              const Icon = item.icon;
              return (
                <div className="operation-item" key={item.title}>
                  <span className={`operation-icon operation-icon-${item.tone}`} aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div className="operation-copy">
                    <strong>{item.title}</strong>
                    <p>{item.meta}</p>
                    <button className="operation-action" type="button">
                      {item.action} <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="operations-complete">
            <Check size={16} aria-hidden="true" />
            <span>
              <strong>6 items completed</strong>
              <small>since 8:00 AM</small>
            </span>
          </div>
        </article>
      </section>

      <section className="dashboard-secondary-grid">
        <article className="panel screen-health-panel" aria-labelledby="screen-health-title">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">
                <HeartPulse size={14} aria-hidden="true" /> Player status
              </span>
              <h2 id="screen-health-title">Screen health</h2>
            </div>
            <Link className="text-link" href="/control/screens">
              Manage screens <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="screen-table-wrap">
            <table className="screen-table">
              <thead>
                <tr>
                  <th scope="col">Venue</th>
                  <th scope="col">Status</th>
                  <th scope="col">Current playlist</th>
                  <th scope="col">Sold</th>
                </tr>
              </thead>
              <tbody>
                {screens.map((screen) => (
                  <tr key={screen.name}>
                    <td>
                      <span className="screen-name">{screen.name}</span>
                      <small>{screen.location}</small>
                    </td>
                    <td>
                      <span
                        className={`screen-status ${
                          screen.status === "Online" ? "is-online" : "needs-attention"
                        }`}
                      >
                        <span aria-hidden="true" /> {screen.status}
                      </span>
                      <small>{screen.heartbeat}</small>
                    </td>
                    <td>{screen.playlist}</td>
                    <td>
                      <div className="inventory-cell">
                        <span className="inventory-bar" aria-hidden="true">
                          <span style={{ width: `${screen.fill}%` }} />
                        </span>
                        <span>{screen.fill}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel inventory-panel" aria-labelledby="inventory-title">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">
                <Eye size={14} aria-hidden="true" /> Today
              </span>
              <h2 id="inventory-title">Sellable inventory</h2>
            </div>
            <span className="inventory-summary">38% open</span>
          </div>

          <div className="inventory-chart" aria-label="Available advertising inventory by hour">
            {hourFill.map((height, index) => (
              <span className="inventory-chart-column" key={`${index}-${height}`}>
                <span style={{ height: `${height}%` }} />
              </span>
            ))}
          </div>
          <div className="inventory-axis" aria-hidden="true">
            <span>6 AM</span>
            <span>Noon</span>
            <span>6 PM</span>
          </div>

          <div className="inventory-opportunity">
            <span className="opportunity-icon" aria-hidden="true">
              <Users size={17} />
            </span>
            <div>
              <strong>Best opening: weekday mornings</strong>
              <p>Package 6–10 AM across 4 venues for a projected 890 weekly impressions.</p>
            </div>
          </div>

          <Link className="button button-secondary button-full" href="/control/campaigns">
            Build a package <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </article>
      </section>
    </div>
  );
}
