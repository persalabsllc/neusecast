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
  LogIn,
  MapPin,
  MonitorPlay,
  Palette,
  Radio,
  Store,
  Target,
} from "lucide-react";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Advertise Across Eastern Carolina",
  description:
    "Reach local customers on professionally managed screens inside trusted Eastern Carolina businesses—or apply to host a NeuseCast screen.",
};

const advertiserBenefits = [
  {
    icon: Target,
    title: "Cover the whole network",
    copy: "One transparent plan places your campaign on every active NeuseCast screen.",
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
            <a href="#advertisers">Advertise</a>
            <a href="#how-it-works">How it works</a>
            <a href="#hosts">Host a screen</a>
            <a href="#launch">Launch market</a>
          </div>

          <div className="sales-login-links">
            <Link href="/advertiser">
              <LogIn size={14} aria-hidden="true" /> Advertiser login
            </Link>
            <Link href="/host">
              <LogIn size={14} aria-hidden="true" /> Host login
            </Link>
            <Link className="button button-quiet button-small" href="/control">
              Control Room
            </Link>
          </div>
        </nav>
      </header>

      <section className="sales-hero sales-container">
        <div className="sales-hero-copy">
          <div className="eyebrow">Eastern Carolina&apos;s local screen network</div>
          <h1>Be seen where Eastern Carolina does business.</h1>
          <p>
            NeuseCast puts your message on professionally managed screens inside
            trusted local restaurants, shops, waiting rooms, gyms, and neighborhood
            businesses—without depending on clicks, cookies, or social algorithms.
          </p>
          <div className="button-row">
            <Link className="button button-primary" href="/advertiser/new">
              Build your campaign · $75/mo <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="button button-secondary" href="#how-it-works">
              See how it works
            </a>
          </div>
          <div className="sales-local-note">
            <Radio size={16} aria-hidden="true" />
            Built by the local media team behind Captain 97.1 and New Bern Websites.
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
            <MapPin size={15} aria-hidden="true" /> Eastern Carolina
          </div>
        </div>
      </section>

      <section className="sales-value-strip sales-container" aria-label="Why NeuseCast">
        <article>
          <strong>Local</strong>
          <span>Designed for Eastern Carolina businesses and customers.</span>
        </article>
        <article>
          <strong>Visible</strong>
          <span>Full-screen creative in real neighborhood locations.</span>
        </article>
        <article>
          <strong>Flexible</strong>
          <span>Update offers, events, and seasonal promotions remotely.</span>
        </article>
        <article>
            <strong>$75/month</strong>
          <span>One transparent price. Every active NeuseCast screen.</span>
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
            flexibility of digital media—built specifically for businesses serving
            Eastern North Carolina.
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
          <div className="eyebrow">Transparent founding rate</div>
          <h2>Every screen. Creative included. $75 a month.</h2>
          <p>No quote request, confusing package, or surprise screen fee. Build and preview your campaign online, then subscribe securely while your message is fresh.</p>
          <ul><li><Check size={16} aria-hidden="true" /> Placement on every active NeuseCast screen</li><li><Check size={16} aria-hidden="true" /> Screen-ready creative and revisions</li><li><Check size={16} aria-hidden="true" /> Verified proof-of-play reporting</li><li><Check size={16} aria-hidden="true" /> Cancel anytime</li></ul>
        </div>
        <div className="sales-price-card">
          <span>ALL-SCREEN PLAN</span>
          <strong><small>$</small>75<em>/month</em></strong>
          <p>Paid campaigns enter the following day’s broadcast queue, subject to a fast content review.</p>
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

      <section className="sales-launch sales-container" id="launch">
        <div className="sales-launch-mark" aria-hidden="true">
          <Layers3 size={30} />
        </div>
        <div>
          <div className="eyebrow">The founding network</div>
          <h2>Help build Eastern Carolina&apos;s local screen network.</h2>
          <p>
            NeuseCast is preparing its first host locations and advertiser roster in
            and around New Bern. Founding advertisers can lock in the simple $75 all-screen
            plan, while founding hosts receive priority installation review.
          </p>
        </div>
        <div className="sales-launch-actions">
          <Link className="button button-primary" href="/advertiser/new">
            Build a $75 campaign <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a className="button button-secondary" href="#hosts">Become a founding host</a>
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
            <p>The founding $75/month plan includes every active screen in the NeuseCast network.</p>
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
            <a href="#advertisers">Advertise</a>
            <a href="#hosts">Host a screen</a>
            <Link href="/advertiser">Advertiser login</Link>
            <Link href="/host">Host login</Link>
            <Link href="/control">Control Room login</Link>
          </div>
          <div className="sales-footer-company">
            <Building2 size={16} aria-hidden="true" /> A Persa Labs company
          </div>
        </div>
      </footer>
    </main>
  );
}
