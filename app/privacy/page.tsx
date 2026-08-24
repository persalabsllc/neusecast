import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Your information" title="Privacy Policy">
      <section><h2>Information we collect</h2><p>We collect account and contact details, business profile information, campaign content, billing and subscription status, support communications, and technical records such as sign-ins, screen health, and verified playback events. Payment card details are handled by Stripe and are not stored by NeuseCast.</p></section>
      <section><h2>How we use information</h2><p>We use information to authenticate users, provide and secure the service, review and deliver campaigns, process billing, report playback, support customers, prevent misuse, and improve network performance.</p></section>
      <section><h2>Service providers</h2><p>We share information only as needed with providers that support the service, including Clerk for authentication, Stripe for billing, Vercel for application hosting, and database and communications providers. We may also disclose information when required by law or to protect rights and safety.</p></section>
      <section><h2>Retention and security</h2><p>We retain information while an account is active and as reasonably needed for billing, delivery records, security, legal obligations, and dispute resolution. We use reasonable administrative and technical safeguards, but no online system can promise absolute security.</p></section>
      <section><h2>Your choices</h2><p>You may update account and campaign information in your workspace. You may request access, correction, or deletion of personal information, subject to records we must retain for legal or operational reasons.</p></section>
      <section><h2>Contact</h2><p>Privacy requests may be sent to <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p></section>
    </LegalPage>
  );
}
