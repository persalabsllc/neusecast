"use server";

import { randomUUID } from "node:crypto";
import { currentUser } from "@clerk/nextjs/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createCampaignCheckout, hasActiveAdvertiserSubscription, requiresAdvertiserBillingAction } from "@/lib/billing";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, advertiserRadioBriefs, appUsers, campaignOrders, campaignScreens, campaigns, creatives, screens } from "@/lib/db/schema";
import { DEFAULT_MEDIA_PLAN_KEY, getMediaPlan, isMediaPlanKey, mediaPlanOrDefault, planIncludesRadio } from "@/lib/pricing";
import { getApplicationUrl, getStripe } from "@/lib/stripe";
import { nextBroadcastMorning } from "@/lib/time-zone";
import { ADVERTISING_TERMS_VERSION } from "@/lib/legal";
import { reconcileVerifiedAppUser } from "@/lib/app-user-identity";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function textValue(formData: FormData, key: string, maximumLength: number) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "23505" || (candidate.cause !== error && isUniqueViolation(candidate.cause));
}

async function scheduleIncludedCampaign(campaignId: string) {
  const database = getDatabase();
  await database.update(campaigns).set({ status: "scheduled", startsAt: nextBroadcastMorning(), endsAt: null, billingPaused: false, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  await database.update(creatives).set({ status: "review", updatedAt: new Date() }).where(eq(creatives.campaignId, campaignId));
  const activeScreens = await database.select({ id: screens.id }).from(screens).where(eq(screens.active, true));
  if (activeScreens.length > 0) {
    await database.insert(campaignScreens).values(activeScreens.map((screen) => ({ campaignId, screenId: screen.id, priceCents: 0, scheduledPlaysPerDay: 12 }))).onConflictDoNothing();
  }
}

async function requireAdvertiserUser() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);

  if (!user || !email) redirect("/sign-in?redirect_url=/advertiser");
  return { user, email };
}

async function redirectToBillingPortal(stripeCustomerId: string | null) {
  if (!stripeCustomerId) redirect("/advertiser?error=billing-unavailable");
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${getApplicationUrl()}/advertiser`,
  });
  redirect(session.url);
}

export async function createAdvertiserAccount(formData: FormData) {
  const { user, email } = await requireAdvertiserUser();
  const businessName = textValue(formData, "businessName", 200);
  const billingEmail = textValue(formData, "billingEmail", 320).toLowerCase();
  const phone = textValue(formData, "phone", 40);
  const website = textValue(formData, "website", 500);
  const requestedPlanKey = textValue(formData, "planKey", 40);
  const planKey = isMediaPlanKey(requestedPlanKey) ? requestedPlanKey : DEFAULT_MEDIA_PLAN_KEY;

  if (!businessName || !billingEmail || !billingEmail.includes("@")) {
    redirect(`/advertiser?error=business-details&plan=${planKey}`);
  }

  const database = getDatabase();
  await reconcileVerifiedAppUser({
    clerkUserId: user.id,
    email,
    displayName: user.fullName ?? businessName,
  });
  const [[existingUser], [emailOwner]] = await Promise.all([
    database
      .select({ clerkUserId: appUsers.clerkUserId, status: appUsers.status })
      .from(appUsers)
      .where(eq(appUsers.clerkUserId, user.id))
      .limit(1),
    database
      .select({ clerkUserId: appUsers.clerkUserId, role: appUsers.role, status: appUsers.status })
      .from(appUsers)
      .where(eq(appUsers.email, email))
      .limit(1),
  ]);

  if (existingUser?.status === "suspended") redirect("/access-required?workspace=advertiser");

  if (!existingUser) {
    if (emailOwner && emailOwner.status !== "invited") {
      redirect(`/advertiser?error=account-conflict&plan=${planKey}`);
    }

    // A host invitation may already reserve this verified email. Move the
    // invitation to a deterministic claim address so this Clerk identity can
    // be created without losing the venue assignment waiting to be claimed.
    if (emailOwner) {
      await database
        .update(appUsers)
        .set({ email: `claiming.${user.id}@neusecast.invalid`, updatedAt: new Date() })
        .where(eq(appUsers.clerkUserId, emailOwner.clerkUserId));
    }

    await database.insert(appUsers).values({
      clerkUserId: user.id,
      email,
      displayName: user.fullName ?? businessName,
      role: "advertiser",
      status: "active",
    });
  }

  await database
    .insert(advertiserAccounts)
    .values({
      ownerClerkUserId: user.id,
      businessName,
      billingEmail,
      phone: phone || null,
      website: website || null,
    })
    .onConflictDoUpdate({
      target: advertiserAccounts.ownerClerkUserId,
      set: {
        businessName,
        billingEmail,
        phone: phone || null,
        website: website || null,
        updatedAt: new Date(),
      },
    });

  redirect(`/advertiser/new?plan=${planKey}`);
}

export async function createCampaignAndCheckout(formData: FormData) {
  const { user } = await requireAdvertiserUser();
  const database = getDatabase();
  const [account] = await database
    .select({
      id: advertiserAccounts.id,
      businessName: advertiserAccounts.businessName,
      stripeCustomerId: advertiserAccounts.stripeCustomerId,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
      subscriptionPlanKey: advertiserAccounts.subscriptionPlanKey,
    })
    .from(advertiserAccounts)
    .where(
      and(
        eq(advertiserAccounts.ownerClerkUserId, user.id),
        eq(advertiserAccounts.active, true),
      ),
    )
    .limit(1);

  if (!account) redirect("/advertiser?error=account-required");

  const submissionId = textValue(formData, "submissionId", 36);
  const name = textValue(formData, "name", 180);
  const headline = textValue(formData, "headline", 120);
  const body = textValue(formData, "body", 500);
  const callToAction = textValue(formData, "callToAction", 120);
  const eyebrow = textValue(formData, "eyebrow", 50) || "Local business";
  const theme = textValue(formData, "theme", 20) || "aqua";

  const hasActiveSubscription = hasActiveAdvertiserSubscription(account.subscriptionStatus);
  const requestedPlanKey = textValue(formData, "planKey", 40);
  const requestedPlan = getMediaPlan(requestedPlanKey || DEFAULT_MEDIA_PLAN_KEY);
  if (!hasActiveSubscription && !requestedPlan) {
    redirect(`/advertiser/new?error=plan-invalid&plan=${DEFAULT_MEDIA_PLAN_KEY}`);
  }
  const selectedPlan = hasActiveSubscription
    ? mediaPlanOrDefault(account.subscriptionPlanKey)
    : requestedPlan!;
  if (!UUID_PATTERN.test(submissionId) || !name || !headline || !body || !callToAction) {
    redirect(`/advertiser/new?error=campaign-details&plan=${selectedPlan.key}`);
  }
  const radioBrief = {
    messageFocus: textValue(formData, "radioMessageFocus", 1_000),
    destination: textValue(formData, "radioDestination", 255),
    pronunciationNotes: textValue(formData, "radioPronunciationNotes", 1_000),
    preferredTone: textValue(formData, "radioPreferredTone", 80),
  };
  if (
    !hasActiveSubscription
    && planIncludesRadio(selectedPlan)
    && (!radioBrief.messageFocus || !radioBrief.destination)
  ) {
    redirect(`/advertiser/new?error=radio-brief&plan=${selectedPlan.key}`);
  }
  const acceptedTerms = formData.get("acceptTerms") === "on";
  if (!hasActiveSubscription && !acceptedTerms) {
    redirect(`/advertiser/new?error=terms-required&plan=${selectedPlan.key}`);
  }

  if (requiresAdvertiserBillingAction(account.subscriptionStatus)) {
    await redirectToBillingPortal(account.stripeCustomerId);
  }

  const [pendingOrder] = await database
    .select({
      id: campaignOrders.id,
      campaignId: campaignOrders.campaignId,
      planKey: campaignOrders.planKey,
      amountCents: campaignOrders.amountCents,
      currency: campaignOrders.currency,
      stripeCheckoutSessionId: campaignOrders.stripeCheckoutSessionId,
    })
    .from(campaignOrders)
    .where(and(
      eq(campaignOrders.advertiserAccountId, account.id),
      inArray(campaignOrders.status, ["pending", "failed"]),
      isNull(campaignOrders.stripePaymentIntentId),
    ))
    .orderBy(desc(campaignOrders.createdAt))
    .limit(1);

  if (!hasActiveAdvertiserSubscription(account.subscriptionStatus) && pendingOrder) {
    const planChanged = pendingOrder.planKey !== selectedPlan.key
      || pendingOrder.amountCents !== selectedPlan.amountCents
      || pendingOrder.currency !== selectedPlan.currency;
    if (planChanged && pendingOrder.stripeCheckoutSessionId) {
      const existingSession = await getStripe().checkout.sessions.retrieve(pendingOrder.stripeCheckoutSessionId);
      if (existingSession.status === "open") {
        await getStripe().checkout.sessions.expire(existingSession.id);
      } else if (existingSession.status === "complete") {
        redirect("/advertiser?error=checkout-processing");
      }
    }

    const campaignUpdate = database.update(campaigns).set({
      name,
      objective: body,
      status: "payment_pending",
      targeting: { markets: ["Eastern Carolina"], notes: "All active NeuseCast screens" },
      subtotalCents: selectedPlan.amountCents,
      totalCents: selectedPlan.amountCents,
      currency: selectedPlan.currency,
      updatedAt: new Date(),
    }).where(and(eq(campaigns.id, pendingOrder.campaignId), eq(campaigns.advertiserAccountId, account.id)));

    const [draftCreative] = await database
      .select({ id: creatives.id })
      .from(creatives)
      .where(and(eq(creatives.campaignId, pendingOrder.campaignId), eq(creatives.status, "draft")))
      .orderBy(desc(creatives.createdAt))
      .limit(1);

    const orderUpdate = database.update(campaignOrders).set({
      planKey: selectedPlan.key,
      amountCents: selectedPlan.amountCents,
      currency: selectedPlan.currency,
      termsAcceptedAt: new Date(),
      termsVersion: ADVERTISING_TERMS_VERSION,
      updatedAt: new Date(),
    }).where(eq(campaignOrders.id, pendingOrder.id));

    const radioBriefUpdate = planIncludesRadio(selectedPlan)
      ? database.insert(advertiserRadioBriefs).values({
          advertiserAccountId: account.id,
          campaignId: pendingOrder.campaignId,
          status: "pending_payment",
          messageFocus: radioBrief.messageFocus,
          destination: radioBrief.destination,
          pronunciationNotes: radioBrief.pronunciationNotes || null,
          preferredTone: radioBrief.preferredTone || null,
        }).onConflictDoUpdate({
          target: advertiserRadioBriefs.advertiserAccountId,
          set: {
            campaignId: pendingOrder.campaignId,
            status: "pending_payment",
            messageFocus: radioBrief.messageFocus,
            destination: radioBrief.destination,
            pronunciationNotes: radioBrief.pronunciationNotes || null,
            preferredTone: radioBrief.preferredTone || null,
            updatedAt: new Date(),
          },
        })
      : database.update(advertiserRadioBriefs).set({ status: "retired", updatedAt: new Date() }).where(eq(advertiserRadioBriefs.advertiserAccountId, account.id));

    if (draftCreative) {
      const creativeUpdate = database.update(creatives).set({
        name,
        headline,
        body,
        callToAction,
        metadata: { eyebrow, theme, sponsor: account.businessName },
        updatedAt: new Date(),
      }).where(eq(creatives.id, draftCreative.id));
      await database.batch([campaignUpdate, creativeUpdate, orderUpdate, radioBriefUpdate] as const);
    } else {
      const creativeInsert = database.insert(creatives).values({
        campaignId: pendingOrder.campaignId,
        createdByClerkUserId: user.id,
        type: "generated_slide",
        status: "draft",
        name,
        headline,
        body,
        callToAction,
        metadata: { eyebrow, theme, sponsor: account.businessName },
      });
      await database.batch([campaignUpdate, creativeInsert, orderUpdate, radioBriefUpdate] as const);
    }

    redirect(await createCampaignCheckout(pendingOrder.id, user.id));
  }

  const orderId = randomUUID();
  const campaignInsert = database.insert(campaigns).values({
    id: submissionId,
    advertiserAccountId: account.id,
    createdByClerkUserId: user.id,
    name,
    objective: body,
    status: hasActiveSubscription ? "draft" : "payment_pending",
    targeting: { markets: ["Eastern Carolina"], notes: "All active NeuseCast screens" },
    subtotalCents: selectedPlan.amountCents,
    totalCents: selectedPlan.amountCents,
    currency: selectedPlan.currency,
  });

  const creativeInsert = database.insert(creatives).values({
    campaignId: submissionId,
    createdByClerkUserId: user.id,
    type: "generated_slide",
    status: "draft",
    name,
    headline,
    body,
    callToAction,
    metadata: { eyebrow, theme, sponsor: account.businessName },
  });

  const orderInsert = database.insert(campaignOrders).values({
    id: orderId,
    campaignId: submissionId,
    advertiserAccountId: account.id,
    planKey: selectedPlan.key,
    amountCents: selectedPlan.amountCents,
    currency: selectedPlan.currency,
    termsAcceptedAt: new Date(),
    termsVersion: ADVERTISING_TERMS_VERSION,
  });

  const radioBriefInsert = planIncludesRadio(selectedPlan)
    ? database.insert(advertiserRadioBriefs).values({
        advertiserAccountId: account.id,
        campaignId: submissionId,
        status: "pending_payment",
        messageFocus: radioBrief.messageFocus,
        destination: radioBrief.destination,
        pronunciationNotes: radioBrief.pronunciationNotes || null,
        preferredTone: radioBrief.preferredTone || null,
      }).onConflictDoUpdate({
        target: advertiserRadioBriefs.advertiserAccountId,
        set: {
          campaignId: submissionId,
          status: "pending_payment",
          messageFocus: radioBrief.messageFocus,
          destination: radioBrief.destination,
          pronunciationNotes: radioBrief.pronunciationNotes || null,
          preferredTone: radioBrief.preferredTone || null,
          updatedAt: new Date(),
        },
      })
    : database.update(advertiserRadioBriefs).set({ status: "retired", updatedAt: new Date() }).where(eq(advertiserRadioBriefs.advertiserAccountId, account.id));

  let uniqueConflict: unknown = null;
  try {
    if (hasActiveSubscription) {
      await database.batch([campaignInsert, creativeInsert] as const);
    } else {
      await database.batch([campaignInsert, creativeInsert, orderInsert, radioBriefInsert] as const);
    }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    uniqueConflict = error;
  }

  if (uniqueConflict) {
    if (hasActiveSubscription) {
      const [existingCampaign] = await database
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(eq(campaigns.id, submissionId), eq(campaigns.advertiserAccountId, account.id)))
        .limit(1);
      if (existingCampaign) {
        await scheduleIncludedCampaign(existingCampaign.id);
        redirect("/advertiser?created=1");
      }
    } else {
      const [recoveredOrder] = await database
        .select({ id: campaignOrders.id, campaignId: campaignOrders.campaignId })
        .from(campaignOrders)
        .where(and(
          eq(campaignOrders.advertiserAccountId, account.id),
          inArray(campaignOrders.status, ["pending", "failed"]),
          isNull(campaignOrders.stripePaymentIntentId),
        ))
        .orderBy(desc(campaignOrders.createdAt))
        .limit(1);
      if (recoveredOrder) {
        const recoveredRadioBrief = planIncludesRadio(selectedPlan)
          ? database.insert(advertiserRadioBriefs).values({
              advertiserAccountId: account.id,
              campaignId: recoveredOrder.campaignId,
              status: "pending_payment",
              messageFocus: radioBrief.messageFocus,
              destination: radioBrief.destination,
              pronunciationNotes: radioBrief.pronunciationNotes || null,
              preferredTone: radioBrief.preferredTone || null,
            }).onConflictDoUpdate({
              target: advertiserRadioBriefs.advertiserAccountId,
              set: {
                campaignId: recoveredOrder.campaignId,
                status: "pending_payment",
                messageFocus: radioBrief.messageFocus,
                destination: radioBrief.destination,
                pronunciationNotes: radioBrief.pronunciationNotes || null,
                preferredTone: radioBrief.preferredTone || null,
                updatedAt: new Date(),
              },
            })
          : database.update(advertiserRadioBriefs).set({ status: "retired", updatedAt: new Date() }).where(eq(advertiserRadioBriefs.advertiserAccountId, account.id));
        await database.batch([database.update(campaignOrders).set({
          planKey: selectedPlan.key,
          amountCents: selectedPlan.amountCents,
          currency: selectedPlan.currency,
          termsAcceptedAt: new Date(),
          termsVersion: ADVERTISING_TERMS_VERSION,
          updatedAt: new Date(),
        }).where(eq(campaignOrders.id, recoveredOrder.id)), recoveredRadioBrief] as const);
        redirect(await createCampaignCheckout(recoveredOrder.id, user.id));
      }
    }

    throw uniqueConflict;
  }

  if (hasActiveSubscription) {
    await scheduleIncludedCampaign(submissionId);
    redirect("/advertiser?created=1");
  }

  const checkoutUrl = await createCampaignCheckout(orderId, user.id);
  redirect(checkoutUrl);
}

export async function openBillingPortal() {
  const { user } = await requireAdvertiserUser();
  const [account] = await getDatabase()
    .select({ stripeCustomerId: advertiserAccounts.stripeCustomerId })
    .from(advertiserAccounts)
    .where(and(
      eq(advertiserAccounts.ownerClerkUserId, user.id),
      eq(advertiserAccounts.active, true),
    ))
    .limit(1);

  await redirectToBillingPortal(account?.stripeCustomerId ?? null);
}

export async function submitCampaignRevision(formData: FormData) {
  const { user } = await requireAdvertiserUser();
  const campaignId = textValue(formData, "campaignId", 36);
  const name = textValue(formData, "name", 180);
  const headline = textValue(formData, "headline", 120);
  const body = textValue(formData, "body", 500);
  const callToAction = textValue(formData, "callToAction", 120);
  const eyebrow = textValue(formData, "eyebrow", 50) || "Local business";
  const theme = textValue(formData, "theme", 20) || "aqua";
  const database = getDatabase();

  const [ownedCampaign] = await database
    .select({
      id: campaigns.id,
      advertiserAccountId: campaigns.advertiserAccountId,
      businessName: advertiserAccounts.businessName,
      billingPaused: campaigns.billingPaused,
      stripeCustomerId: advertiserAccounts.stripeCustomerId,
      subscriptionStatus: advertiserAccounts.subscriptionStatus,
    })
    .from(campaigns)
    .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
    .where(and(eq(campaigns.id, campaignId), eq(advertiserAccounts.ownerClerkUserId, user.id)))
    .limit(1);

  if (!ownedCampaign || !name || !headline || !body || !callToAction) redirect(`/advertiser/campaign/${campaignId}?error=creative`);
  if (requiresAdvertiserBillingAction(ownedCampaign.subscriptionStatus) || ownedCampaign.billingPaused) {
    await redirectToBillingPortal(ownedCampaign.stripeCustomerId);
  }
  if (!hasActiveAdvertiserSubscription(ownedCampaign.subscriptionStatus)) {
    redirect("/advertiser?error=subscription-required");
  }

  await database.update(campaigns).set({ name, objective: body, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  await database.insert(creatives).values({
    campaignId,
    createdByClerkUserId: user.id,
    type: "generated_slide",
    status: "review",
    name,
    headline,
    body,
    callToAction,
    metadata: { eyebrow, theme, sponsor: ownedCampaign.businessName, revision: true },
  });

  redirect(`/advertiser/campaign/${campaignId}?updated=1`);
}
