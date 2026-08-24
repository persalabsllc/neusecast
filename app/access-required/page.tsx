import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { verifiedPrimaryEmail } from "@/lib/auth-email";

export const metadata: Metadata = {
  title: "Access required",
  description: "Your NeuseCast login is verified, but this workspace has not been assigned to your account.",
};

export default async function AccessRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const [user, query] = await Promise.all([currentUser(), searchParams]);
  const email = verifiedPrimaryEmail(user);
  const isControlRoom = query.workspace === "control";

  return (
    <main className="auth-page">
      <div className="auth-brand-row">
        <Brand href="/" />
        <div className="host-header-actions">
          {user ? <UserButton /> : null}
          <Link href="/"><ArrowLeft size={16} /> Back to NeuseCast</Link>
        </div>
      </div>
      <section className="auth-panel">
        <div className="auth-intro">
          <div className="eyebrow">Secure workspace</div>
          <LockKeyhole size={34} aria-hidden="true" />
          <h1>{isControlRoom ? "Control Room access is not assigned yet." : "Workspace access is not assigned yet."}</h1>
          <p>
            Your email verification succeeded{email ? <> for <strong>{email}</strong></> : null}, but this account is not on the approved operator list.
          </p>
          <p>
            Control Room access is limited to NeuseCast administrators. Contact <a href="mailto:hello@neusecast.com">hello@neusecast.com</a> to have this login approved.
          </p>
          <div className="auth-actions">
            <Link className="button button-primary" href="/control">Try again</Link>
            <Link className="button button-secondary" href="/">Return home</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
