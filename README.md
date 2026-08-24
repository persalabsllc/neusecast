# NeuseCast

NeuseCast is Persa Labs' end-to-end operating platform for an Eastern North Carolina digital screen network.

## Launch workflow

- Advertisers create an account, enter business details, design and preview a campaign, and subscribe through Stripe for **$75/month**.
- The plan includes every active NeuseCast screen. Additional campaigns are included while the advertiser's plan remains active.
- Paid creative enters the Control Room review queue and is scheduled for the following broadcast day. It cannot air until a NeuseCast administrator approves it.
- Hosts publish venue-only specials, menus, events, and announcements directly to their own assigned screens.
- Control Room administrators create venues and permanent player URLs, issue one-time device pairing links, assign host accounts, block venue conflicts, and monitor heartbeats, playlist delivery, device details, and proof-of-play.
- The Content workspace manages manual and source-backed automatic filler, including local history, weather, news, events, facts, and on-this-day cards. A protected NeuseCast house promotion is always included in active screen rotations.
- Screen players use NeuseCast's first-party web runtime with offline caching, server-synchronized local time, secure device credentials, playlist refreshes, and playback telemetry.

There is no seeded or synthetic launch data. New accounts, venues, screens, campaigns, content, and delivery results come from real user activity.

## Stack

| Capability | Service |
| --- | --- |
| Web application and APIs | Next.js on Vercel |
| Authentication | Clerk |
| Relational data | Neon Postgres with Drizzle ORM |
| Advertiser subscriptions | Stripe Checkout and webhooks |
| Creative media | Vercel Blob |
| Screen playback | Proprietary NeuseCast web player |
| Source and deployments | GitHub to Vercel |

## Access roles

- **Admin:** full Control Room access, screen activation, network rules, campaign moderation, and delivery reporting.
- **Host:** direct publishing and advertiser exclusions only for screens assigned to that host.
- **Advertiser:** business onboarding, campaign creation and revision, billing, status, and verified delivery results.
- **Player:** device-bound access to one screen's manifest, heartbeat endpoint, and proof-of-play endpoint.

## Local development

Node.js 20.9 or newer is required.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local`, provide development integration credentials, and initialize a new database with:

```bash
npm run db:migrate
```

Validation commands:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Production configuration

Vercel must provide the Clerk, Neon, Stripe, and application URL environment variables listed in `.env.example`. Stripe sends subscription and Checkout events to `/api/stripe/webhook`. After the custom domain is connected, update `NEXT_PUBLIC_APP_URL`, configure the production domain in Clerk, and issue fresh player pairing links for devices moving from the Vercel domain.

Automatic filler uses the OpenAI Responses API with live web search and structured output. Set `OPENAI_API_KEY`, optionally override `OPENAI_FILLER_MODEL`, and keep `CRON_SECRET` configured so Vercel can authenticate the daily `/api/cron/filler` refresh and three-hour `/api/cron/filler/weather` refresh. Administrators can also run the same generator on demand from Control Room → Content.

Before taking the first live advertiser payment:

1. In Stripe's live Customer Portal configuration, allow customers to update payment methods and cancel subscriptions. Prefer cancellation at the end of the paid billing period.
2. Confirm the production webhook destination includes `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.deleted`, `invoice.payment_failed`, and `invoice.paid`.
3. Confirm `STRIPE_WEBHOOK_SECRET` is the signing secret for that exact live webhook destination and redeploy production after changing it.

Database migrations run automatically before each Vercel build. Application requests never create, alter, seed, or delete database schema/data.

Never commit live credentials or player pairing links.
