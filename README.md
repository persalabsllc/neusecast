# NeuseCast

NeuseCast is the operating platform for an Eastern North Carolina digital screen network: useful local content for host businesses, targeted campaigns for advertisers, and one control room for Persa Labs.

> Local businesses. Local stories. On screen.

## Current milestone

This repository contains the first production-shaped interface foundation:

- a network Control Room dashboard
- screen-fleet monitoring
- content review and approval views
- campaign and playlist management views
- a local-host portal with graphical content previews
- realistic demo data so the workflow can be evaluated before external services are connected

The current milestone intentionally uses in-app demo data. Authentication, persistence, screen distribution, billing, and automated feeds are the next integration layer.

## Planned architecture

| Capability | Planned service |
| --- | --- |
| Web app and API | Next.js on Vercel |
| Accounts and organizations | Clerk |
| Relational data | Neon Postgres |
| Images and creative files | Vercel Blob |
| Screen playback | Yodeck API initially |
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

## Environment setup

Copy `.env.example` to `.env.local` once the integrations are provisioned. Never commit live credentials.

## Delivery sequence

1. Interface foundation and workflow prototype
2. Clerk organizations and role-based access
3. Neon data model, media uploads, and audit history
4. Yodeck playlist publishing and screen heartbeat monitoring
5. Weather, tides, community-event, and local-news feeds
6. Content automation with approval rules and advertiser reporting

## Brand

- **Name:** NeuseCast
- **Descriptor:** Eastern Carolina's Local Screen Network
- **Tagline:** Local businesses. Local stories. On screen.

