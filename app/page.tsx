import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  Layers3,
  MapPin,
  MonitorPlay,
  Palette,
  Radio,
  Store,
  Target,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { NEUSECAST_CONTACT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Advertise Across 75+ Eastern North Carolina Locations",
  description:
    "NeuseCast is deployed in 75+ Eastern North Carolina locations. Advertise for $75/month with 12 verified plays per active, compatible screen each broadcast day.",
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

export default function Home() {
  return (
    <main className="sales-page">
      <header className="sales-header">
        <nav className="sales-nav" aria-label="Main navigation">
          <Brand href="/" />

          <div className="sales-nav-links">
            <Link href="/watch">Watch Live</Link>
            <a href="#advertisers">Advertise</a>
            <a href="#how-it-works">How it works</a>
            <a href="#hosts">Host a screen</a>
            <a href="#network">Network reach</a>
            <Link href="/contact">Contact</Link>
          </div>

        </nav>
      </header>

      <section className="sales-hero sales-container">
        <div className="sales-hero-copy">
          <div className="eyebrow">75+ locations across Eastern North Carolina</div>
          <h1>Put your business where local customers already are.</h1>
          <p>
            NeuseCast delivers polished digital advertising across professionally
            managed screens in restaurants, shops, waiting rooms, gyms, and other
            trusted local businesses. Reach people in the real world without competing
            for clicks or fighting social algorithms.
          </p>
          <div className="button-row">
            <Link className="button button-primary" href="/advertiser/new">
            Preview your ad · $75/mo <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="button button-secondary" href="#how-it-works">
              See how it works
            </a>
          </div>
          <div className="sales-local-note">
            <Radio size={16} aria-hidden="true" />
            <span>
              NeuseCast and <a href="https://captain97.com" target="_blank" rel="noreferrer">Captain 97.1</a> are
              jointly owned and operated sister media companies serving Eastern North Carolina.
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
            <MapPin size={15} aria-hidden="true" /> 75+ locations
          </div>
        </div>
      </section>

      <section className="sales-value-strip sales-container" aria-label="Why NeuseCast">
        <article>
          <strong>75+ locations</strong>
          <span>Deployed throughout Eastern North Carolina.</span>
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
            <strong>$75/month</strong>
          <span>One transparent all-screen plan.</span>
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
            speed and flexibility of digital media across more than 75 deployed
            locations throughout Eastern North Carolina.
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
          <Link className="button button-primary" href="/advertiser/new">Create your campaign <ArrowRight size={17} aria-hidden="true" /></Link>
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
          <Link className="button button-secondary" href="/host">
            Preview the host portal <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <small>
            Placement is subject to a location review, reliable power and internet,
            audience fit, and a host agreement.
          </small>
        </div>

        <div className="host-benefit-panel">
          <span className="host-benefit-icon"><MonitorPlay size={26} aria-hidden="true" /></span>
          <h3>What host locations receive</h3>
          <ul>
            {hostBenefits.map((benefit) => (
              <li key={benefit}><Check size={15} aria-hidden="true" /> {benefit}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sales-launch sales-container" id="network">
        <div className="sales-launch-mark" aria-hidden="true">
          <Layers3 size={30} />
        </div>
        <div>
          <div className="eyebrow">Established regional reach</div>
          <h2>Deployed in 75+ locations across Eastern North Carolina.</h2>
          <p>
            NeuseCast screens are installed in the restaurants, shops, waiting rooms,
            gyms, and community businesses people visit every day. Approved campaigns
            run across every active, compatible screen, with verified proof-of-play
            reporting included.
          </p>
        </div>
        <div className="sales-launch-actions">
          <Link className="button button-primary" href="/advertiser/new">
            Build a $75 campaign <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a className="button button-secondary" href="#hosts">Host a NeuseCast screen</a>
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
