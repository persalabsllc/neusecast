import type { ReactNode } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { verifiedPrimaryEmail } from "@/lib/auth-email";
import { isControlRoomEmail } from "@/lib/control-room-access";

export default async function ControlLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);

  if (!user) redirect("/sign-in");
  if (!isControlRoomEmail(email)) redirect("/access-required?workspace=control");

  return <AppShell>{children}</AppShell>;
}
