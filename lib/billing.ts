import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import {
  advertiserAccounts,
  campaignOrders,
  campaigns,
} from "@/lib/db/schema";
import { getApplicationUrl, getStripe } from "@/lib/stripe";
import { NEUSECAST_PLAN } from "@/lib/pricing";

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function hasActiveAdvertiserSubscription(subscriptionStatus: string) {
  return subscriptionStatus === "active";
}

export function requiresAdvertiserBillingAction(subscriptionStatus: string) {
  return ["past_due", "unpaid", "paused"].includes(subscriptionStatus);
}

const EXISTING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

export async function createCampaignCheckout(orderId: string, clerkUserId: string) {
  const database = getDatabase();

  const [order] = await database
    .select({
      id: campaignOrders.id,
      status: campaignOrders.status,
      stripeCheckoutSessionId: campaignOrders.stripeCheckoutSessionId,
      amountCents: campaignOrders.amountCents,
      currency: campaignOrders.currency,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      advertiserAccountId: advertiserAccounts.id,
      businessName: advertiserAccounts.businessName,
      billingEmail: advertiserAccounts.billingEmail,
      stripeCustomerId: advertiserAccounts.stripeCustomerId,
      stripeSubscriptionId: advertiserAccounts.stripeSubscriptionId,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
    })
    .from(campaignOrders)
    .innerJoin(campaigns, eq(campaignOrders.campaignId, campaigns.id))
    .innerJoin(advertiserAccounts, eq(campaignOrders.advertiserAccountId, advertiserAccounts.id))
    .where(
      and(
        eq(campaignOrders.id, orderId),
        eq(advertiserAccounts.ownerClerkUserId, clerkUserId),
      ),
    )
    .limit(1);

  if (!order) throw new BillingError("Campaign order not found.", 404);
  if (order.status === "paid") throw new BillingError("This campaign has already been paid.", 409);
  if (order.status === "cancelled" || order.status === "refunded") {
    throw new BillingError("This campaign order is no longer payable.", 409);
  }
  if (order.amountCents !== NEUSECAST_PLAN.amountCents || order.currency !== NEUSECAST_PLAN.currency) {
    throw new BillingError("Campaign subscription price is invalid.", 400);
  }

  if (hasActiveAdvertiserSubscription(order.subscriptionStatus)) {
    throw new BillingError("Your $75 monthly NeuseCast plan is already active. Return to the advertiser dashboard to add a campaign.", 409);
  }
  if (requiresAdvertiserBillingAction(order.subscriptionStatus)) {
    throw new BillingError("Your existing subscription needs attention. Use Manage billing before creating another checkout.", 409);
  }
  if (EXISTING_SUBSCRIPTION_STATUSES.has(order.subscriptionStatus) || order.stripeSubscriptionId && order.subscriptionStatus !== "canceled" && order.subscriptionStatus !== "inactive" && order.subscriptionStatus !== "incomplete_expired") {
    throw new BillingError("An existing subscription is still being processed. Use Manage billing or refresh your advertiser dashboard.", 409);
  }

  const stripe = getStripe();
  let customerId = order.stripeCustomerId;

  if (customerId) {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const existingSubscription = subscriptions.data.find((subscription) => EXISTING_SUBSCRIPTION_STATUSES.has(subscription.status));
    if (existingSubscription) {
      throw new BillingError(
        existingSubscription.status === "past_due" || existingSubscription.status === "unpaid" || existingSubscription.status === "paused"
          ? "Your existing subscription needs attention. Use Manage billing before creating another checkout."
          : "A NeuseCast subscription already exists for this advertiser. Return to the advertiser dashboard.",
        409,
      );
    }
  }

  if (order.stripeCheckoutSessionId) {
    const existingSession = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    if (existingSession.status === "open" && existingSession.url) return existingSession.url;
    if (existingSession.status === "complete") {
      throw new BillingError("Your payment is already being processed. Refresh your campaign dashboard in a moment.", 409);
    }
  }

  const pendingOrders = await database
    .select({
      id: campaignOrders.id,
      stripeCheckoutSessionId: campaignOrders.stripeCheckoutSessionId,
    })
    .from(campaignOrders)
    .where(and(
      eq(campaignOrders.advertiserAccountId, order.advertiserAccountId),
      ne(campaignOrders.id, order.id),
      inArray(campaignOrders.status, ["pending", "failed"]),
      isNotNull(campaignOrders.stripeCheckoutSessionId),
      isNull(campaignOrders.stripePaymentIntentId),
    ))
    .orderBy(desc(campaignOrders.createdAt));

  for (const pendingOrder of pendingOrders) {
    if (!pendingOrder.stripeCheckoutSessionId) continue;
    const pendingSession = await stripe.checkout.sessions.retrieve(pendingOrder.stripeCheckoutSessionId);
    if (pendingSession.status === "open" && pendingSession.url) return pendingSession.url;
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: order.businessName,
      email: order.billingEmail,
      metadata: {
        neusecastAdvertiserAccountId: order.advertiserAccountId,
        clerkUserId,
      },
    });
    customerId = customer.id;
    await database
      .update(advertiserAccounts)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(advertiserAccounts.id, order.advertiserAccountId));
  }

  const applicationUrl = getApplicationUrl();
  const idempotencyKey = order.stripeCheckoutSessionId
    ? `neusecast-order-${order.id}-after-${order.stripeCheckoutSessionId}`
    : `neusecast-order-${order.id}-initial`;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: order.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: NEUSECAST_PLAN.amountCents,
            recurring: { interval: NEUSECAST_PLAN.interval },
            product_data: {
              name: NEUSECAST_PLAN.name,
              description: "NeuseCast advertising on every active network screen, billed monthly.",
            },
          },
        },
      ],
      metadata: {
        orderId: order.id,
        campaignId: order.campaignId,
        advertiserAccountId: order.advertiserAccountId,
      },
      subscription_data: {
        metadata: {
          orderId: order.id,
          campaignId: order.campaignId,
          advertiserAccountId: order.advertiserAccountId,
        },
      },
      success_url: `${applicationUrl}/advertiser/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${applicationUrl}/advertiser/checkout/cancelled?order_id=${order.id}`,
    },
    { idempotencyKey },
  );

  await database
    .update(campaignOrders)
    .set({
      status: "pending",
      stripeCheckoutSessionId: session.id,
      updatedAt: new Date(),
    })
    .where(eq(campaignOrders.id, order.id));

  await database
    .update(campaigns)
    .set({ status: "payment_pending", updatedAt: new Date() })
    .where(eq(campaigns.id, order.campaignId));

  if (!session.url) throw new BillingError("Stripe did not return a checkout URL.", 502);
  return session.url;
}
