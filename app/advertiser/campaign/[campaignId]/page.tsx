import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { CampaignBuilder } from "@/components/campaign-builder";
import { getDatabase } from "@/lib/db";
import { advertiserAccounts, campaigns, creatives } from "@/lib/db/schema";
import { submitCampaignRevision } from "../../actions";

export const metadata: Metadata = { title: "Edit campaign" };

type CampaignPageProps = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ updated?: string; error?: string }>;
};

function metadataText(metadata: Record<string, unknown> | null, key: string) {
  return typeof metadata?.[key] === "string" ? String(metadata[key]) : undefined;
}

export default async function CampaignPage({ params, searchParams }: CampaignPageProps) {
  const user = await currentUser();
  if (!user) notFound();
  const { campaignId } = await params;
  const query = await searchParams;
  const database = getDatabase();
  const [campaign] = await database
    .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
    .from(campaigns)
    .innerJoin(advertiserAccounts, eq(campaigns.advertiserAccountId, advertiserAccounts.id))
    .where(and(eq(campaigns.id, campaignId), eq(advertiserAccounts.ownerClerkUserId, user.id)))
    .limit(1);
  if (!campaign) notFound();

  const [creative] = await database.select().from(creatives).where(eq(creatives.campaignId, campaign.id)).orderBy(desc(creatives.createdAt)).limit(1);
  if (!creative) notFound();

  return (
    <main className="campaign-studio-page">
      <Link className="back-link" href="/advertiser"><ArrowLeft size={16} aria-hidden="true" /> Advertiser dashboard</Link>
      <header className="campaign-studio-header campaign-edit-header"><div><div className="eyebrow">Campaign editor · {campaign.status}</div><h1>Refresh your message.</h1><p>Submit a new creative revision without starting over. Changes enter review before replacing anything on screen.</p></div></header>
      {query.updated ? <div className="portal-notice"><BadgeCheck size={18} aria-hidden="true" /><span><strong>Your revision is in review.</strong> We’ll approve it before it replaces the current creative.</span></div> : null}
      {query.error ? <p className="form-error campaign-studio-error">Please complete every creative field.</p> : null}
      <CampaignBuilder
        action={submitCampaignRevision}
        campaignId={campaign.id}
        mode="revision"
        initial={{
          name: campaign.name,
          eyebrow: metadataText(creative.metadata, "eyebrow"),
          headline: creative.headline ?? undefined,
          body: creative.body ?? undefined,
          callToAction: creative.callToAction ?? undefined,
          theme: metadataText(creative.metadata, "theme"),
        }}
      />
    </main>
  );
}
