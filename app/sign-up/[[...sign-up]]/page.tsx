import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a secure NeuseCast account.",
};

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <div className="auth-brand-row">
        <Brand href="/" />
        <Link href="/">Back to NeuseCast</Link>
      </div>
      <section className="auth-panel">
        <div className="auth-intro">
          <div className="eyebrow">NeuseCast account</div>
          <h1>Create your secure login.</h1>
          <p>Advertisers and host businesses use one account to manage requests, campaigns, and local screen content.</p>
        </div>
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/advertiser"
        />
      </section>
    </main>
  );
}
