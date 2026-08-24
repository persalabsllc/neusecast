import type Stripe from "stripe";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { campaignOrders } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { nextBroadcastMorning } from "@/lib/time-zone";

function idFromExpandable(value: string | { id: string } | null) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function metadataUuid(value: string | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function stripeEventDate(eventCreated: number) {
  return new Date(eventCreated * 1_000);
}

async function fulfillCheckout(session: Stripe.Checkout.Session, eventCreated: number) {
  if (session.payment_status !== "paid") return;

  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const database = getDatabase();
  const [order] = await database
    .select({
      id: campaignOrders.id,
      campaignId: campaignOrders.campaignId,
      advertiserAccountId: campaignOrders.advertiserAccountId,
      amountCents: campaignOrders.amountCents,
      currency: campaignOrders.currency,
    })
    .from(campaignOrders)
    .where(and(
      eq(campaignOrders.id, orderId),
      eq(campaignOrders.stripeCheckoutSessionId, session.id),
    ))
    .limit(1);
  if (!order) return;

  if (
    session.client_reference_id !== order.id
    || session.amount_total !== order.amountCents
    || session.currency?.toUpperCase() !== order.currency.toUpperCase()
  ) {
    throw new Error(`Stripe checkout ${session.id} did not match its NeuseCast order.`);
  }

  const subscriptionId = idFromExpandable(session.subscription);
  const customerId = idFromExpandable(session.customer);
  if (session.mode !== "subscription" || !subscriptionId || !customerId) {
    throw new Error(`Stripe checkout ${session.id} did not contain its subscription and customer.`);
  }

  const paymentIntentId = idFromExpandable(session.payment_intent);
  const paidAt = stripeEventDate(eventCreated);
  const tomorrowMorning = nextBroadcastMorning(paidAt);

  // Neon HTTP does not expose interactive transactions. A single data-modifying CTE keeps
  // the initial order, account entitlement, campaign, creative, and screen assignment
  // changes atomic. It intentionally runs for an already-paid order so a Stripe retry can
  // repair a deployment that used the older, multi-statement fulfillment path.
  await database.execute(sql`
    WITH target_order AS (
      SELECT
        orders.id,
        orders.campaign_id,
        orders.advertiser_account_id,
        orders.status AS previous_order_status,
        accounts.stripe_subscription_id AS previous_subscription_id
      FROM campaign_orders AS orders
      INNER JOIN advertiser_accounts AS accounts
        ON accounts.id = orders.advertiser_account_id
      WHERE orders.id = ${order.id}::uuid
        AND orders.campaign_id = ${order.campaignId}::uuid
        AND orders.advertiser_account_id = ${order.advertiserAccountId}::uuid
        AND orders.stripe_checkout_session_id = ${session.id}
      LIMIT 1
    ),
    paid_order AS (
      UPDATE campaign_orders AS orders
      SET
        status = 'paid'::order_status,
        stripe_payment_intent_id = ${paymentIntentId},
        paid_at = COALESCE(orders.paid_at, ${paidAt}),
        updated_at = ${paidAt}
      FROM target_order AS target
      WHERE orders.id = target.id
      RETURNING orders.id, orders.campaign_id, orders.advertiser_account_id, orders.paid_at
    ),
    fulfillment_context AS (
      SELECT
        paid.id AS order_id,
        paid.campaign_id,
        paid.advertiser_account_id,
        paid.paid_at,
        target.previous_order_status,
        target.previous_subscription_id
      FROM paid_order AS paid
      INNER JOIN target_order AS target ON target.id = paid.id
    ),
    account_state AS (
      UPDATE advertiser_accounts AS accounts
      SET
        stripe_customer_id = ${customerId},
        stripe_subscription_id = ${subscriptionId},
        subscription_status = 'active',
        stripe_event_created_at = ${paidAt},
        updated_at = ${paidAt}
      FROM fulfillment_context AS context
      WHERE accounts.id = context.advertiser_account_id
        AND (
          accounts.stripe_event_created_at IS NULL
          OR accounts.stripe_event_created_at <= ${paidAt}
        )
        AND (
          accounts.stripe_subscription_id IS NULL
          OR (
            accounts.stripe_subscription_id = ${subscriptionId}
            AND (
              accounts.subscription_status IN ('inactive', 'active', 'trialing')
              OR (
                context.previous_order_status <> 'paid'::order_status
                AND accounts.subscription_status IN ('past_due', 'unpaid')
              )
            )
          )
          OR (
            accounts.stripe_subscription_id IS DISTINCT FROM ${subscriptionId}
            AND context.previous_order_status <> 'paid'::order_status
            AND accounts.subscription_status IN ('inactive', 'past_due', 'unpaid', 'canceled')
          )
        )
      RETURNING accounts.id
    ),
    eligible_context AS (
      SELECT context.*
      FROM fulfillment_context AS context
      INNER JOIN account_state AS accounts ON accounts.id = context.advertiser_account_id
    ),
    campaign_state AS (
      UPDATE campaigns AS campaign
      SET
        status = CASE
          WHEN
            campaign.billing_paused = TRUE
            AND campaign.status = 'paused'::campaign_status
            AND context.previous_subscription_id IS DISTINCT FROM ${subscriptionId}
          THEN CASE
            WHEN campaign.starts_at IS NULL OR campaign.starts_at > ${paidAt}
              THEN 'scheduled'::campaign_status
            ELSE 'active'::campaign_status
          END
          WHEN
            campaign.id = context.campaign_id
            AND campaign.status IN (
              'draft'::campaign_status,
              'payment_pending'::campaign_status,
              'submitted'::campaign_status,
              'approved'::campaign_status
            )
          THEN 'scheduled'::campaign_status
          ELSE campaign.status
        END,
        starts_at = CASE
          WHEN campaign.id = context.campaign_id
            THEN COALESCE(campaign.starts_at, ${tomorrowMorning})
          ELSE campaign.starts_at
        END,
        ends_at = CASE
          WHEN
            campaign.id = context.campaign_id
            AND campaign.status IN (
              'draft'::campaign_status,
              'payment_pending'::campaign_status,
              'submitted'::campaign_status,
              'approved'::campaign_status
            )
          THEN NULL
          ELSE campaign.ends_at
        END,
        billing_paused = CASE
          WHEN
            campaign.billing_paused = TRUE
            AND campaign.status = 'paused'::campaign_status
            AND context.previous_subscription_id IS DISTINCT FROM ${subscriptionId}
          THEN FALSE
          WHEN
            campaign.id = context.campaign_id
            AND campaign.status IN (
              'draft'::campaign_status,
              'payment_pending'::campaign_status,
              'submitted'::campaign_status,
              'approved'::campaign_status
            )
          THEN FALSE
          ELSE campaign.billing_paused
        END,
        updated_at = ${paidAt}
      FROM eligible_context AS context
      WHERE campaign.advertiser_account_id = context.advertiser_account_id
        AND (
          campaign.id = context.campaign_id
          OR (
            context.previous_subscription_id IS DISTINCT FROM ${subscriptionId}
            AND campaign.billing_paused = TRUE
            AND campaign.status = 'paused'::campaign_status
          )
        )
      RETURNING campaign.id
    ),
    creative_state AS (
      UPDATE creatives AS creative
      SET status = 'review'::creative_status, updated_at = ${paidAt}
      FROM eligible_context AS context
      WHERE creative.campaign_id = context.campaign_id
        AND creative.status = 'draft'::creative_status
        AND creative.created_at <= context.paid_at
      RETURNING creative.id
    ),
    screen_state AS (
      INSERT INTO campaign_screens (
        campaign_id,
        screen_id,
        price_cents,
        scheduled_plays_per_day
      )
      SELECT context.campaign_id, screen.id, 0, 12
      FROM eligible_context AS context
      INNER JOIN screens AS screen ON screen.active = TRUE
      ON CONFLICT (campaign_id, screen_id) DO NOTHING
      RETURNING campaign_id
    )
    SELECT
      (SELECT COUNT(*)::integer FROM paid_order) AS order_count,
      (SELECT COUNT(*)::integer FROM account_state) AS account_count,
      (SELECT COUNT(*)::integer FROM campaign_state) AS campaign_count,
      (SELECT COUNT(*)::integer FROM creative_state) AS creative_count,
      (SELECT COUNT(*)::integer FROM screen_state) AS screen_count
  `);
}

async function markCheckoutFailed(session: Stripe.Checkout.Session, eventCreated: number) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;
  await getDatabase()
    .update(campaignOrders)
    .set({ status: "failed", updatedAt: stripeEventDate(eventCreated) })
    .where(and(
      eq(campaignOrders.id, orderId),
      eq(campaignOrders.stripeCheckoutSessionId, session.id),
      ne(campaignOrders.status, "paid"),
    ));
}

async function cancelSubscription(subscription: Stripe.Subscription, eventCreated: number) {
  const advertiserAccountId = metadataUuid(subscription.metadata?.advertiserAccountId);
  const changedAt = stripeEventDate(eventCreated);

  await getDatabase().execute(sql`
    WITH account_state AS (
      UPDATE advertiser_accounts AS accounts
      SET
        stripe_subscription_id = ${subscription.id},
        subscription_status = 'canceled',
        stripe_event_created_at = ${changedAt},
        updated_at = ${changedAt}
      WHERE (
          accounts.stripe_subscription_id = ${subscription.id}
          OR (
            ${advertiserAccountId}::uuid IS NOT NULL
            AND accounts.id = ${advertiserAccountId}::uuid
            AND accounts.stripe_subscription_id IS NULL
          )
        )
        AND (
          accounts.stripe_event_created_at IS NULL
          OR accounts.stripe_event_created_at <= ${changedAt}
        )
      RETURNING accounts.id
    ),
    campaign_state AS (
      UPDATE campaigns AS campaign
      SET
        status = 'paused'::campaign_status,
        billing_paused = TRUE,
        updated_at = ${changedAt}
      FROM account_state AS accounts
      WHERE campaign.advertiser_account_id = accounts.id
        AND campaign.billing_paused = FALSE
        AND campaign.status IN (
          'approved'::campaign_status,
          'scheduled'::campaign_status,
          'active'::campaign_status
        )
      RETURNING campaign.id
    )
    SELECT
      (SELECT COUNT(*)::integer FROM account_state) AS account_count,
      (SELECT COUNT(*)::integer FROM campaign_state) AS campaign_count
  `);
}

type InvoiceSubscriptionReference = Stripe.Invoice & {
  subscription?: string | { id: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
};

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const value = invoice as InvoiceSubscriptionReference;
  return idFromExpandable(value.subscription ?? value.parent?.subscription_details?.subscription ?? null);
}

async function setSubscriptionPaymentState(invoice: Stripe.Invoice, paid: boolean, eventCreated: number) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const customerId = idFromExpandable(invoice.customer);
  const changedAt = stripeEventDate(eventCreated);

  if (!paid) {
    await getDatabase().execute(sql`
      WITH account_state AS (
        UPDATE advertiser_accounts AS accounts
        SET
          stripe_subscription_id = ${subscriptionId},
          subscription_status = 'past_due',
          stripe_event_created_at = ${changedAt},
          updated_at = ${changedAt}
        WHERE (
          accounts.stripe_subscription_id = ${subscriptionId}
          OR (
            accounts.stripe_subscription_id IS NULL
            AND accounts.stripe_customer_id = ${customerId}
          )
        )
          AND (
            accounts.stripe_event_created_at IS NULL
            OR accounts.stripe_event_created_at <= ${changedAt}
          )
          AND accounts.subscription_status <> 'canceled'
        RETURNING accounts.id
      ),
      campaign_state AS (
        UPDATE campaigns AS campaign
        SET
          status = 'paused'::campaign_status,
          billing_paused = TRUE,
          updated_at = ${changedAt}
        FROM account_state AS accounts
        WHERE campaign.advertiser_account_id = accounts.id
          AND campaign.billing_paused = FALSE
          AND campaign.status IN (
            'approved'::campaign_status,
            'scheduled'::campaign_status,
            'active'::campaign_status
          )
        RETURNING campaign.id
      )
      SELECT
        (SELECT COUNT(*)::integer FROM account_state) AS account_count,
        (SELECT COUNT(*)::integer FROM campaign_state) AS campaign_count
    `);
    return;
  }

  await getDatabase().execute(sql`
    WITH account_state AS (
      UPDATE advertiser_accounts AS accounts
      SET
        stripe_subscription_id = ${subscriptionId},
        subscription_status = 'active',
        stripe_event_created_at = ${changedAt},
        updated_at = ${changedAt}
      WHERE (
        accounts.stripe_subscription_id = ${subscriptionId}
        OR (
          accounts.stripe_subscription_id IS NULL
          AND accounts.stripe_customer_id = ${customerId}
        )
      )
        AND (
          accounts.stripe_event_created_at IS NULL
          OR accounts.stripe_event_created_at <= ${changedAt}
        )
        AND accounts.subscription_status <> 'canceled'
      RETURNING accounts.id
    ),
    campaign_state AS (
      UPDATE campaigns AS campaign
      SET
        status = CASE
          WHEN campaign.starts_at IS NULL OR campaign.starts_at > ${changedAt}
            THEN 'scheduled'::campaign_status
          ELSE 'active'::campaign_status
        END,
        billing_paused = FALSE,
        updated_at = ${changedAt}
      FROM account_state AS accounts
      WHERE campaign.advertiser_account_id = accounts.id
        AND campaign.billing_paused = TRUE
        AND campaign.status = 'paused'::campaign_status
      RETURNING campaign.id
    )
    SELECT
      (SELECT COUNT(*)::integer FROM account_state) AS account_count,
      (SELECT COUNT(*)::integer FROM campaign_state) AS campaign_count
  `);
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
      await fulfillCheckout(event.data.object, event.created);
    } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      await markCheckoutFailed(event.data.object, event.created);
    } else if (event.type === "customer.subscription.deleted") {
      await cancelSubscription(event.data.object, event.created);
    } else if (event.type === "invoice.payment_failed") {
      await setSubscriptionPaymentState(event.data.object, false, event.created);
    } else if (event.type === "invoice.paid") {
      await setSubscriptionPaymentState(event.data.object, true, event.created);
    }
  } catch (error) {
    console.error(`Failed to process Stripe event ${event.id}`, error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
