# NeuseCast

NeuseCast is the operating platform for an Eastern North Carolina digital screen network: useful local content for host businesses, targeted campaigns for advertisers, and one control room for Persa Labs.

> Local businesses. Local stories. On screen.

## Current milestone

This repository now contains the first production-shaped application foundation:

- a network Control Room dashboard
- screen-fleet monitoring
- content review and approval views
- campaign and playlist management views
- a local-host portal with graphical content previews
- Clerk sign-in and protected host/control routes
- a database-driven rotating player at `/player/demo-new-bern`
- a Neon/Drizzle schema for accounts, venues, screens, content, campaigns, playlists, billing references, and proof-of-play
- realistic demo content so the complete on-screen experience can be evaluated before live feeds are connected

The live player now reads its assigned rotation from Neon, refreshes its manifest automatically, sends a heartbeat, and records proof-of-play events. The control dashboards still use representative demo metrics while their forms are connected to the same data model. Stripe checkout and automated feeds remain the next integration layer.

## Planned architecture

| Capability | Planned service |
| --- | --- |
| Web app and API | Next.js on Vercel |
| Accounts and organizations | Clerk |
| Relational data | Neon Postgres |
| Images and creative files | Vercel Blob |
| Screen playback | NeuseCast web player, with optional Yodeck device management |
| Scheduled feed refreshes | Vercel Cron |
| AI-assisted card generation | Structured model output with reviewed templates |
| Source and deployment | GitHub → Vercel |

## Roles

- **Network admin:** manages the full screen fleet, campaigns, content, schedules, and approvals.
- **Host business:** submits and schedules venue-specific specials, menus, events, and announcements.
- **Advertiser:** will review campaign status and proof-of-play reporting in a later milestone.
- **Screen player:** receives an assigned playlist and reports playback/health telemetry.

## Run locally

Requirements: Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

Production validation:

```bash
npm run lint
npm run build
```

Open [http://localhost:3000/player/demo-new-bern](http://localhost:3000/player/demo-new-bern) to run the seeded TV player after connecting the database.

## Environment setup

Copy `.env.example` to `.env.local` once the integrations are provisioned. Never commit live credentials.

After the Vercel Marketplace Neon integration supplies `DATABASE_URL`, initialize the database with:

```bash
npm run db:migrate
```

## Delivery sequence

1. Interface foundation and workflow prototype — complete
2. Clerk authentication and protected portal access — complete
3. Full-screen web player and reusable content templates — complete foundation
4. Neon core persistence and live player telemetry — complete foundation
5. Stripe checkout and advertiser billing status
6. Player assignments, offline caching, and screen heartbeat monitoring
7. Weather, tides, community-event, and local-news feeds
8. Content automation with approval rules and advertiser reporting

## Brand

- **Name:** NeuseCast
- **Descriptor:** Eastern Carolina's Local Screen Network
- **Tagline:** Local businesses. Local stories. On screen.
