import type { ReactNode } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { verifiedPrimaryEmail } from "@/lib/auth-email";

const controlRoomEmails = new Set(
  (process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export default async function ControlLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await currentUser();
  const email = verifiedPrimaryEmail(user);

  if (!user) redirect("/sign-in");
  if (!email || !controlRoomEmails.has(email)) redirect("/access-required?workspace=control");

  return <AppShell>{children}</AppShell>;
}
