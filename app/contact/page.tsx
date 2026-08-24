import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";
import { LegalPage } from "@/components/legal-page";
import { NEUSECAST_CONTACT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact NeuseCast about local screen advertising, host locations, campaign support, or network questions.",
};

export default function ContactPage() {
  return (
    <LegalPage eyebrow="Let’s talk local" title="Contact NeuseCast" showEffectiveDate={false}>
      <p className="contact-intro">Questions about advertising, hosting a screen, or an active campaign? Reach the NeuseCast team directly.</p>
      <div className="contact-card-grid">
        <a className="contact-card" href={`mailto:${NEUSECAST_CONTACT.email}`}>
          <Mail size={20} aria-hidden="true" />
          <span><small>Email</small><strong>{NEUSECAST_CONTACT.email}</strong></span>
        </a>
        <a className="contact-card" href={`tel:${NEUSECAST_CONTACT.phoneHref}`}>
          <Phone size={20} aria-hidden="true" />
          <span><small>Call</small><strong>{NEUSECAST_CONTACT.phone}</strong></span>
        </a>
        <address className="contact-card">
          <MapPin size={20} aria-hidden="true" />
          <span><small>Visit or mail</small><strong>{NEUSECAST_CONTACT.addressLine1}<br />{NEUSECAST_CONTACT.addressLine2}</strong></span>
        </address>
      </div>
    </LegalPage>
  );
}
