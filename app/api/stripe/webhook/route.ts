import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaignOrders, campaignScreens, campaigns, creatives, screens } from "@/lib/db/schema";
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
  const tomorrowMorning = new Date();
  tomorrowMorning.setUTCDate(tomorrowMorning.getUTCDate() + 1);
  tomorrowMorning.setUTCHours(10, 0, 0, 0);
  await database
    .update(campaignOrders)
    .set({
      status: "paid",
      stripePaymentIntentId: idFromExpandable(session.subscription),
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
    .set({ status: "scheduled", startsAt: tomorrowMorning, endsAt: null, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  await database
    .update(creatives)
    .set({ status: "review", updatedAt: new Date() })
    .where(eq(creatives.campaignId, campaignId));

  const activeScreens = await database
    .select({ id: screens.id })
    .from(screens)
    .where(eq(screens.active, true));

  if (activeScreens.length > 0) {
    await database
      .insert(campaignScreens)
      .values(activeScreens.map((screen) => ({
        campaignId,
        screenId: screen.id,
        priceCents: 0,
        scheduledPlaysPerDay: 12,
      })))
      .onConflictDoNothing();
  }

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

async function cancelSubscription(subscription: Stripe.Subscription) {
  const database = getDatabase();
  const [order] = await database
    .select({ advertiserAccountId: campaignOrders.advertiserAccountId })
    .from(campaignOrders)
    .where(eq(campaignOrders.stripePaymentIntentId, subscription.id))
    .limit(1);
  if (!order) return;

  await database.update(campaignOrders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(campaignOrders.stripePaymentIntentId, subscription.id));
  await database.update(campaigns).set({ status: "paused", updatedAt: new Date() }).where(eq(campaigns.advertiserAccountId, order.advertiserAccountId));
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
    } else if (event.type === "customer.subscription.deleted") {
      await cancelSubscription(event.data.object);
    }
  } catch (error) {
    console.error(`Failed to process Stripe event ${event.id}`, error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
