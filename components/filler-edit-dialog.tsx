"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import { UpdateFillerButton } from "@/components/filler-actions";
import {
  FILLER_CATEGORIES,
  FILLER_CATEGORY_LABELS,
  FILLER_THEMES,
  type FillerCategory,
  type FillerTheme,
} from "@/lib/filler/constants";

type EditableFiller = {
  id: string;
  category: FillerCategory;
  market: string | null;
  title: string;
  body: string;
  eyebrow: string;
  callToAction: string;
  sourceName: string;
  sourceUrl: string;
  artworkUrl: string;
  theme: FillerTheme;
  durationSeconds: number;
  automatic: boolean;
};

export function FillerEditDialog({
  action,
  filler,
  markets,
}: {
  action: (formData: FormData) => void | Promise<void>;
  filler: EditableFiller;
  markets: string[];
}) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const marketListId = `${dialogId}-markets`;
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
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
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
        <Pencil size={14} /> Edit
      </button>
      {open ? (
        <div className="screen-preview-overlay" role="presentation">
          <button className="screen-preview-backdrop" type="button" tabIndex={-1} aria-label="Close filler editor" onClick={() => setOpen(false)} />
          <section ref={dialogRef} id={dialogId} className="filler-edit-dialog" role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-description`}>
            <header className="screen-preview-dialog-header">
              <div><span>Edit network filler</span><h2 id={`${dialogId}-title`}>{filler.title}</h2></div>
              <button ref={closeButtonRef} className="icon-button icon-button-bordered" type="button" aria-label="Close editor" onClick={() => setOpen(false)}><X size={18} /></button>
            </header>
            <p id={`${dialogId}-description`} className="filler-edit-description">
              Changes reach online screens on their next playlist refresh. The current publish status and expiration are preserved.
              {filler.automatic ? " This automatic card can still be replaced by its next scheduled refresh." : ""}
            </p>
            <form action={action} className="filler-form filler-edit-form">
              <input type="hidden" name="contentId" value={filler.id} />
              <label className="field"><span className="field-label">Category</span><select name="category" defaultValue={filler.category}>{FILLER_CATEGORIES.map((category) => <option value={category} key={category}>{FILLER_CATEGORY_LABELS[category]}</option>)}</select></label>
              <label className="field"><span className="field-label">Market</span><input name="market" list={marketListId} defaultValue={filler.market ?? ""} placeholder="Leave blank for every market" /><datalist id={marketListId}>{markets.map((market) => <option value={market} key={market} />)}</datalist></label>
              <label className="field field-wide"><span className="field-label">Headline</span><input name="title" maxLength={180} defaultValue={filler.title} required /></label>
              <label className="field field-wide"><span className="field-label">Message</span><textarea name="body" rows={4} maxLength={1000} defaultValue={filler.body} required /></label>
              <label className="field"><span className="field-label">Eyebrow</span><input name="eyebrow" maxLength={80} defaultValue={filler.eyebrow} /></label>
              <label className="field"><span className="field-label">Call to action</span><input name="callToAction" maxLength={120} defaultValue={filler.callToAction} /></label>
              <label className="field"><span className="field-label">Source name</span><input name="sourceName" maxLength={160} defaultValue={filler.sourceName} /></label>
              <label className="field"><span className="field-label">Source URL</span><input name="sourceUrl" type="url" defaultValue={filler.sourceUrl} /></label>
              <label className="field field-wide"><span className="field-label">Artwork URL (optional)</span><input name="artworkUrl" type="url" defaultValue={filler.artworkUrl} /></label>
              <label className="field"><span className="field-label">Theme</span><select name="theme" defaultValue={filler.theme}>{FILLER_THEMES.map((theme) => <option value={theme} key={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>)}</select></label>
              <label className="field"><span className="field-label">Screen time (seconds)</span><input name="durationSeconds" type="number" min="8" max="30" step="1" defaultValue={filler.durationSeconds} required /></label>
              <div className="field-wide form-actions filler-edit-actions">
                <button className="button button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
                <UpdateFillerButton />
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
