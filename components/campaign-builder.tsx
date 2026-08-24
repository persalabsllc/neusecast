"use client";

import { useState } from "react";
import { ArrowRight, BadgeCheck, CreditCard, Eye, Sparkles } from "lucide-react";

type CampaignBuilderProps = {
  action: (formData: FormData) => void | Promise<void>;
  campaignId?: string;
  mode?: "checkout" | "included" | "revision";
  initial?: { name?: string; eyebrow?: string; headline?: string; body?: string; callToAction?: string; theme?: string };
};

const themes = [
  { value: "aqua", label: "Coastal aqua" },
  { value: "navy", label: "Deep navy" },
  { value: "coral", label: "Warm coral" },
  { value: "gold", label: "Carolina gold" },
] as const;

export function CampaignBuilder({ action, campaignId, mode = "checkout", initial = {} }: CampaignBuilderProps) {
  const [eyebrow, setEyebrow] = useState(initial.eyebrow ?? "Local business spot");
  const [headline, setHeadline] = useState(initial.headline ?? "Give them a reason to stop.");
  const [body, setBody] = useState(initial.body ?? "Share your strongest offer in one clear, useful sentence.");
  const [callToAction, setCallToAction] = useState(initial.callToAction ?? "Visit us today");
  const [theme, setTheme] = useState(initial.theme ?? "aqua");

  return (
    <form className="creative-builder" action={action}>
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      <section className="creative-builder-fields">
        <div className="form-heading"><span>Campaign studio</span><h2>Build your screen creative</h2><p>Every edit appears in the live preview. Keep it simple—the best screen ads can be understood in a few seconds.</p></div>
        <label className="field"><span className="field-label">Campaign name</span><input name="name" required maxLength={180} defaultValue={initial.name ?? "My first NeuseCast campaign"} /></label>
        <label className="field"><span className="field-label">Small heading</span><input name="eyebrow" required maxLength={50} value={eyebrow} onChange={(event) => setEyebrow(event.target.value)} /></label>
        <label className="field"><span className="field-label">Main headline</span><input name="headline" required maxLength={120} value={headline} onChange={(event) => setHeadline(event.target.value)} /></label>
        <label className="field"><span className="field-label">Supporting message</span><textarea name="body" required maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} /></label>
        <label className="field"><span className="field-label">Call to action</span><input name="callToAction" required maxLength={120} value={callToAction} onChange={(event) => setCallToAction(event.target.value)} /></label>
        <label className="field"><span className="field-label">Visual style</span><select name="theme" value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <div className="creative-builder-assurance"><BadgeCheck size={18} aria-hidden="true" /><p><strong>Creative help is included.</strong> Your draft enters review after checkout. We can polish it or contact you before it airs.</p></div>
        <button className="button button-primary creative-builder-submit" type="submit">
          {mode === "checkout" ? <><CreditCard size={17} aria-hidden="true" /> Continue to secure $75 checkout</> : <><Sparkles size={17} aria-hidden="true" /> {mode === "included" ? "Add campaign to my plan" : "Submit changes for review"}</>}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
        {mode === "checkout" ? <p className="creative-billing-note">$75/month until canceled. Your campaign is scheduled for the next broadcast day after successful payment, subject to content review.</p> : mode === "included" ? <p className="creative-billing-note">Included with your active all-screen plan. No additional charge.</p> : null}
      </section>
      <aside className="creative-preview-panel">
        <div className="creative-preview-label"><span><Eye size={15} aria-hidden="true" /> Live screen preview</span><small>16:9 display</small></div>
        <div className={`campaign-creative-preview theme-${theme}`}>
          <div className="campaign-creative-topline"><span>{eyebrow || "Local business"}</span><span>Eastern Carolina</span></div>
          <div className="campaign-creative-message"><strong>{headline || "Your headline"}</strong><p>{body || "Your supporting message"}</p></div>
          <div className="campaign-creative-footer"><span>{callToAction || "Learn more"}</span><span>NEUSECAST</span></div>
        </div>
        <div className="creative-preview-inclusions"><span>All active screens</span><span>Creative included</span><span>Cancel anytime</span></div>
      </aside>
    </form>
  );
}
