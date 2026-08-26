# NeuseCast

NeuseCast is Persa Labs' end-to-end operating platform for an Eastern North Carolina digital screen network.

## Launch workflow

- Advertisers create an account, enter business details, design and preview a campaign, choose a monthly reach package, and subscribe through Stripe.
- Every package includes all active NeuseCast screens. The two radio-and-screen packages also create a Captain 97.1 underwriting-production brief for the Control Room. Additional screen campaigns are included while the advertiser's plan remains active.
- Paid creative enters the Control Room review queue and is scheduled for the following broadcast day. It cannot air until a NeuseCast administrator approves it.
- Hosts publish venue-only specials, menus, events, and announcements directly to their own assigned screens.
- Control Room administrators create venues and permanent player URLs, issue one-time device pairing links, assign host accounts, block venue conflicts, and monitor heartbeats, playlist delivery, device details, and proof-of-play.
- The Content workspace manages manual and source-backed automatic filler, including local history, weather, news, events, facts, and on-this-day cards. A protected NeuseCast house promotion is always included in active screen rotations.
- The Newsroom workspace produces 3–5 minute hyperlocal broadcast editions twice daily. Routine verified stories can auto-publish; arrests, allegations, elections, deaths, serious incidents, and other sensitive coverage remain off-air until an administrator reviews them.
- Screen players use NeuseCast's first-party web runtime with offline caching, server-synchronized local time, secure device credentials, playlist refreshes, and playback telemetry.

There is no seeded or synthetic launch data. New accounts, venues, screens, campaigns, content, and delivery results come from real user activity.

## Stack

| Capability | Service |
| --- | --- |
| Web application and APIs | Next.js on Vercel |
| Authentication | Clerk |
| Relational data | Neon Postgres with Drizzle ORM |
| Advertiser subscriptions | Stripe Checkout and signed webhooks |
| Creative media | Vercel Blob |
| Screen playback | Proprietary NeuseCast web player |
| Broadcast automation | CasparCG 2.5 + NeuseCast playout agent |
| Live channel delivery | Cloudflare Stream HLS (virtual channel fallback until connected) |
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
npm run test:broadcast
npm run build
```

## Broadcast Studio

`/studio` is a separate, administrator-only automation console for the NeuseCast video channel. It includes the media library, deterministic daily logs, program and preview monitors, permanent logo/time/weather/ticker graphics, live-source registration, agent health, manual take controls, and Cloudflare delivery readiness. The existing `/control` workspace and venue-screen rotation remain independent.

Large files upload directly from the browser to Vercel Blob. Video, audio, and still-image files remain in `processing` until the persistent playout agent downloads the exact version, validates it with `ffprobe`, caches it beside CasparCG, and reports it air-ready. Published logs pin a media version so replacing a library file cannot silently change an approved broadcast day.

The web app is the control plane; it does not attempt to run a 24/7 encoder inside Vercel. The persistent playout stack lives in [`broadcast-agent/`](broadcast-agent/) and includes its own Docker Compose file, CasparCG configuration, local health checks, media cache, graphics template, event queue, and deployment guide.

Follow the one-time [Broadcast Studio launch runbook](docs/broadcast-studio-launch.md) for the playout host, Cloudflare Live Input, and acceptance test.

Web/Vercel configuration:

```dotenv
BLOB_READ_WRITE_TOKEN=...
BROADCAST_AGENT_SECRET=<same-long-random-secret-as-the-playout-host>
BROADCAST_CLOUDFLARE_CONFIGURED=false
NEXT_PUBLIC_BROADCAST_HLS_URL=
```

One-time playout-host setup:

```bash
cd broadcast-agent
cp .env.example .env
# Set NEUSECAST_BASE_URL and BROADCAST_AGENT_SECRET.
docker compose up -d --build
curl --fail http://127.0.0.1:8787/readyz
```

Create a Cloudflare Stream Live Input when ready. Put its secret RTMPS or SRT ingest URL only in `broadcast-agent/.env` as `STREAM_OUTPUT_URL`; put the public Live Input HLS manifest in Vercel as `NEXT_PUBLIC_BROADCAST_HLS_URL`. The `/watch` page switches to that adaptive HLS feed automatically and otherwise keeps using the existing virtual-linear player. After confirming ingest and playback, set `BROADCAST_CLOUDFLARE_CONFIGURED=true` and enable the main output in Studio → Settings.

Live cameras are registered in Studio → Live. Public or private-network SRT/RTMP/RTSP sources can use an endpoint URL; credentialed sources should use an agent-side reference such as `env:STUDIO_CAMERA_1_URL`, with the complete secret URL defined only in `broadcast-agent/.env`. OBS can provide the switched studio feed, while a local gateway such as MediaMTX can convert on-premises RTSP cameras to a resilient SRT contribution feed. AMCP remains bound to localhost and must never be exposed publicly.

## Production configuration

Vercel must provide the Clerk, Neon, Stripe, and application URL environment variables listed in `.env.example`. Stripe sends subscription and Checkout events to `/api/stripe/webhook`. After the custom domain is connected, update `NEXT_PUBLIC_APP_URL`, configure the production domain in Clerk, and issue fresh player pairing links for devices moving from the Vercel domain.

Keep Clerk's email verification requirement enabled. NeuseCast independently requires a verified primary Clerk email before an advertiser can create an account, a host can claim an invitation, or an administrator can enter the Control Room.

Automatic filler and Newsroom editions use the OpenAI Responses API with live web search and structured output. Set `OPENAI_API_KEY`, optionally override `OPENAI_FILLER_MODEL` or `OPENAI_NEWSROOM_MODEL`, and keep `CRON_SECRET` configured so Vercel can authenticate filler, weather, newsroom, and 15-minute broadcast ticker/overlay refresh jobs. Administrators can run the same generators on demand from Control Room → Content or Control Room → Newsroom.

The hourly Newsroom and 15-minute broadcast automation schedules require Vercel Pro or Enterprise; Vercel Hobby accepts only daily cron schedules.

Newsroom editions use approved official and local-publisher domains, retain direct source links, rewrite facts in NeuseCast language, and use only reusable editorial imagery discovered through the existing Wikimedia workflow. The player schedules the latest published edition with a default 55-minute minimum gap. The native HTML broadcast package works immediately on every NeuseCast player; an edition-level `videoUrl` can replace it with a rendered MP4 later without changing scheduling or proof-of-play.

Before taking the first live advertiser payment:

1. In Stripe's live Customer Portal configuration, allow customers to update payment methods and cancel subscriptions. Prefer cancellation at the end of the paid billing period. Keep plan and quantity changes disabled until the application implements `customer.subscription.updated` handling and explicit upgrade/downgrade rules.
2. Confirm the production webhook destination includes `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.deleted`, `invoice.payment_failed`, and `invoice.paid`.
3. Confirm `STRIPE_WEBHOOK_SECRET` is the signing secret for that exact live webhook destination and redeploy production after changing it.

Package prices and entitlements live in `lib/pricing.ts`; never accept an amount supplied by the browser. Stripe Checkout is created from the server-authoritative package attached to the pending order, and only the signed webhook grants screen or radio entitlement.

Database migrations run automatically before each Vercel build. Application requests never create, alter, seed, or delete database schema/data.

Never commit live credentials or player pairing links.
