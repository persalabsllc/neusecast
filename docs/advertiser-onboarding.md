# Advertiser self-service onboarding

NeuseCast will provide a public, mobile-first advertiser portal that supports the full customer lifecycle without requiring manual setup by the control-room team.

## Required customer journey

1. An advertiser creates a Clerk account or signs into an existing account.
2. The advertiser creates their business profile and billing identity.
3. They create a campaign, enter its objective, dates, offer, and creative requirements.
4. They browse eligible screen locations by market, venue type, estimated audience, availability, and price.
5. They select individual screens or a recommended market package.
6. NeuseCast calculates the campaign price and presents an order summary.
7. The advertiser checks out through Stripe.
8. Successful payment submits the campaign and creative for review and scheduling.
9. The advertiser can return to `/advertiser` to monitor status, placements, scheduled dates, proof-of-play reporting, invoices, and creative approvals.
10. The advertiser can request changes, upload replacement creative, pause eligible campaigns, renew completed campaigns, or duplicate a prior campaign.

## Portal boundaries

- `/` remains the public advertiser-first sales site.
- `/advertiser` is the self-service advertiser portal.
- `/host` is restricted to approved host-location users.
- `/control` is restricted to Persa Labs administrators.
- Clerk owns authentication and sessions; Neon stores business roles, ownership, campaigns, selected screens, orders, and reporting data.

## MVP screens

- Advertiser onboarding
- Business profile
- Campaign builder
- Screen-location marketplace
- Creative upload or guided creative request
- Order review and Stripe checkout
- Campaign dashboard
- Campaign detail and proof of play
- Billing history and receipts
- Profile and team access

## Non-negotiable rules

- Every advertiser query must be scoped to the authenticated advertiser account.
- Advertisers cannot publish directly to screens; campaigns and creative require approval.
- Screen pricing and availability come from the control-room data, not client-submitted values.
- Payment confirmation comes from a verified Stripe webhook, never a browser redirect alone.
- Campaign changes retain an audit trail.
- Host users can access only their assigned venues.
- Administrative access is enforced on the server, not only hidden in the interface.
