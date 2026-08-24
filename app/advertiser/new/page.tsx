import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarRange, MapPin, MonitorPlay, Sparkles } from "lucide-react";
import { createCampaignRequest } from "../actions";

export const metadata: Metadata = {
  title: "Request a campaign",
  description: "Tell NeuseCast what your business wants to promote across Eastern Carolina.",
};

type NewCampaignPageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewCampaignPage({ searchParams }: NewCampaignPageProps) {
  const params = await searchParams;

  return (
    <main className="campaign-request-page">
      <Link className="back-link" href="/advertiser"><ArrowLeft size={16} aria-hidden="true" /> Advertiser dashboard</Link>
      <div className="campaign-request-grid">
        <section className="campaign-request-copy">
          <div className="eyebrow">Campaign request</div>
          <h1>Tell us what you want Eastern Carolina to see.</h1>
          <p>This begins a proposal—there is no charge today. We’ll confirm available screens, dates, and a firm price before payment is enabled.</p>
          <div className="request-feature-list">
            <article><MapPin size={19} aria-hidden="true" /><div><strong>Local targeting</strong><span>Choose a launch market and the types of places your customers visit.</span></div></article>
            <article><MonitorPlay size={19} aria-hidden="true" /><div><strong>Clear placement</strong><span>Your proposal identifies the included screens and flight dates.</span></div></article>
            <article><Sparkles size={19} aria-hidden="true" /><div><strong>Creative included</strong><span>We turn your offer, logo, and message into screen-ready artwork.</span></div></article>
          </div>
        </section>

        <form className="campaign-request-form" action={createCampaignRequest}>
          <div className="form-heading"><span>Campaign brief</span><h2>What are we promoting?</h2></div>
          {params.error ? <p className="form-error">Please complete the campaign name, message, and valid start/end dates.</p> : null}
          <label className="field field-wide"><span className="field-label">Campaign name</span><input name="name" required placeholder="Example: Fall service special" /></label>
          <label className="field field-wide"><span className="field-label">What should customers know or do?</span><textarea name="objective" required placeholder="Describe the offer, event, service, hiring need, or message you want featured." /></label>
          <label className="field"><span className="field-label"><CalendarRange size={14} aria-hidden="true" /> Preferred start</span><input name="startsAt" type="date" required /></label>
          <label className="field"><span className="field-label"><CalendarRange size={14} aria-hidden="true" /> Preferred end</span><input name="endsAt" type="date" required /></label>
          <label className="field field-wide"><span className="field-label">Primary market</span><select name="market" defaultValue="New Bern"><option>New Bern</option><option>Craven County</option><option>Eastern Carolina</option></select></label>
          <fieldset className="venue-targeting field-wide"><legend>Preferred venue types</legend><label><input type="checkbox" name="venueTypes" value="Restaurants" /> Restaurants</label><label><input type="checkbox" name="venueTypes" value="Retail" /> Retail shops</label><label><input type="checkbox" name="venueTypes" value="Waiting Rooms" /> Waiting rooms</label><label><input type="checkbox" name="venueTypes" value="Gyms" /> Gyms &amp; recreation</label></fieldset>
          <label className="field field-wide"><span className="field-label">Anything else we should know?</span><textarea name="notes" placeholder="Audience, neighborhoods, creative ideas, category conflicts, or timing details." /></label>
          <div className="campaign-request-submit"><p>No card required. We’ll send the approved proposal to this dashboard.</p><button className="button button-primary" type="submit">Submit campaign request <ArrowRight size={17} aria-hidden="true" /></button></div>
        </form>
      </div>
    </main>
  );
}
