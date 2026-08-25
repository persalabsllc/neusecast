import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ExternalLink,
  Globe2,
  MonitorPlay,
  Radio,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Brand } from "@/components/brand";
import {
  CAPTAIN_97,
  NEUSECAST_CONTACT,
  NEW_BERN_WEBSITES,
} from "@/lib/legal";
import { MEDIA_PLANS, type MediaPlanKey } from "@/lib/pricing";
import styles from "./media.module.css";

export const metadata: Metadata = {
  title: "Local Media Plans · Screens, Radio, and Web",
  description:
    "Reach Eastern North Carolina with NeuseCast screen advertising, Captain 97.1 underwriting, and conversion-focused websites from New Bern Websites.",
};

const planFeatures: Record<MediaPlanKey, readonly string[]> = {
  screens: [
    "Every active, compatible NeuseCast screen",
    "12 verified plays per screen each broadcast day",
    "Screen-ready creative and revisions",
    "Proof-of-play reporting",
  ],
  hear_see: [
    "Everything in the NeuseCast Screens plan",
    `${MEDIA_PLANS.hear_see.radioAcknowledgmentsPerMonth} Captain 97.1 acknowledgments each month`,
    "Separate, station-compliant underwriting copy",
    "Coordinated screen and radio launch",
  ],
  local_dominance: [
    "Everything in the NeuseCast Screens plan",
    `${MEDIA_PLANS.local_dominance.radioAcknowledgmentsPerMonth} Captain 97.1 acknowledgments each month`,
    "Separate, station-compliant underwriting copy",
    "Our highest-frequency local media plan",
  ],
};

const process = [
  {
    number: "01",
    title: "Tell us what matters",
    copy: "Share your business, offer, audience, and the action you want local customers to take.",
  },
  {
    number: "02",
    title: "We adapt the message",
    copy: "Your screen creative can sell directly. Your radio acknowledgment is written separately for noncommercial LPFM compliance.",
  },
  {
    number: "03",
    title: "Your campaign goes local",
    copy: "Approved creative joins NeuseCast rotation, and qualifying plans receive their monthly Captain 97.1 schedule.",
  },
] as const;

export default function MediaPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Local media navigation">
          <Brand href="/" />
          <div className={styles.navLinks}>
            <Link href="/">NeuseCast</Link>
            <Link href="/watch">Watch live</Link>
            <a href={CAPTAIN_97.underwritingUrl} target="_blank" rel="noreferrer">Captain 97.1</a>
            <a href={NEW_BERN_WEBSITES.website} target="_blank" rel="noreferrer">Websites</a>
            <Link className={`button button-primary ${styles.navCta}`} href="/advertiser/new?plan=screens">Start a campaign</Link>
          </div>
        </nav>
      </header>

      <section className={`${styles.hero} ${styles.container}`}>
        <div className={styles.heroCopy}>
          <div className={styles.kicker}><Sparkles size={15} aria-hidden="true" /> Three local channels. One coordinated media team.</div>
          <h1>Be seen.<br />Be heard.<br /><em>Be remembered.</em></h1>
          <p>
            Pair polished NeuseCast screen advertising with compliant underwriting
            acknowledgments on Captain 97.1—then give customers a better place to land
            with New Bern Websites.
          </p>
          <div className={styles.heroActions}>
            <a className="button button-primary" href="#plans">Compare monthly plans <ArrowRight size={17} aria-hidden="true" /></a>
            <Link className="button button-secondary" href="/watch">See NeuseCast live</Link>
          </div>
          <span className={styles.monthlyNote}><BadgeCheck size={15} aria-hidden="true" /> Every media plan is month-to-month.</span>
        </div>

        <div className={styles.heroVisual} aria-label="NeuseCast, Captain 97.1, and New Bern Websites media channels">
          <div className={`${styles.channelCard} ${styles.screenChannel}`}>
            <span><MonitorPlay size={17} aria-hidden="true" /> NEUSECAST</span>
            <strong>Seen in the places people already visit.</strong>
            <div className={styles.screenMock} aria-hidden="true">
              <i />
              <b>YOUR<br />BUSINESS</b>
              <small>LOCAL SCREENS · CONNECTED</small>
            </div>
          </div>
          <div className={`${styles.channelCard} ${styles.radioChannel}`}>
            <span><Radio size={17} aria-hidden="true" /> CAPTAIN 97.1</span>
            <strong>Heard across New Bern and online.</strong>
            <div className={styles.radioDial} aria-hidden="true"><small>WXNR-LP</small><b>97.1</b><i /></div>
          </div>
          <div className={`${styles.channelCard} ${styles.webChannel}`}>
            <span><Globe2 size={17} aria-hidden="true" /> NEW BERN WEBSITES</span>
            <strong>Found when customers are ready to act.</strong>
          </div>
        </div>
      </section>

      <section className={`${styles.channelSection} ${styles.container}`} aria-labelledby="channels-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>One message, built for each medium</span>
            <h2 id="channels-title">Local reach works better when it works together.</h2>
          </div>
          <p>Each channel has a different job. We coordinate the campaign without forcing the same creative into places where it does not belong.</p>
        </div>
        <div className={styles.channelGrid}>
          <article>
            <span className={styles.iconBox}><MonitorPlay size={23} aria-hidden="true" /></span>
            <small>BE SEEN</small>
            <h3>NeuseCast screens</h3>
            <p>Bright, professionally prepared visual messages in participating restaurants, shops, waiting rooms, and other host venues.</p>
            <Link href="/watch">Watch the network <ArrowRight size={14} aria-hidden="true" /></Link>
          </article>
          <article>
            <span className={`${styles.iconBox} ${styles.coralIcon}`}><Volume2 size={23} aria-hidden="true" /></span>
            <small>BE HEARD</small>
            <h3>Captain 97.1</h3>
            <p>Consistent recognition through business underwriting acknowledgments structured for noncommercial LPFM guidelines on WXNR-LP and its online stream.</p>
            <a href={CAPTAIN_97.underwritingUrl} target="_blank" rel="noreferrer">Explore underwriting <ExternalLink size={13} aria-hidden="true" /></a>
          </article>
          <article>
            <span className={`${styles.iconBox} ${styles.goldIcon}`}><Globe2 size={23} aria-hidden="true" /></span>
            <small>BE FOUND</small>
            <h3>New Bern Websites</h3>
            <p>Custom websites that give the attention generated by screens and radio a clear path toward calls, inquiries, and appointments.</p>
            <a href={NEW_BERN_WEBSITES.website} target="_blank" rel="noreferrer">Explore website services <ExternalLink size={13} aria-hidden="true" /></a>
          </article>
        </div>
      </section>

      <section className={styles.plansSection} id="plans" aria-labelledby="plans-title">
        <div className={styles.container}>
          <div className={styles.plansHeading}>
            <span className={styles.eyebrow}>Simple monthly media plans</span>
            <h2 id="plans-title">Start with screens. Add the frequency of local radio.</h2>
            <p>All three plans are month-to-month. Screen placement follows active network availability and venue restrictions.</p>
          </div>
          <div className={styles.planGrid}>
            {Object.values(MEDIA_PLANS).map((plan) => {
              const featured = plan.key === "hear_see";
              const highFrequency = plan.key === "local_dominance";
              const amountDollars = plan.amountCents / 100;
              return (
                <article className={`${styles.planCard} ${featured ? styles.featuredPlan : ""} ${highFrequency ? styles.highFrequencyPlan : ""}`} key={plan.key}>
                  {featured ? <span className={styles.popular}>BEST PLACE TO START</span> : null}
                  <div className={styles.planTopline}>
                    <span>{plan.radioAcknowledgmentsPerMonth ? "SCREENS + RADIO" : "SCREENS"}</span>
                    {plan.radioAcknowledgmentsPerMonth ? <Radio size={18} aria-hidden="true" /> : <MonitorPlay size={18} aria-hidden="true" />}
                  </div>
                  <h3>{plan.name}</h3>
                  <div className={styles.price}><small>$</small>{amountDollars}<span>/month</span></div>
                  <p>{plan.description}</p>
                  <ul>
                    {planFeatures[plan.key].map((feature) => <li key={feature}><Check size={15} aria-hidden="true" /> {feature}</li>)}
                  </ul>
                  <Link className={`button ${featured || highFrequency ? "button-primary" : "button-secondary"} ${styles.planButton}`} href={`/advertiser/new?plan=${plan.key}`}>
                    Choose {plan.name} <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <small className={styles.planFinePrint}>{plan.radioAcknowledgmentsPerMonth ? "Radio copy is separately reviewed for LPFM underwriting compliance." : "No radio acknowledgments are included in this plan."}</small>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.compliance} ${styles.container}`}>
        <div className={styles.complianceMark}><Radio size={31} aria-hidden="true" /><span>97.1 FM</span></div>
        <div>
          <span className={styles.eyebrow}>Local radio, handled correctly</span>
          <h2>Underwriting is recognition—not a traditional commercial.</h2>
          <p>
            Captain 97.1 is noncommercial WXNR-LP. On-air acknowledgments may identify
            your business, location, contact information, products, and services, but
            they avoid calls to action, prices, inducements, and comparative or
            qualitative promotional claims. We write the radio version separately so
            your screen campaign can remain direct while your station message remains compliant.
          </p>
          <a href={CAPTAIN_97.underwritingUrl} target="_blank" rel="noreferrer">Read Captain 97.1 underwriting details <ExternalLink size={14} aria-hidden="true" /></a>
        </div>
      </section>

      <section className={`${styles.processSection} ${styles.container}`} aria-labelledby="process-title">
        <div className={styles.processIntro}>
          <span className={styles.eyebrow}>One coordinated workflow</span>
          <h2 id="process-title">One business story. Two distinct messages.</h2>
        </div>
        <ol className={styles.processGrid}>
          {process.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${styles.websiteSection} ${styles.container}`}>
        <div className={styles.websiteVisual} aria-hidden="true">
          <div className={styles.browserBar}><i /><i /><i /><span>yourbusiness.com</span></div>
          <div className={styles.browserBody}><small>LOCAL BUSINESS</small><strong>Turn attention<br />into action.</strong><span /></div>
        </div>
        <div className={styles.websiteCopy}>
          <span className={styles.eyebrow}>Need the destination too?</span>
          <h2>Give interested customers somewhere better to land.</h2>
          <p>New Bern Websites designs the professional, mobile-first destination your screen and radio campaign can point people toward. Website projects are quoted separately and are not included in the monthly media plans.</p>
          <a className="button button-secondary" href={NEW_BERN_WEBSITES.website} target="_blank" rel="noreferrer">Visit New Bern Websites <ExternalLink size={15} aria-hidden="true" /></a>
        </div>
      </section>

      <section className={`${styles.finalCta} ${styles.container}`}>
        <div>
          <span className={styles.eyebrow}>Built here for local businesses</span>
          <h2>Ready to be the business people remember?</h2>
          <p>Choose a monthly plan online or talk directly with Kyle about the right mix for your business.</p>
        </div>
        <div className={styles.finalActions}>
          <Link className="button button-primary" href="/advertiser/new?plan=hear_see">Start with Hear It + See It <ArrowRight size={17} aria-hidden="true" /></Link>
          <a className="button button-secondary" href={`mailto:${NEUSECAST_CONTACT.email}?subject=NeuseCast%20media%20plans`}>Talk with Kyle</a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <div><Brand href="/" /><p>Local screens, local radio, and a better digital home.</p></div>
          <div className={styles.footerLinks}>
            <Link href="/">NeuseCast</Link>
            <Link href="/watch">Watch live</Link>
            <a href={CAPTAIN_97.underwritingUrl} target="_blank" rel="noreferrer">Captain 97.1</a>
            <a href={NEW_BERN_WEBSITES.website} target="_blank" rel="noreferrer">New Bern Websites</a>
            <Link href="/advertising-terms">Advertising terms</Link>
          </div>
          <div className={styles.footerContact}>
            <a href={`mailto:${NEUSECAST_CONTACT.email}`}>{NEUSECAST_CONTACT.email}</a>
            <a href={`tel:${NEUSECAST_CONTACT.phoneHref}`}>{NEUSECAST_CONTACT.phone}</a>
            <span>{NEUSECAST_CONTACT.addressLine1}<br />{NEUSECAST_CONTACT.addressLine2}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
