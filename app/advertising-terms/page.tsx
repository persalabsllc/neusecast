import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { CAPTAIN_97, NEUSECAST_CONTACT } from "@/lib/legal";
import { MEDIA_PLANS } from "@/lib/pricing";

export const metadata: Metadata = { title: "Advertising Terms" };

export default function AdvertisingTermsPage() {
  return (
    <LegalPage eyebrow="For advertisers" title="Advertising Terms">
      <section>
        <h2>Month-to-month media plans</h2>
        <p>NeuseCast offers three monthly plans: {Object.values(MEDIA_PLANS).map((plan) => `${plan.name} ($${plan.amountCents / 100}/month)`).join(", ")}. Each plan renews monthly until canceled. Cancellation takes effect at the end of the current paid billing period and must be requested before the next renewal to avoid the next monthly charge.</p>
      </section>
      <section><h2>NeuseCast screen delivery</h2><p>Every plan includes approved campaigns on every compatible, active NeuseCast screen, subject to venue restrictions and network availability. Each approved campaign is scheduled for 12 verified plays per active screen during each 6:00 a.m.–6:00 a.m. broadcast day. Paid messages are paced through host and network programming and are not intentionally placed back-to-back. The number and location of active screens may change as screens are added, serviced, or temporarily taken offline.</p></section>
      <section>
        <h2>{CAPTAIN_97.name} underwriting acknowledgments</h2>
        <p>{MEDIA_PLANS.hear_see.name} includes {MEDIA_PLANS.hear_see.radioAcknowledgmentsPerMonth} underwriting acknowledgments per monthly billing period, and {MEDIA_PLANS.local_dominance.name} includes {MEDIA_PLANS.local_dominance.radioAcknowledgmentsPerMonth} per monthly billing period, scheduled on {CAPTAIN_97.name} ({CAPTAIN_97.callSign}). These are noncommercial underwriting acknowledgments—not traditional radio advertisements—and the on-air message is prepared separately from the NeuseCast screen creative.</p>
        <p>To comply with noncommercial LPFM requirements, an acknowledgment may identify the supporting business, its location, contact information, products, or services, but may not include calls to action, prices, inducements, comparative claims, or qualitative promotional language. {CAPTAIN_97.name} may edit, decline, delay, or remove wording that does not satisfy station or regulatory standards.</p>
      </section>
      <section><h2>Start dates, pacing, and make-goods</h2><p>Screen delivery normally begins on the next broadcast day after successful payment and creative approval. Radio delivery begins after the separate underwriting copy is approved and produced. When a screen or the radio station misses scheduled delivery because of maintenance, technical interruption, emergency programming, or another availability issue, NeuseCast or {CAPTAIN_97.name} may provide reasonable make-good delivery during the current or following billing period. A temporary shortfall does not automatically create a cash refund; contact us if a material delivery issue remains unresolved.</p></section>
      <section><h2>Review and venue suitability</h2><p>All creative is subject to review for clarity, accuracy, legal compliance, quality, and venue suitability. A host may restrict direct competitors or categories inappropriate for its location. We may request substantiation, revise formatting with your approval, reject content, or pause a campaign that no longer complies.</p></section>
      <section><h2>Advertiser responsibility</h2><p>You are responsible for accurate prices, dates, disclosures, availability, licenses, and claims. Offers must be honored as presented. Advertising may not promote illegal products or services, contain misleading claims, infringe third-party rights, or target viewers in a discriminatory or harmful manner.</p></section>
      <section><h2>No performance guarantee</h2><p>Proof of play confirms that a creative completed playback on a NeuseCast screen; it does not measure who saw the screen or guarantee impressions, visits, calls, sales, or any other outcome.</p></section>
      <section><h2>Questions</h2><p>Delivery or policy questions may be sent to <a href={`mailto:${NEUSECAST_CONTACT.email}`}>{NEUSECAST_CONTACT.email}</a>, directed to <a href={`tel:${NEUSECAST_CONTACT.phoneHref}`}>{NEUSECAST_CONTACT.phone}</a>, or mailed to {NEUSECAST_CONTACT.addressLine1}, {NEUSECAST_CONTACT.addressLine2}.</p></section>
    </LegalPage>
  );
}
