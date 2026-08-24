import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your NeuseCast workspace.",
};

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-brand-row">
        <Brand href="/" />
        <Link href="/">Back to NeuseCast</Link>
      </div>
      <section className="auth-panel">
        <div className="auth-intro">
          <div className="eyebrow">Secure workspace</div>
          <h1>Welcome back.</h1>
          <p>Sign in to manage your host screen or enter the NeuseCast control room.</p>
        </div>
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/host"
        />
      </section>
    </main>
  );
}
