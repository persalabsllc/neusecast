"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, BadgeCheck, CreditCard, Eye, MonitorPlay, Radio, Sparkles } from "lucide-react";
import Link from "next/link";
import { MEDIA_PLANS, type MediaPlanKey } from "@/lib/pricing";

type CampaignBuilderProps = {
  action: (formData: FormData) => void | Promise<void>;
  campaignId?: string;
  submissionId?: string;
  mode?: "checkout" | "included" | "revision" | "house";
  initial?: { name?: string; eyebrow?: string; headline?: string; body?: string; callToAction?: string; theme?: string };
  initialPlan?: MediaPlanKey;
  initialRadioBrief?: {
    messageFocus?: string;
    destination?: string;
    pronunciationNotes?: string;
    preferredTone?: string;
  };
};

const mediaPlanKeys: MediaPlanKey[] = ["screens", "hear_see", "local_dominance"];

function monthlyPrice(amountCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

const themes = [
  { value: "aqua", label: "Coastal aqua" },
  { value: "navy", label: "Deep navy" },
  { value: "coral", label: "Warm coral" },
  { value: "gold", label: "Carolina gold" },
] as const;

function CampaignSubmitButton({ mode, planKey }: { mode: NonNullable<CampaignBuilderProps["mode"]>; planKey: MediaPlanKey }) {
  const { pending } = useFormStatus();
  const plan = MEDIA_PLANS[planKey];

  return (
    <button className="button button-primary creative-builder-submit" type="submit" disabled={pending}>
      {pending ? (
        <><Sparkles size={17} aria-hidden="true" /> Preparing your campaign…</>
      ) : mode === "checkout" ? (
        <><CreditCard size={17} aria-hidden="true" /> Continue to secure {monthlyPrice(plan.amountCents)}/month checkout</>
      ) : mode === "house" ? (
        <><Sparkles size={17} aria-hidden="true" /> Publish house advertisement</>
      ) : (
        <><Sparkles size={17} aria-hidden="true" /> {mode === "included" ? `Add campaign to ${plan.name}` : "Submit changes for review"}</>
      )}
      <ArrowRight size={17} aria-hidden="true" />
    </button>
  );
}

export function CampaignBuilder({
  action,
  campaignId,
  submissionId,
  mode = "checkout",
  initial = {},
  initialPlan = "screens",
  initialRadioBrief = {},
}: CampaignBuilderProps) {
  const [eyebrow, setEyebrow] = useState(initial.eyebrow ?? "");
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [callToAction, setCallToAction] = useState(initial.callToAction ?? "");
  const [theme, setTheme] = useState(initial.theme ?? "aqua");
  const [planKey, setPlanKey] = useState<MediaPlanKey>(initialPlan);
  const selectedPlan = MEDIA_PLANS[planKey];
  const includesRadio = selectedPlan.radioAcknowledgmentsPerMonth > 0;
  const showMediaPlan = mode !== "house" && mode !== "revision";

  return (
    <form className="creative-builder" action={action}>
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      {submissionId ? <input type="hidden" name="submissionId" value={submissionId} /> : null}
      {showMediaPlan && mode !== "checkout" ? <input type="hidden" name="planKey" value={planKey} /> : null}
      <section className="creative-builder-fields">
        <div className="form-heading"><span>{mode === "house" ? "House advertising studio" : "Campaign studio"}</span><h2>Build your screen creative</h2><p>Every edit appears in the live preview. Keep it simple—the best screen ads can be understood in a few seconds.</p></div>
        {showMediaPlan ? mode === "checkout" ? (
          <fieldset className="media-plan-picker">
            <legend><span>Choose your monthly media plan</span><small>All plans are billed month-to-month and may be canceled before the next renewal.</small></legend>
            <div className="media-plan-options">
              {mediaPlanKeys.map((optionKey) => {
                const option = MEDIA_PLANS[optionKey];
                const optionIncludesRadio = option.radioAcknowledgmentsPerMonth > 0;
                return (
                  <label className={`media-plan-option${planKey === optionKey ? " is-selected" : ""}${optionKey === "hear_see" ? " is-recommended" : ""}`} key={optionKey}>
                    <input
                      type="radio"
                      name="planKey"
                      value={optionKey}
                      checked={planKey === optionKey}
                      onChange={() => setPlanKey(optionKey)}
                    />
                    <span className="media-plan-option-copy">
                      <span className="media-plan-option-heading">
                        <span><strong>{option.name}</strong>{optionKey === "hear_see" ? <em>Recommended</em> : null}</span>
                        <span><strong>{monthlyPrice(option.amountCents)}</strong><small>/month</small></span>
                      </span>
                      <span className="media-plan-feature"><MonitorPlay size={15} aria-hidden="true" /> Every active NeuseCast screen</span>
                      <span className="media-plan-feature"><Radio size={15} aria-hidden="true" /> {optionIncludesRadio ? `${option.radioAcknowledgmentsPerMonth} Captain 97.1 sponsor acknowledgments/month` : "Screen advertising only"}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <div className="selected-media-plan">
            <span>{includesRadio ? <Radio size={17} aria-hidden="true" /> : <MonitorPlay size={17} aria-hidden="true" />}</span>
            <p><small>Your active plan</small><strong>{selectedPlan.name}</strong><span>{monthlyPrice(selectedPlan.amountCents)}/month{includesRadio ? ` · ${selectedPlan.radioAcknowledgmentsPerMonth} Captain 97.1 acknowledgments` : " · every active NeuseCast screen"}</span></p>
          </div>
        ) : null}
        {mode === "house" ? <>
          <label className="field"><span className="field-label">Advertiser or brand</span><input name="sponsor" required maxLength={200} placeholder="Captain 97.1, New Bern Websites, or client name" /></label>
          <label className="field"><span className="field-label">House ad purpose</span><select name="houseAdKind" defaultValue="direct_in_person"><option value="direct_in_person">Direct sale · in person</option><option value="direct_phone">Direct sale · phone order</option><option value="complimentary">Complimentary / freebie</option><option value="trial">Trial advertisement</option><option value="captain_97">Captain 97.1 promotion</option><option value="new_bern_websites">New Bern Websites promotion</option><option value="neusecast">NeuseCast promotion</option><option value="other">Other internal use</option></select></label>
        </> : null}
        <label className="field"><span className="field-label">Campaign name</span><input name="name" required maxLength={180} defaultValue={initial.name ?? ""} placeholder="Internal name for this campaign" /></label>
        <label className="field"><span className="field-label">Small heading</span><input name="eyebrow" required maxLength={50} value={eyebrow} placeholder="What kind of message is this?" onChange={(event) => setEyebrow(event.target.value)} /></label>
        <label className="field"><span className="field-label">Main headline</span><input name="headline" required maxLength={120} value={headline} placeholder="Your strongest message" onChange={(event) => setHeadline(event.target.value)} /></label>
        <label className="field"><span className="field-label">Supporting message</span><textarea name="body" required maxLength={500} value={body} placeholder="Add the useful details customers need" onChange={(event) => setBody(event.target.value)} /></label>
        <label className="field"><span className="field-label">Screen call to action</span><input name="callToAction" required maxLength={120} value={callToAction} placeholder="What should customers do next on the screen?" onChange={(event) => setCallToAction(event.target.value)} />{showMediaPlan ? <small className="field-help">This appears on your screen creative only. Radio acknowledgments do not use promotional calls to action.</small> : null}</label>
        <label className="field"><span className="field-label">Visual style</span><select name="theme" value={theme} onChange={(event) => setTheme(event.target.value)}>{themes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {mode === "checkout" && includesRadio ? (
          <fieldset className="radio-underwriting-brief">
            <legend><span><Radio size={16} aria-hidden="true" /> Captain 97.1 underwriting brief</span><small>Give our team the facts to shape into concise, compliant sponsor acknowledgments.</small></legend>
            <div className="radio-compliance-note"><BadgeCheck size={17} aria-hidden="true" /><p><strong>Keep this informational.</strong> Radio acknowledgments cannot include prices, discounts, urgency, comparative or superlative claims, or calls to action. Your separate screen creative can still use its call to action above.</p></div>
            <label className="field"><span className="field-label">Core business or message</span><textarea name="radioMessageFocus" required maxLength={700} defaultValue={initialRadioBrief.messageFocus ?? ""} placeholder="What the business is, what it provides, and the factual message listeners should know" /></label>
            <label className="field"><span className="field-label">Listener destination</span><input name="radioDestination" required maxLength={255} defaultValue={initialRadioBrief.destination ?? ""} placeholder="Phone number or website for sponsor identification" /><small className="field-help">We will identify the destination without turning it into a promotional command.</small></label>
            <label className="field"><span className="field-label">Pronunciation notes</span><textarea name="radioPronunciationNotes" maxLength={500} defaultValue={initialRadioBrief.pronunciationNotes ?? ""} placeholder="Names, places, abbreviations, or words our announcer should know" /></label>
            <label className="field"><span className="field-label">Preferred tone</span><select name="radioPreferredTone" required defaultValue={initialRadioBrief.preferredTone ?? "Warm and neighborly"}><option>Warm and neighborly</option><option>Polished and informative</option><option>Energetic but restrained</option><option>Direct and professional</option></select></label>
          </fieldset>
        ) : null}
        {mode === "house" ? <div className="house-ad-schedule-grid">
          <label className="field"><span className="field-label">Start time</span><input name="startsAt" type="datetime-local" /><small>Leave blank to begin immediately.</small></label>
          <label className="field"><span className="field-label">End time</span><input name="endsAt" type="datetime-local" /><small>Leave blank for no expiration.</small></label>
          <label className="field"><span className="field-label">Spot length</span><select name="durationSeconds" defaultValue="15"><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option></select></label>
          <label className="field"><span className="field-label">Target plays per screen/day</span><input name="playsPerDay" type="number" min="1" max="48" defaultValue="12" required /></label>
        </div> : null}
        <div className="creative-builder-assurance"><BadgeCheck size={18} aria-hidden="true" /><p>{mode === "house" ? <><strong>Checkout and billing are bypassed.</strong> Publishing makes this a normal scheduled advertisement with pacing and verified proof-of-play on every active screen.</> : includesRadio ? <><strong>Screen creative and radio production are included.</strong> We review your screen draft and turn the factual brief into sponsor-identification copy without price, promotional comparison, urgency, or call-to-action language.</> : <><strong>Creative help is included.</strong> Your draft enters review after checkout. We can polish it or contact you before it airs.</>}</p></div>
        {mode === "checkout" ? (
          <label className="checkout-consent">
            <input name="acceptTerms" type="checkbox" required />
            <span>I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and <Link href="/advertising-terms" target="_blank">Advertising Terms</Link>, acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>, and authorize {monthlyPrice(selectedPlan.amountCents)}/month for the {selectedPlan.name} plan until canceled.</span>
          </label>
        ) : null}
        <CampaignSubmitButton mode={mode} planKey={planKey} />
        {mode === "checkout" ? <p className="creative-billing-note">{selectedPlan.name} is {monthlyPrice(selectedPlan.amountCents)}/month until canceled. Approved screen creative is paced for 12 verified plays per active screen each broadcast day.{includesRadio ? ` Includes ${selectedPlan.radioAcknowledgmentsPerMonth} Captain 97.1 sponsor acknowledgments per month.` : ""}</p> : mode === "included" ? <p className="creative-billing-note">Included with your active {selectedPlan.name} plan. No additional charge.{includesRadio ? ` Your plan includes ${selectedPlan.radioAcknowledgmentsPerMonth} Captain 97.1 sponsor acknowledgments each month.` : ""}</p> : mode === "house" ? <p className="creative-billing-note">Control-room entry · no advertiser account, checkout, invoice, or subscription required.</p> : null}
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
