"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { ScreenPreviewDialog } from "@/components/screen-preview-dialog";

export function ScreenPlayerActions({ installUrl, orientation, previewLabel, previewUrl }: { installUrl?: string; orientation?: string; previewLabel: string; previewUrl: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copyInstallUrl() {
    if (!installUrl) return;
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2_000);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="player-url-actions">
      {installUrl ? <button className="button button-primary" type="button" onClick={copyInstallUrl}>
        {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
        {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy install URL"}
      </button> : null}
      <ScreenPreviewDialog label={previewLabel} orientation={orientation} previewUrl={previewUrl} />
    </div>
  );
}
