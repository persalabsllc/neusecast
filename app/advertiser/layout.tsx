import type { ReactNode } from "react";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { LayoutDashboard, PlusCircle } from "lucide-react";
import { Brand } from "@/components/brand";
import { verifiedPrimaryEmail } from "@/lib/auth-email";

export default async function AdvertiserLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await currentUser();
  if (!user || !verifiedPrimaryEmail(user)) redirect("/sign-in?redirect_url=/advertiser");

  return (
    <div className="advertiser-shell">
      <header className="advertiser-topbar">
        <Brand href="/" />
        <nav aria-label="Advertiser workspace">
          <Link href="/advertiser"><LayoutDashboard size={16} aria-hidden="true" /> Dashboard</Link>
          <Link href="/advertiser/new"><PlusCircle size={16} aria-hidden="true" /> Build campaign · $75/mo</Link>
        </nav>
        <div className="advertiser-account-menu">
          <span>{user.firstName ?? "Advertiser"}</span>
          <UserButton />
        </div>
      </header>
      {children}
    </div>
  );
}
