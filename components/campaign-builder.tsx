"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, BadgeCheck, CreditCard, Eye, Sparkles } from "lucide-react";
import Link from "next/link";

type CampaignBuilderProps = {
  action: (formData: FormData) => void | Promise<void>;
  campaignId?: string;
  submissionId?: string;
  mode?: "checkout" | "included" | "revision" | "house";
  initial?: { name?: string; eyebrow?: string; headline?: string; body?: string; callToAction?: string; theme?: string };
};

const themes = [
  { value: "aqua", label: "Coastal aqua" },
  { value: "navy", label: "Deep navy" },
  { value: "coral", label: "Warm coral" },
  { value: "gold", label: "Carolina gold" },
] as const;

function CampaignSubmitButton({ mode }: { mode: NonNullable<CampaignBuilderProps["mode"]> }) {
  const { pending } = useFormStatus();

  return (
    <button className="button button-primary creative-builder-submit" type="submit" disabled={pending}>
      {pending ? (
        <><Sparkles size={17} aria-hidden="true" /> Preparing your campaign…</>
      ) : mode === "checkout" ? (
        <><CreditCard size={17} aria-hidden="true" /> Continue to secure $75 checkout</>
      ) : mode === "house" ? (
        <><Sparkles size={17} aria-hidden="true" /> Publish house advertisement</>
      ) : (
        <><Sparkles size={17} aria-hidden="true" /> {mode === "included" ? "Add campaign to my plan" : "Submit changes for review"}</>
      )}
      <ArrowRight size={17} aria-hidden="true" />
    </button>
  );
}

export function CampaignBuilder({ action, campaignId, submissionId, mode = "checkout", initial = {} }: CampaignBuilderProps) {
  const [eyebrow, setEyebrow] = useState(initial.eyebrow ?? "");
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [callToAction, setCallToAction] = useState(initial.callToAction ?? "");
  const [theme, setTheme] = useState(initial.theme ?? "aqua");

  return (
    <form className="creative-builder" action={action}>
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      {submissionId ? <input type="hidden" name="submissionId" value={submissionId} /> : null}
      <section className="creative-builder-fields">
        <div className="form-heading"><span>{mode === "house" ? "House advertising studio" : "Campaign studio"}</span><h2>Build your screen creative</h2><p>Every edit appears in the live preview. Keep it simple—the best screen ads can be understood in a few seconds.</p></div>
        {mode === "house" ? <>
          <label className="field"><span className="field-label">Advertiser or brand</span><input name="sponsor" required maxLength={200} placeholder="Captain 97.1, New Bern Websites, or client name" /></label>
          <label className="field"><span className="field-label">House ad purpose</span><select name="houseAdKind" defaultValue="direct_in_person"><option value="direct_in_person">Direct sale · in person</option><option value="direct_phone">Direct sale · phone order</option><option value="complimentary">Complimentary / freebie</option><option value="trial">Trial advertisement</option><option value="captain_97">Captain 97.1 promotion</option><option value="new_bern_websites">New Bern Websites promotion</option><option value="neusecast">NeuseCast promotion</option><option value="other">Other internal use</option></select></label>
        </> : null}
        <label className="field"><span className="field-label">Campaign name</span><input name="name" required maxLength={180} defaultValue={initial.name ?? ""} placeholder="Internal name for this campaign" /></label>
        <label className="field"><span className="field-label">Small heading</span><input name="eyebrow" required maxLength={50} value={eyebrow} placeholder="What kind of message is this?" onChange={(event) => setEyebrow(event.target.value)} /></label>
        <label className="field"><span className="field-label">Main headline</span><input name="headline" required maxLength={120} value={headline} placeholder="Your strongest message" onChange={(event) => setHeadline(event.target.value)} /></label>
        <label className="field"><span className="field-label">Supporting message</span><textarea name="body" required maxLength={500} value={body} placeholder="Add the useful details customers need" onChange={(event) => setBody(event.target.value)} /></label>
        <label className="field"><span className="field-label">Call to action</span><input name="callToAction" required maxLength={120} value={callToAction} placeholder="What should customers do next?" onChange={(event) => setCallToAction(event.target.value)} /></label>
        <label className="field"><span className="field-label">Visual style</span><select name="theme" value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {mode === "house" ? <div className="house-ad-schedule-grid">
          <label className="field"><span className="field-label">Start time</span><input name="startsAt" type="datetime-local" /><small>Leave blank to begin immediately.</small></label>
          <label className="field"><span className="field-label">End time</span><input name="endsAt" type="datetime-local" /><small>Leave blank for no expiration.</small></label>
          <label className="field"><span className="field-label">Spot length</span><select name="durationSeconds" defaultValue="15"><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option></select></label>
          <label className="field"><span className="field-label">Target plays per screen/day</span><input name="playsPerDay" type="number" min="1" max="48" defaultValue="12" required /></label>
        </div> : null}
        <div className="creative-builder-assurance"><BadgeCheck size={18} aria-hidden="true" /><p>{mode === "house" ? <><strong>Checkout and billing are bypassed.</strong> Publishing makes this a normal scheduled advertisement with pacing and verified proof-of-play on every active screen.</> : <><strong>Creative help is included.</strong> Your draft enters review after checkout. We can polish it or contact you before it airs.</>}</p></div>
        {mode === "checkout" ? (
          <label className="checkout-consent">
            <input name="acceptTerms" type="checkbox" required />
            <span>I agree to the <Link href="/terms" target="_blank">Terms of Service</Link>, <Link href="/advertising-terms" target="_blank">Advertising Terms</Link>, and acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span>
          </label>
        ) : null}
        <CampaignSubmitButton mode={mode} />
        {mode === "checkout" ? <p className="creative-billing-note">$75/month until canceled. Approved campaigns are paced for 12 verified plays per active screen each broadcast day.</p> : mode === "included" ? <p className="creative-billing-note">Included with your active all-screen plan. No additional charge.</p> : mode === "house" ? <p className="creative-billing-note">Control-room entry · no advertiser account, checkout, invoice, or subscription required.</p> : null}
      </section>
      <aside className="creative-preview-panel">
        <div className="creative-preview-label"><span><Eye size={15} aria-hidden="true" /> Live screen preview</span><small>16:9 display</small></div>
        <div className={`campaign-creative-preview theme-${theme}`}>
          <div className="campaign-creative-topline"><span>{eyebrow || "Local business"}</span><span>Eastern Carolina</span></div>
          <div className="campaign-creative-message"><strong>{headline || "Your headline"}</strong><p>{body || "Your supporting message"}</p></div>
          <div className="campaign-creative-footer"><span>{callToAction || "Learn more"}</span><span>NEUSECAST</span></div>
        </div>
        <div className="creative-preview-inclusions">{mode === "house" ? <><span>All active screens</span><span>Normal ad pacing</span><span>Proof of play</span></> : <><span>All active screens</span><span>Creative included</span><span>Cancel anytime</span></>}</div>
      </aside>
    </form>
  );
}
