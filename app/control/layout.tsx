import type { ReactNode } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

const controlRoomEmails = new Set(
  (process.env.CONTROL_ROOM_EMAILS ?? "persalabsllc@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export default async function ControlLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress.toLowerCase();

  if (!user) redirect("/sign-in");
  if (!email || !controlRoomEmails.has(email)) redirect("/host");

  return <AppShell>{children}</AppShell>;
}
