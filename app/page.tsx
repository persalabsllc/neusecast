import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  MapPin,
  MonitorPlay,
  Palette,
  Radio,
  Store,
  Target,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { NEUSECAST_CONTACT } from "@/lib/legal";
import { submitHostApplication } from "./host-application/actions";

export const metadata: Metadata = {
  title: "Local Screen Advertising Across Eastern North Carolina",
  description:
    "Advertise across NeuseCast's growing Eastern North Carolina screen network, or pair screens with Captain 97.1 underwriting for broader local reach.",
};

const advertiserBenefits = [
  {
    icon: Target,
    title: "Cover the whole network",
    copy: "One transparent plan places your campaign on every active, compatible screen, with 12 verified plays per screen each broadcast day.",
  },
  {
    icon: Palette,
    title: "Look professionally prepared",
    copy: "Send us your logo, offer, photo, and message. We turn them into polished screen creative.",
  },
  {
    icon: CalendarClock,
    title: "Stay current",
    copy: "Schedule this week’s special, a seasonal service, an event, or a hiring message without reprinting anything.",
  },
  {
    icon: BarChart3,
    title: "Understand your placement",
    copy: "See the screens, dates, and verified plays delivered by your campaign.",
  },
] as const;

const hostBenefits = [
  "No upfront equipment purchase for qualifying locations",
  "Reserved screen time for your menus, specials, and events",
  "A simple portal that turns your updates into polished graphics",
  "Remote scheduling, maintenance, and screen monitoring",
  "Venue-appropriate advertising standards and category restrictions",
  "Automatic weather, events, trivia, and local-history content",
] as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ hostApplication?: string }> }) {
  const query = await searchParams;
  return (
    <main className="sales-page">
      <header className="sales-header">
        <nav className="sales-nav" aria-label="Main navigation">
          <Brand href="/" />

          <div className="sales-nav-links">
            <Link href="/watch">Watch Live</Link>
            <a href="#advertisers">Advertise</a>
            <Link href="/media">Media options</Link>
            <a href="#how-it-works">How it works</a>
            <a href="#hosts">Host a screen</a>
            <Link href="/contact">Contact</Link>
          </div>

        </nav>
      </header>

      <section className="sales-hero sales-container">
        <div className="sales-hero-copy">
          <div className="eyebrow">A growing Eastern North Carolina screen network</div>
          <h1>Put your business where local customers already are.</h1>
          <p>
            NeuseCast delivers polished digital advertising across professionally
            managed screens in restaurants, shops, waiting rooms, gyms, and other
            trusted local businesses. Reach people in the real world without competing
            for clicks or fighting social algorithms.
          </p>
          <div className="button-row">
            <Link className="button button-primary" href="/advertiser/new?plan=screens">
            Preview your ad · $75/mo <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="button button-secondary" href="#how-it-works">
              See how it works
            </a>
          </div>
          <div className="sales-local-note">
            <Radio size={16} aria-hidden="true" />
            <span>
              NeuseCast and <a href="https://www.captain97.com" target="_blank" rel="noreferrer">Captain 97.1</a> are
              jointly owned local media companies. <Link href="/media">Explore screen + radio plans.</Link>
            </span>
          </div>
        </div>

        <div className="sales-hero-visual" aria-label="Example NeuseCast advertiser slide">
          <div className="sales-screen-shell">
            <div className="sales-screen">
              <div className="sales-screen-topline">
                <span>LOCAL BUSINESS SPOT</span>
                <span>NEW BERN</span>
              </div>
              <div className="sales-screen-message">
                <span className="sales-screen-kicker">Your next customer is already nearby.</span>
                <strong>Be their<br />next stop.</strong>
                <p>Your offer, beautifully presented in the places people already visit.</p>
              </div>
              <div className="sales-screen-footer">
                <span>YOUR BUSINESS HERE</span>
                <span>NEUSECAST</span>
              </div>
            </div>
          </div>
          <div className="sales-placement-card sales-placement-one">
            <Store size={15} aria-hidden="true" /> Restaurants &amp; shops
          </div>
          <div className="sales-placement-card sales-placement-two">
            <MapPin size={15} aria-hidden="true" /> Growing local network
          </div>
        </div>
      </section>

      <section className="sales-value-strip sales-container" aria-label="Why NeuseCast">
        <article>
          <strong>Growing network</strong>
          <span>New Eastern North Carolina venues are added as locations qualify.</span>
        </article>
        <article>
          <strong>12 verified plays</strong>
          <span>Per active, compatible screen each broadcast day.</span>
        </article>
        <article>
          <strong>Fast updates</strong>
          <span>Refresh offers, events, and seasonal messages remotely.</span>
        </article>
        <article>
          <strong>From $75/month</strong>
          <span>Screen-only and screen + radio options.</span>
        </article>
      </section>

      <section className="sales-section sales-container" id="advertisers">
        <div className="sales-section-heading">
          <div>
            <div className="eyebrow">Local advertising, made useful</div>
            <h2>Reach local customers without getting buried in another feed.</h2>
          </div>
          <p>
            NeuseCast combines the visibility of out-of-home advertising with the
            speed and flexibility of digital media across a growing network of
            qualified Eastern North Carolina host locations.
          </p>
        </div>

        <div className="advertiser-benefit-grid">
          {advertiserBenefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <article key={benefit.title}>
                <div className="benefit-number">0{index + 1}</div>
                <span className="benefit-icon"><Icon size={21} aria-hidden="true" /></span>
                <h3>{benefit.title}</h3>
                <p>{benefit.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="sales-pricing sales-container" id="pricing">
        <div className="sales-pricing-copy">
          <div className="eyebrow">Simple, transparent pricing</div>
          <h2>Every active screen. 12 verified plays. $75 a month.</h2>
          <p>No quote request, confusing package, or surprise screen fee. Build and preview your campaign online, then subscribe securely while your message is fresh.</p>
          <ul><li><Check size={16} aria-hidden="true" /> 12 verified plays per active, compatible screen each broadcast day</li><li><Check size={16} aria-hidden="true" /> Screen-ready creative and revisions</li><li><Check size={16} aria-hidden="true" /> Proof-of-play reporting</li><li><Check size={16} aria-hidden="true" /> Month-to-month; cancel anytime</li></ul>
        </div>
        <div className="sales-price-card">
          <span>ALL-SCREEN PLAN</span>
          <strong><small>$</small>75<em>/month</em></strong>
          <p>Paid campaigns enter the following day’s paced broadcast schedule, subject to a fast content review.</p>
          <Link className="button button-primary" href="/advertiser/new?plan=screens">Create your campaign <ArrowRight size={17} aria-hidden="true" /></Link>
          <small><Link className="text-link" href="/media">Compare TV + Captain 97.1 plans <ArrowRight size={14} aria-hidden="true" /></Link></small>
          <small>Secure recurring billing powered by Stripe.</small>
        </div>
      </section>

      <section className="sales-process" id="how-it-works">
        <div className="sales-container">
          <div className="sales-section-heading process-heading">
            <div>
              <div className="eyebrow">Simple from the start</div>
              <h2>From idea to local screens in three steps.</h2>
            </div>
          </div>

          <ol className="process-grid">
            <li>
              <span>1</span>
              <div>
                <h3>Create your account</h3>
                <p>Add your business and contact details so your campaigns, billing, and results stay together.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Build and preview</h3>
                <p>Write your offer, choose a visual style, and see the finished screen creative update instantly.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Subscribe and queue</h3>
                <p>Pay $75/month securely. Your creative enters review and queues for the following broadcast day.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="sales-section host-sales-section sales-container" id="hosts">
        <div className="host-sales-copy">
          <div className="eyebrow">Host a NeuseCast screen</div>
          <h2>A better business screen—provided and managed for you.</h2>
          <p>
            Qualifying host locations receive the display equipment and NeuseCast
            management without purchasing the equipment. Your business gets reserved
            screen time for menus, specials, events, hiring messages, and customer
            announcements.
          </p>
          <div className="host-inline-benefits">
            {hostBenefits.slice(0, 4).map((benefit) => <span key={benefit}><Check size={14} aria-hidden="true" /> {benefit}</span>)}
          </div>
          <small>
            Placement is subject to a location review, reliable power and internet,
            audience fit, and a host agreement.
          </small>
        </div>

        <div className="host-application-panel">
          <div className="host-application-heading">
            <span className="host-benefit-icon"><MonitorPlay size={24} aria-hidden="true" /></span>
            <div><p>Request a free screen</p><h3>Tell us about your location.</h3></div>
          </div>
          {query.hostApplication === "received" ? <div className="success-banner">Application received. Kyle will review your location and contact you directly.</div> : null}
          {query.hostApplication === "error" ? <div className="form-error">Complete every required field and confirm the placement requirements.</div> : null}
          <form action={submitHostApplication} className="host-application-form">
            <label className="host-application-honeypot" aria-hidden="true">Fax number<input name="faxNumber" tabIndex={-1} autoComplete="off" /></label>
            <label className="field field-wide"><span className="field-label">Business name</span><input name="businessName" maxLength={200} required autoComplete="organization" /></label>
            <label className="field"><span className="field-label">Venue type</span><select name="venueType" defaultValue="" required><option value="" disabled>Select one</option><option value="Restaurant or cafe">Restaurant or cafe</option><option value="Retail store">Retail store</option><option value="Medical or professional waiting room">Medical or professional waiting room</option><option value="Gym, salon, or personal care">Gym, salon, or personal care</option><option value="Hotel or lodging">Hotel or lodging</option><option value="Entertainment venue">Entertainment venue</option><option value="Other public-facing business">Other public-facing business</option></select></label>
            <label className="field"><span className="field-label">Estimated daily visitors</span><select name="dailyVisitors" defaultValue="" required><option value="" disabled>Select a range</option><option value="Under 50">Under 50</option><option value="50–100">50–100</option><option value="101–250">101–250</option><option value="251–500">251–500</option><option value="More than 500">More than 500</option></select></label>
            <label className="field"><span className="field-label">Contact name</span><input name="contactName" maxLength={160} required autoComplete="name" /></label>
            <label className="field"><span className="field-label">Email</span><input name="email" type="email" maxLength={320} required autoComplete="email" /></label>
            <label className="field"><span className="field-label">Phone</span><input name="phone" type="tel" maxLength={40} required autoComplete="tel" /></label>
            <label className="field"><span className="field-label">Website <small>optional</small></span><input name="websiteUrl" type="url" maxLength={500} placeholder="https://" autoComplete="url" /></label>
            <label className="field field-wide"><span className="field-label">Street address</span><input name="addressLine1" maxLength={200} required autoComplete="street-address" /></label>
            <label className="field"><span className="field-label">City</span><input name="city" maxLength={100} defaultValue="New Bern" required autoComplete="address-level2" /></label>
            <label className="field host-application-state"><span className="field-label">State</span><input name="state" maxLength={2} defaultValue="NC" required autoComplete="address-level1" /></label>
            <label className="field host-application-zip"><span className="field-label">ZIP</span><input name="postalCode" maxLength={12} required autoComplete="postal-code" /></label>
            <label className="field field-wide"><span className="field-label">Why would a screen work well here? <small>optional</small></span><textarea name="notes" rows={3} maxLength={1500} placeholder="Tell us where it could be mounted and how long customers typically stay." /></label>
            <label className="checkbox-field host-application-consent field-wide"><input name="acknowledged" value="yes" type="checkbox" required /><span>I understand placement depends on audience fit, reliable internet and power, available mounting space, and a host agreement.</span></label>
            <button className="button button-primary field-wide" type="submit">Apply to host a free screen <ArrowRight size={17} aria-hidden="true" /></button>
          </form>
          <p className="host-application-existing">Already approved? <Link href="/host">Open the Host Workspace</Link></p>
        </div>
      </section>

      <section className="sales-launch sales-container" id="media-options">
        <div className="sales-launch-mark" aria-hidden="true">
          <Radio size={30} />
        </div>
        <div>
          <div className="eyebrow">NeuseCast + Captain 97.1</div>
          <h2>Put your business on local screens and local radio.</h2>
          <p>
            Start with NeuseCast screens or pair your visual campaign with compliant
            underwriting acknowledgments on Captain 97.1. One local team coordinates
            both messages while each medium does what it does best.
          </p>
        </div>
        <div className="sales-launch-actions">
          <Link className="button button-primary" href="/media">
            View media options <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a className="button button-secondary" href="https://www.captain97.com/underwriting" target="_blank" rel="noreferrer">About radio underwriting</a>
        </div>
      </section>

      <section className="sales-faq sales-container" aria-labelledby="faq-title">
        <div>
          <div className="eyebrow">Common questions</div>
          <h2 id="faq-title">Straight answers before you get started.</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>Do I need to produce a video?<ChevronRight size={17} aria-hidden="true" /></summary>
            <p>No. A logo, photo, offer, and a few details are enough for us to create polished screen-ready artwork.</p>
          </details>
          <details>
            <summary>Can I change my advertisement?<ChevronRight size={17} aria-hidden="true" /></summary>
            <p>Yes. Promotions can be updated or scheduled for different dates without replacing printed materials.</p>
          </details>
          <details>
            <summary>Can hosts control what appears in their venue?<ChevronRight size={17} aria-hidden="true" /></summary>
            <p>Hosts can publish local content directly to their own screen and establish appropriate advertiser restrictions for that venue.</p>
          </details>
          <details>
            <summary>Where will my campaign appear?<ChevronRight size={17} aria-hidden="true" /></summary>
            <p>The $75/month all-screen plan includes 12 verified plays per broadcast day on every active, compatible NeuseCast screen, subject to venue restrictions and network availability.</p>
          </details>
        </div>
      </section>

      <footer className="sales-footer">
        <div className="sales-container sales-footer-inner">
          <div>
            <Brand href="/" />
            <p>Eastern Carolina&apos;s Local Screen Network</p>
          </div>
          <div className="sales-footer-links">
            <Link href="/watch">Watch Live</Link>
            <a href="#advertisers">Advertise</a>
            <Link href="/media">Media options</Link>
            <a href="https://www.captain97.com/underwriting" target="_blank" rel="noreferrer">Captain 97.1</a>
            <a href="#hosts">Host a screen</a>
            <Link href="/advertiser">Advertiser login</Link>
            <Link href="/host">Host login</Link>
            <Link href="/control">Control Room login</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/advertising-terms">Advertising terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/contact">Contact</Link>
          </div>
          <div className="sales-footer-contact">
            <a href={`mailto:${NEUSECAST_CONTACT.email}`}>{NEUSECAST_CONTACT.email}</a>
            <a href={`tel:${NEUSECAST_CONTACT.phoneHref}`}>{NEUSECAST_CONTACT.phone}</a>
            <address>{NEUSECAST_CONTACT.addressLine1}<br />{NEUSECAST_CONTACT.addressLine2}</address>
            <span><Building2 size={14} aria-hidden="true" /> Jointly owned and operated with Captain 97.1</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
