# Static Open Graph Images

## Status: Legacy

These static OG images are maintained for specific use cases but are **no longer used for general social media previews**.

## Files

- `base.png` - Static conference logo image
- `base.svg` - SVG version of static conference logo

## Current Usage

These files are currently referenced in:

- **OpenBadges Issuer Profile** ([/src/lib/badge/config.ts](../../src/lib/badge/config.ts) and [/src/app/api/badge/issuer/route.ts](../../src/app/api/badge/issuer/route.ts))
  - Used as the issuer organization image in OpenBadges 3.0 metadata
  - Appropriate for this use case as it represents the issuing organization (Cloud Native Days Norway)

## Dynamic OG Images

All pages now use **dynamic Open Graph images** generated at build/request time:

- **Homepage** (`/opengraph-image`) - Conference-specific with title, tagline, dates, location, logo
- **Program** (`/program/opengraph-image`) - Program page with conference context
- **CFP** (`/cfp/opengraph-image`) - Call for Papers with CFP deadline
- **Sponsor** (`/sponsor/opengraph-image`) - Sponsorship information
- **Tickets** (`/tickets/opengraph-image`) - Ticket information
- **Speaker Profiles** (`/speaker/[slug]/opengraph-image`) - Individual speaker cards with talk details
- **Badges** (`/badge/[badgeId]/opengraph-image`) - OpenBadges verification previews

These dynamic images:

- Automatically update when conference data changes in Sanity CMS
- Support multi-tenant architecture (different images per domain/conference)
- Use consistent branding from Storybook design system (`pnpm storybook` → Design System/Brand/)
- Include conference-specific logos, dates, locations, and content

## Implementation

Dynamic OG images use:

- `@vercel/og` with Edge Runtime
- Shared utilities in [/src/lib/og/](../../src/lib/og/)
- Conference data from Sanity CMS via `getConferenceForDomain()`
- Cache strategy: `cacheLife('hours')` with page-specific cache tags

## Migration Notes

If you need to update the static badge issuer image:

1. Replace `base.png` and `base.svg` in this directory
2. No code changes required (references are stable)
3. Consider whether a dynamic solution would be more appropriate

For all other social preview use cases, use the dynamic OG image system.
