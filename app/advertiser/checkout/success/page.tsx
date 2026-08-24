import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { BadgeCheck, ArrowRight, Clock3, TriangleAlert } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaignOrders } from "@/lib/db/schema";

type CheckoutSuccessPageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const user = await currentUser();
  const { session_id: sessionId } = await searchParams;
  if (!user) redirect("/sign-in?redirect_url=/advertiser");
  if (!sessionId || !sessionId.startsWith("cs_") || sessionId.length > 255) notFound();

  const [order] = await getDatabase()
    .select({
      status: campaignOrders.status,
      advertiserActive: advertiserAccounts.active,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
    })
    .from(campaignOrders)
    .innerJoin(advertiserAccounts, eq(campaignOrders.advertiserAccountId, advertiserAccounts.id))
    .where(and(
      eq(campaignOrders.stripeCheckoutSessionId, sessionId),
      eq(advertiserAccounts.ownerClerkUserId, user.id),
    ))
    .limit(1);
  if (!order) notFound();

  const paid = order.status === "paid" && order.advertiserActive && order.subscriptionStatus === "active";
  const failed = ["failed", "cancelled", "refunded"].includes(order.status);
  const needsAttention = order.status === "paid" && !paid;
  return (
    <main className="billing-result-page">
      <section className="billing-result-card">
        <span className="billing-result-icon">{paid ? <BadgeCheck size={34} aria-hidden="true" /> : failed || needsAttention ? <TriangleAlert size={34} aria-hidden="true" /> : <Clock3 size={34} aria-hidden="true" />}</span>
        <span className="eyebrow">{paid ? "Subscription active" : failed || needsAttention ? "Billing needs attention" : "Confirming secure payment"}</span>
        <h1>{paid ? "You’re in tomorrow’s broadcast queue." : failed ? "Your campaign has not been queued." : needsAttention ? "Your campaign is currently paused." : "Stripe is confirming your subscription."}</h1>
        <p>{paid
          ? "Your $75 monthly subscription is active. NeuseCast will review your creative today; approved creative is scheduled across every active screen beginning the following broadcast day."
          : failed
            ? "No campaign will air until payment is successfully completed. Return to your dashboard to retry or review the campaign."
            : needsAttention
              ? "Stripe previously confirmed this checkout, but the advertiser subscription is not currently entitled to air. Open your dashboard to update billing before the campaign resumes."
              : "Your checkout completed, but the signed Stripe confirmation is still processing. This normally takes only a moment; refresh this page or view your campaign status."}</p>
        {!paid && !failed && !needsAttention ? <Link className="button button-secondary" href={`/advertiser/checkout/success?session_id=${encodeURIComponent(sessionId)}`}>Refresh confirmation</Link> : null}
        <Link className="button button-primary" href="/advertiser">
          View campaign status <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
