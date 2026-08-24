import Link from "next/link";
import { ArrowLeft, CreditCard } from "lucide-react";

export default function CheckoutCancelledPage() {
  return (
    <main className="billing-result-page">
      <section className="billing-result-card">
        <span className="billing-result-icon billing-result-icon-muted"><CreditCard size={32} aria-hidden="true" /></span>
        <span className="eyebrow">Checkout paused</span>
        <h1>No payment was processed.</h1>
        <p>Your campaign is still saved. Return to the order review whenever you’re ready to finish checkout.</p>
        <Link className="button button-secondary" href="/advertiser">
          <ArrowLeft size={17} aria-hidden="true" /> Return to campaign
        </Link>
      </section>
    </main>
  );
}

