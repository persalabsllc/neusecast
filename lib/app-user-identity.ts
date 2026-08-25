import "server-only";

import { eq, or } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import {
  advertiserAccounts,
  appUsers,
  campaigns,
  creatives,
  hostContent,
  newsroomEditions,
  newsroomStories,
  screenAdvertiserBlocks,
  venues,
} from "@/lib/db/schema";

/**
 * Clerk can issue a new user ID after an account is deleted and recreated even
 * though the person verifies the same email. Rebind the internal account and
 * every relationship to the current Clerk identity instead of treating that
 * verified person as an unrelated user.
 */
export async function reconcileVerifiedAppUser({
  clerkUserId,
  email,
  displayName,
}: {
  clerkUserId: string;
  email: string;
  displayName: string;
}) {
  const database = getDatabase();
  const supersededEmail = `superseded.${clerkUserId}@neusecast.invalid`;
  const [[current], [legacy]] = await Promise.all([
    database
      .select({ clerkUserId: appUsers.clerkUserId })
      .from(appUsers)
      .where(eq(appUsers.clerkUserId, clerkUserId))
      .limit(1),
    database
      .select({
        clerkUserId: appUsers.clerkUserId,
        displayName: appUsers.displayName,
        role: appUsers.role,
        status: appUsers.status,
      })
      .from(appUsers)
      .where(or(eq(appUsers.email, email), eq(appUsers.email, supersededEmail)))
      .limit(1),
  ]);

  if (current || !legacy || legacy.status !== "active") return;

  await database
    .update(appUsers)
    .set({ email: supersededEmail, updatedAt: new Date() })
    .where(eq(appUsers.clerkUserId, legacy.clerkUserId));

  await database.batch([
    database.insert(appUsers).values({
      clerkUserId,
      email,
      displayName: displayName || legacy.displayName || email,
      role: legacy.role,
      status: "active",
    }),
    database.update(advertiserAccounts).set({ ownerClerkUserId: clerkUserId, updatedAt: new Date() }).where(eq(advertiserAccounts.ownerClerkUserId, legacy.clerkUserId)),
    database.update(venues).set({ hostClerkUserId: clerkUserId, updatedAt: new Date() }).where(eq(venues.hostClerkUserId, legacy.clerkUserId)),
    database.update(screenAdvertiserBlocks).set({ blockedByClerkUserId: clerkUserId }).where(eq(screenAdvertiserBlocks.blockedByClerkUserId, legacy.clerkUserId)),
    database.update(campaigns).set({ createdByClerkUserId: clerkUserId, updatedAt: new Date() }).where(eq(campaigns.createdByClerkUserId, legacy.clerkUserId)),
    database.update(creatives).set({ createdByClerkUserId: clerkUserId, updatedAt: new Date() }).where(eq(creatives.createdByClerkUserId, legacy.clerkUserId)),
    database.update(hostContent).set({ submittedByClerkUserId: clerkUserId, updatedAt: new Date() }).where(eq(hostContent.submittedByClerkUserId, legacy.clerkUserId)),
    database.update(newsroomEditions).set({ approvedByClerkUserId: clerkUserId, updatedAt: new Date() }).where(eq(newsroomEditions.approvedByClerkUserId, legacy.clerkUserId)),
    database.update(newsroomStories).set({ reviewedByClerkUserId: clerkUserId, updatedAt: new Date() }).where(eq(newsroomStories.reviewedByClerkUserId, legacy.clerkUserId)),
    database.update(appUsers).set({ status: "suspended", updatedAt: new Date() }).where(eq(appUsers.clerkUserId, legacy.clerkUserId)),
  ] as const);
}
