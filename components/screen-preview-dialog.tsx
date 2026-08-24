"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Eye, RefreshCw, X } from "lucide-react";

export function ScreenPreviewDialog({
  label,
  orientation = "landscape",
  previewUrl,
}: {
  label: string;
  orientation?: string;
  previewUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const dialogId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("preview-dialog-open");
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("preview-dialog-open");
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className="button button-secondary button-small"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen(true)}
      >
        <Eye size={14} /> Preview
      </button>
      {open ? (
        <div className="screen-preview-overlay" role="presentation">
          <button className="screen-preview-backdrop" type="button" tabIndex={-1} aria-label="Close preview" onClick={() => setOpen(false)} />
          <section ref={dialogRef} id={dialogId} className="screen-preview-dialog" role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-description`}>
            <header className="screen-preview-dialog-header">
              <div><span>Safe playlist preview</span><h2 id={`${dialogId}-title`}>{label}</h2></div>
              <div className="screen-preview-dialog-actions">
                <button className="button button-secondary button-small" type="button" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={14} /> Reload latest</button>
                <Link className="button button-secondary button-small" href={previewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open full screen</Link>
                <button ref={closeButtonRef} className="icon-button icon-button-bordered" type="button" aria-label="Close preview" onClick={() => setOpen(false)}><X size={18} /></button>
              </div>
            </header>
            <div className={`screen-preview-frame screen-preview-${orientation === "portrait" ? "portrait" : "landscape"}`}>
              <iframe key={reloadKey} src={previewUrl} title={`Playlist preview for ${label}`} />
            </div>
            <footer id={`${dialogId}-description`}><span>This preview never marks the venue device online or records an ad play.</span><span>It starts at the last item reported online, then rotates independently from the physical TV.</span></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
