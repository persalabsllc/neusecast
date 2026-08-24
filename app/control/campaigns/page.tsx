import {
  CalendarRange,
  CircleDollarSign,
  Eye,
  Gauge,
  Megaphone,
  MoreHorizontal,
  Plus,
  Search,
  Target,
} from "lucide-react";
import { campaigns, type CampaignStatus } from "@/lib/demo-data";

const statusLabels: Record<CampaignStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  draft: "Draft",
  paused: "Paused",
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-US");

export default function CampaignsPage() {
  const bookedWeekly = campaigns
    .filter((campaign) => campaign.status === "active" || campaign.status === "scheduled")
    .reduce((sum, campaign) => sum + campaign.weeklyRate, 0);
  const totalPlays = campaigns.reduce((sum, campaign) => sum + campaign.plays, 0);

  return (
    <div className="control-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sales & delivery</p>
          <h1>Campaigns</h1>
          <p className="page-description">
            Build advertiser flights, control where they run, and track proof of play.
          </p>
        </div>
        <div className="page-actions">
          <button className="button button-primary" type="button">
            <Plus size={16} aria-hidden="true" /> New campaign
          </button>
        </div>
      </header>

      <section className="metric-grid metric-grid-4" aria-label="Campaign summary">
        <article className="metric-card">
          <span className="metric-icon metric-icon-coral"><Megaphone size={18} aria-hidden="true" /></span>
          <div><p className="metric-label">Active campaigns</p><p className="metric-value">2</p><p className="metric-detail">1 scheduled next</p></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-green"><CircleDollarSign size={18} aria-hidden="true" /></span>
          <div><p className="metric-label">Weekly booked</p><p className="metric-value">{currency.format(bookedWeekly)}</p><p className="metric-detail">Active + scheduled</p></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue"><Eye size={18} aria-hidden="true" /></span>
          <div><p className="metric-label">Verified plays</p><p className="metric-value">{number.format(totalPlays)}</p><p className="metric-detail">Current flight window</p></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-violet"><Target size={18} aria-hidden="true" /></span>
          <div><p className="metric-label">Delivery rate</p><p className="metric-value">96.8%</p><p className="metric-detail">Against scheduled spots</p></div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-toolbar">
          <div className="segmented-control" aria-label="Filter campaigns by status">
            <button className="segment is-active" type="button">All <span>{campaigns.length}</span></button>
            <button className="segment" type="button">Active <span>2</span></button>
            <button className="segment" type="button">Upcoming <span>1</span></button>
            <button className="segment" type="button">Drafts <span>1</span></button>
          </div>
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search campaigns</span>
            <input type="search" placeholder="Search advertiser" />
          </label>
        </div>

        <div className="campaign-grid">
          {campaigns.map((campaign) => {
            const delivery = campaign.playGoal === 0 ? 0 : Math.min(100, Math.round((campaign.plays / campaign.playGoal) * 100));
            return (
              <article className="campaign-card" key={campaign.id}>
                <div className="campaign-card-head">
                  <div className="advertiser-mark" aria-hidden="true">{campaign.advertiser.slice(0, 2).toUpperCase()}</div>
                  <div className="campaign-heading">
                    <p>{campaign.advertiser}</p>
                    <h2>{campaign.name}</h2>
                  </div>
                  <button className="icon-button" type="button" aria-label={`Open actions for ${campaign.name}`}>
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                </div>

                <div className="campaign-status-line">
                  <span className={`status-badge status-${campaign.status}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {statusLabels[campaign.status]}
                  </span>
                  <span>{campaign.id}</span>
                </div>

                <dl className="campaign-details">
                  <div><dt><CalendarRange size={14} aria-hidden="true" /> Flight</dt><dd>{campaign.flight}</dd></div>
                  <div><dt><CircleDollarSign size={14} aria-hidden="true" /> Weekly</dt><dd>{currency.format(campaign.weeklyRate)}</dd></div>
                  <div><dt><Megaphone size={14} aria-hidden="true" /> Placement</dt><dd>{campaign.screenCount} screens · {campaign.primaryMarket}</dd></div>
                </dl>

                <div className="delivery-block">
                  <div className="delivery-label">
                    <span><Gauge size={14} aria-hidden="true" /> Spot delivery</span>
                    <strong>{delivery}%</strong>
                  </div>
                  <span className="progress-track progress-track-wide" aria-hidden="true">
                    <span style={{ width: `${delivery}%` }} />
                  </span>
                  <p>{number.format(campaign.plays)} of {number.format(campaign.playGoal)} planned plays</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
