import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { HostComposer } from "@/components/host-composer";

export const metadata: Metadata = {
  title: "Host portal",
  description:
    "Create and schedule venue content for a NeuseCast screen.",
};

export default function HostPage() {
  return (
    <div className="host-page">
      <header className="host-header">
        <Brand href="/" />

        <div className="host-header-actions">
          <span className="host-status-pill">
            <BadgeCheck size={15} aria-hidden="true" />
            Host workspace
          </span>
          <Link className="button button-quiet" href="/">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to NeuseCast
          </Link>
        </div>
      </header>

      <HostComposer />

      <footer className="host-footer">
        <span>NeuseCast host portal</span>
        <span>Local businesses. Local stories. On screen.</span>
      </footer>
    </div>
  );
}
