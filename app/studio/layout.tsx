import type { Metadata } from "next";
import type { ReactNode } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { StudioShell } from "@/components/studio/studio-shell";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";

export const metadata: Metadata = {
  title: "Broadcast Studio",
  description: "NeuseCast broadcast automation and live playout workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);

  if (!user) redirect("/sign-in");
  if (!isControlRoomEmail(email)) redirect("/access-required?workspace=control");

  return <StudioShell>{children}</StudioShell>;
}
