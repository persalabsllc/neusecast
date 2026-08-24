import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { NEUSECAST_CONTACT } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage eyebrow="NeuseCast policies" title="Terms of Service">
      <section><h2>Using NeuseCast</h2><p>NeuseCast provides hosted digital-screen, campaign-management, and related services. You must provide accurate account information, safeguard your login, and use the service only for lawful business purposes.</p></section>
      <section><h2>Accounts and content</h2><p>You retain ownership of content you submit and grant NeuseCast a non-exclusive license to format, review, display, and distribute it through the network for the service. You are responsible for having the rights to every name, image, claim, offer, and link you submit.</p></section>
      <section><h2>Subscriptions</h2><p>Paid plans renew monthly until canceled. You authorize recurring charges shown at checkout. You may cancel through the billing portal; cancellation takes effect at the end of the current paid period. Except where law requires otherwise, charges for a period already begun are non-refundable.</p></section>
      <section><h2>Availability and changes</h2><p>We work to keep screens and online services available, but internet, venue, hardware, maintenance, and third-party outages can interrupt service. We may improve or change features while preserving the core value of an active paid plan.</p></section>
      <section><h2>Acceptable use</h2><p>You may not misuse the service, interfere with its operation, attempt unauthorized access, or submit unlawful, deceptive, infringing, hateful, or harmful material. We may suspend access or content that violates these terms or creates risk for viewers, venues, or the network.</p></section>
      <section><h2>Disclaimers and liability</h2><p>NeuseCast does not guarantee sales, leads, or other business outcomes. To the fullest extent permitted by law, the service is provided as available and NeuseCast is not liable for indirect, incidental, special, or consequential damages. Our aggregate liability for a claim is limited to the amount you paid NeuseCast during the three months before the event giving rise to it.</p></section>
      <section><h2>Contact</h2><p>Questions about these terms may be sent to <a href={`mailto:${NEUSECAST_CONTACT.email}`}>{NEUSECAST_CONTACT.email}</a>, directed to <a href={`tel:${NEUSECAST_CONTACT.phoneHref}`}>{NEUSECAST_CONTACT.phone}</a>, or mailed to {NEUSECAST_CONTACT.addressLine1}, {NEUSECAST_CONTACT.addressLine2}.</p></section>
    </LegalPage>
  );
}
