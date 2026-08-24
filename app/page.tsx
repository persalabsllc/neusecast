import Link from "next/link";
import { ArrowRight, Building2, MonitorPlay, Radio } from "lucide-react";
import { Brand } from "@/components/brand";

export default function Home() {
  return (
    <main className="welcome-page">
      <nav className="welcome-nav">
        <Brand href="/" />
        <Link className="button button-quiet" href="/host">
          Host portal
        </Link>
      </nav>

      <section className="welcome-hero">
        <div className="eyebrow">Eastern Carolina&apos;s local screen network</div>
        <h1>Put the right local message on every screen.</h1>
        <p>
          NeuseCast gives local businesses useful, beautiful content while giving
          advertisers a measurable way to reach people around town.
        </p>
        <div className="button-row">
          <Link className="button button-primary" href="/control">
            Open the Control Room <ArrowRight size={17} />
          </Link>
          <Link className="button button-secondary" href="/host">
            Preview the host portal
          </Link>
        </div>
      </section>

      <section className="welcome-grid" aria-label="NeuseCast audiences">
        <article>
          <MonitorPlay aria-hidden="true" />
          <h2>For venues</h2>
          <p>Menus, specials, weather, events, and community information at no equipment cost.</p>
        </article>
        <article>
          <Building2 aria-hidden="true" />
          <h2>For advertisers</h2>
          <p>Local campaigns scheduled across the places their customers already visit.</p>
        </article>
        <article>
          <Radio aria-hidden="true" />
          <h2>For the network</h2>
          <p>One operational view for screens, playlists, approvals, campaigns, and proof of play.</p>
        </article>
      </section>

      <footer className="welcome-footer">
        <span>NeuseCast</span>
        <span>Local businesses. Local stories. On screen.</span>
      </footer>
    </main>
  );
}
