type ClerkUserWithEmail = {
  primaryEmailAddress?: {
    emailAddress: string;
    verification: { status: string } | null;
  } | null;
} | null | undefined;

/**
 * Email-based roles must never trust an address that Clerk has not verified.
 * Clerk completes this verification during the normal sign-up flow; keeping the
 * check here also protects host invitations and the Control Room if instance
 * settings change later.
 */
export function verifiedPrimaryEmail(user: ClerkUserWithEmail): string | null {
  const primaryEmail = user?.primaryEmailAddress;
  if (!primaryEmail || primaryEmail.verification?.status !== "verified") return null;
  return primaryEmail.emailAddress.trim().toLowerCase();
}

