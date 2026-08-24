import Link from "next/link";
import { BadgeCheck, ArrowRight } from "lucide-react";

export default function CheckoutSuccessPage() {
  return (
    <main className="billing-result-page">
      <section className="billing-result-card">
        <span className="billing-result-icon"><BadgeCheck size={34} aria-hidden="true" /></span>
        <span className="eyebrow">Subscription active</span>
        <h1>You’re in tomorrow’s broadcast queue.</h1>
        <p>
          Your $75 monthly subscription is active. NeuseCast will review your creative today; approved creative is scheduled across every active screen beginning the following broadcast day.
        </p>
        <Link className="button button-primary" href="/advertiser">
          View campaign status <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
