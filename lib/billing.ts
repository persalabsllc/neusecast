import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import {
  advertiserAccounts,
  campaignOrders,
  campaigns,
} from "@/lib/db/schema";
import { getApplicationUrl, getStripe } from "@/lib/stripe";

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function createCampaignCheckout(orderId: string, clerkUserId: string) {
  const database = getDatabase();

  const [order] = await database
    .select({
      id: campaignOrders.id,
      status: campaignOrders.status,
      amountCents: campaignOrders.amountCents,
      currency: campaignOrders.currency,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      advertiserAccountId: advertiserAccounts.id,
      businessName: advertiserAccounts.businessName,
      billingEmail: advertiserAccounts.billingEmail,
      stripeCustomerId: advertiserAccounts.stripeCustomerId,
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
  if (order.amountCents < 50) throw new BillingError("Campaign total is invalid.", 400);

  const stripe = getStripe();
  let customerId = order.stripeCustomerId;

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
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    client_reference_id: order.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: order.currency.toLowerCase(),
          unit_amount: order.amountCents,
          product_data: {
            name: `NeuseCast campaign · ${order.campaignName}`,
            description: "Managed digital-screen advertising across selected Eastern Carolina locations.",
          },
        },
      },
    ],
    metadata: {
      orderId: order.id,
      campaignId: order.campaignId,
      advertiserAccountId: order.advertiserAccountId,
    },
    payment_intent_data: {
      metadata: {
        orderId: order.id,
        campaignId: order.campaignId,
        advertiserAccountId: order.advertiserAccountId,
      },
    },
    success_url: `${applicationUrl}/advertiser/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${applicationUrl}/advertiser/checkout/cancelled?order_id=${order.id}`,
  });

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
