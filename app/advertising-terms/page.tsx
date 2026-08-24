import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { NEUSECAST_CONTACT } from "@/lib/legal";

export const metadata: Metadata = { title: "Advertising Terms" };

export default function AdvertisingTermsPage() {
  return (
    <LegalPage eyebrow="For advertisers" title="Advertising Terms">
      <section><h2>The founding all-screen plan</h2><p>The $75 monthly plan includes approved campaigns on every compatible, active NeuseCast screen, subject to venue restrictions and network availability. The number and location of active screens can change as the network grows or a venue temporarily goes offline.</p></section>
      <section><h2>Delivery and pacing</h2><p>Each approved campaign is scheduled for 12 verified plays per active screen during each 6:00 a.m.–6:00 a.m. broadcast day. Paid messages are paced through host and network programming and are not intentionally placed back-to-back. Delivery begins after successful payment and approval, normally on the next broadcast day.</p></section>
      <section><h2>Missed delivery</h2><p>When a screen misses scheduled plays because it was offline or unavailable, NeuseCast may pace make-good plays gradually after service resumes. A temporary shortfall does not automatically create a cash refund; contact us if a material delivery issue remains unresolved.</p></section>
      <section><h2>Review and venue suitability</h2><p>All creative is subject to review for clarity, accuracy, legal compliance, quality, and venue suitability. A host may restrict direct competitors or categories inappropriate for its location. We may request substantiation, revise formatting with your approval, reject content, or pause a campaign that no longer complies.</p></section>
      <section><h2>Advertiser responsibility</h2><p>You are responsible for accurate prices, dates, disclosures, availability, licenses, and claims. Offers must be honored as presented. Advertising may not promote illegal products or services, contain misleading claims, infringe third-party rights, or target viewers in a discriminatory or harmful manner.</p></section>
      <section><h2>No performance guarantee</h2><p>Proof of play confirms that a creative completed playback on a NeuseCast screen; it does not measure who saw the screen or guarantee impressions, visits, calls, sales, or any other outcome.</p></section>
      <section><h2>Questions</h2><p>Delivery or policy questions may be sent to <a href={`mailto:${NEUSECAST_CONTACT.email}`}>{NEUSECAST_CONTACT.email}</a>, directed to <a href={`tel:${NEUSECAST_CONTACT.phoneHref}`}>{NEUSECAST_CONTACT.phone}</a>, or mailed to {NEUSECAST_CONTACT.addressLine1}, {NEUSECAST_CONTACT.addressLine2}.</p></section>
    </LegalPage>
  );
}
