import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";

export function LegalPage({ eyebrow, title, children, showEffectiveDate = true }: { eyebrow: string; title: string; children: ReactNode; showEffectiveDate?: boolean }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Brand href="/" />
        <Link href="/">Back to NeuseCast</Link>
      </header>
      <article className="legal-document">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {showEffectiveDate ? <p className="legal-effective">Effective August 24, 2026</p> : null}
        {children}
      </article>
      <nav className="legal-links" aria-label="Legal policies">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/advertising-terms">Advertising Terms</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </main>
  );
}
