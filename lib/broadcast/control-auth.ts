import "server-only";

import { currentUser } from "@clerk/nextjs/server";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";

/**
 * Layout authorization is only a navigation guard. Every Studio mutation and
 * operator-facing API must call this helper as its own security boundary.
 */
export async function requireBroadcastOperator() {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);

  if (!user || !email || !isControlRoomEmail(email)) {
    throw new Error("Broadcast Studio authorization required.");
  }

  return { user, email };
}
