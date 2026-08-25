import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radio, RadioTower } from "lucide-react";
import { Brand } from "@/components/brand";
import { PlayerRuntime } from "@/components/player-runtime";
import { getNetworkChannelManifest } from "@/lib/player/network-channel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch Live",
  description: "Watch the live NeuseCast network feed for Eastern North Carolina.",
};

export default async function WatchPage() {
  const manifest = await getNetworkChannelManifest();

  return (
    <main className="watch-page">
      <header className="sales-header watch-header">
        <nav className="sales-nav" aria-label="Watch Live navigation">
          <Brand href="/" />
          <div className="watch-nav-actions">
            <Link href="/">About NeuseCast</Link>
            <Link className="button button-primary" href="/advertiser/new">
              Advertise with us <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </nav>
      </header>

      <section className="watch-intro sales-container">
        <div>
          <div className="eyebrow"><RadioTower size={15} aria-hidden="true" /> NeuseCast Network</div>
          <h1>Watch what&apos;s playing across Eastern North Carolina.</h1>
        </div>
        <div className="watch-intro-copy">
          <p>
            A continuous look at NeuseCast network programming, including local stories,
            weather, community features, and approved advertising.
          </p>
          <span><i aria-hidden="true" /> Live network feed</span>
        </div>
      </section>

      <section className="watch-player-section sales-container" aria-label="NeuseCast live network channel">
        <div className="watch-player-frame">
          <PlayerRuntime
            initialManifest={manifest}
            playerKey="network-live"
            playerVersion="neusecast-network-web"
            publicFeed
            embedded
          />
        </div>
        <div className="watch-underbar">
          <span><Radio size={15} aria-hidden="true" /> NeuseCast Network</span>
          <p>Live programming from across the NeuseCast network</p>
          <span>Eastern North Carolina</span>
        </div>
      </section>

      <footer className="watch-footer sales-container">
        <Brand href="/" />
        <span>NeuseCast · Local screens, connected.</span>
        <Link href="/contact">Contact</Link>
      </footer>
    </main>
  );
}
