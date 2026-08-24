import Link from "next/link";
import { BadgeCheck, ArrowRight } from "lucide-react";

export default function CheckoutSuccessPage() {
  return (
    <main className="billing-result-page">
      <section className="billing-result-card">
        <span className="billing-result-icon"><BadgeCheck size={34} aria-hidden="true" /></span>
        <span className="eyebrow">Payment received</span>
        <h1>Your campaign is headed to review.</h1>
        <p>
          NeuseCast has received your order. We’ll review the campaign details and creative before anything is scheduled on local screens.
        </p>
        <Link className="button button-primary" href="/advertiser">
          View campaign status <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

