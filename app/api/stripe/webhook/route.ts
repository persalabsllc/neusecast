import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaignOrders, campaigns } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

function idFromExpandable(value: string | { id: string } | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function fulfillCheckout(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;

  const orderId = session.metadata?.orderId;
  const campaignId = session.metadata?.campaignId;
  const advertiserAccountId = session.metadata?.advertiserAccountId;
  if (!orderId || !campaignId || !advertiserAccountId) return;

  const database = getDatabase();
  await database
    .update(campaignOrders)
    .set({
      status: "paid",
      stripePaymentIntentId: idFromExpandable(session.payment_intent),
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaignOrders.id, orderId),
        eq(campaignOrders.stripeCheckoutSessionId, session.id),
      ),
    );

  await database
    .update(campaigns)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  const customerId = idFromExpandable(session.customer);
  if (customerId) {
    await database
      .update(advertiserAccounts)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(advertiserAccounts.id, advertiserAccountId));
  }
}

async function markCheckoutFailed(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;
  await getDatabase()
    .update(campaignOrders)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(campaignOrders.id, orderId),
        eq(campaignOrders.stripeCheckoutSessionId, session.id),
      ),
    );
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error("Rejected Stripe webhook", error);
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await fulfillCheckout(event.data.object);
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      await markCheckoutFailed(event.data.object);
    }
  } catch (error) {
    console.error(`Failed to process Stripe event ${event.id}`, error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
