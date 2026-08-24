import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create the first NeuseCast owner account.",
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
          <h1>Create your owner login.</h1>
          <p>Use the Persa Labs email address to initialize secure access.</p>
        </div>
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/control"
        />
      </section>
    </main>
  );
}
