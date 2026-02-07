# Ticket System Architecture

## Overview

The ticket system integrates with [Checkin.no](https://checkin.no) as the external ticketing provider and presents dynamic, real-time pricing on the public `/tickets` page. The system consists of three layers:

1. **Public page** — Server-rendered pricing grid with cached Checkin.no data
2. **Admin pages** — Organizer dashboard for ticket sales, orders, discounts, and company tracking
3. **Sanity CMS** — Conference-level configuration for Checkin.no credentials, registration settings, and page content

---

## Current Implementation

### Data Flow

```
Checkin.no GraphQL API
        │
        ▼
src/lib/tickets/public.ts    ← cached fetch (cacheLife: hours)
        │
        ▼
src/components/TicketPricingGrid.tsx
        │
        ▼
src/app/(main)/tickets/page.tsx   ← public page with 'use cache'
```

### What the Public Page Shows Today

| Section            | Source                                                                  | Description                                                                    |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Header             | Sanity (`conference.title`, `start_date`, `end_date`)                   | Conference name + date range                                                   |
| Pricing grid       | Checkin.no API (`EventTicket.price`, `visibleStartsAt`/`visibleEndsAt`) | Tiered table: Early Bird / Standard / Late Bird × ticket categories            |
| Standalone tickets | Checkin.no API                                                          | Cards for non-tiered tickets (e.g., Student) with description and availability |
| VAT note           | Checkin.no API (`Price.vat`)                                            | "All prices in NOK excl. 25% VAT"                                              |
| Register Now CTA   | Sanity (`conference.registration_link`)                                 | Deep-link to Checkin.no registration                                           |
| Contact footer     | Sanity (`conference.contact_email`)                                     | "Need help? Contact us"                                                        |

### Ticket Name Convention

Tickets in Checkin.no **must** follow a specific naming pattern for the pricing grid to render correctly. The `buildPricingMatrix()` function in `src/lib/tickets/public.ts` parses ticket names to construct a categories × tiers grid.

#### Naming Pattern: `"Tier: Category (details)"`

The parser splits on the **first colon** (`:`) in the ticket name:

- Everything before the colon = **Tier** (pricing period column header)
- Everything after the colon = **Category** (row label)

#### Tiered Tickets (Grid Rows)

A tier is only recognized as valid if its categories overlap with at least one other tier. This means a minimum of **two tiers sharing the same category names** is required to produce a grid.

**Example — 3 tiers × 2 categories = 6 tickets in Checkin.no:**

| Checkin.no Ticket Name                       | Parsed Tier | Parsed Category                |
| -------------------------------------------- | ----------- | ------------------------------ |
| `Early Bird: Conference Only (1 day)`        | Early Bird  | Conference Only (1 day)        |
| `Early Bird: Workshop + Conference (2 days)` | Early Bird  | Workshop + Conference (2 days) |
| `Standard: Conference Only (1 day)`          | Standard    | Conference Only (1 day)        |
| `Standard: Workshop + Conference (2 days)`   | Standard    | Workshop + Conference (2 days) |
| `Late Bird: Conference Only (1 day)`         | Late Bird   | Conference Only (1 day)        |
| `Late Bird: Workshop + Conference (2 days)`  | Late Bird   | Workshop + Conference (2 days) |

This renders as:

```
                    | Early Bird      | Standard  | Late Bird |
                    | --------------- | --------- | --------- | --------- |
                    | Conference Only | NOK 2,000 | NOK 2,500 | NOK 3,000 |
                    | Workshop + Conf | NOK 4,500 | NOK 4,500 | NOK 5,500 |
```

#### Standalone Tickets (Cards)

Tickets that **don't share categories** with other tiers are rendered as individual cards below the grid. This happens in two cases:

1. **No colon in the name** — treated as a standalone category (e.g., `Student: The 1337 Ticket` where "The 1337 Ticket" doesn't appear in any other tier)
2. **Colon present but unique category** — if the category part only appears under one tier, the ticket falls through to standalone rendering

**Example:** `Student: The 1337 Ticket` → The category "The 1337 Ticket" only exists under "Student", so it becomes a standalone card.

#### Complimentary Tickets (Static Cards)

Speaker and Volunteer tickets are shown as static "Free" cards alongside standalone tickets. These are **not fetched from Checkin.no** — they're hardcoded in the page component since the API filters out invite-only and zero-price tickets.

#### Rules Summary

| Rule                    | Requirement                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- |
| Tier/Category separator | First `:` (colon) in the name                                                   |
| Grid row qualification  | Category string must appear in **2+ different tiers**                           |
| Tier column ordering    | Follows the `position` field set in Checkin.no                                  |
| Category row ordering   | Follows the `position` of the first ticket in that category                     |
| Standalone fallback     | Any ticket whose category is unique to one tier                                 |
| Excluded from display   | `requiresInvitation: true` or `price == 0`                                      |
| Sale window columns     | `visibleStartsAt`/`visibleEndsAt` control tier status (expired/active/upcoming) |

#### Checklist for Setting Up a New Conference

1. **Name tiered tickets consistently** — use the exact same category string across all tiers (case-sensitive, including parenthetical details)
2. **Set `position` values** — controls display order for both columns and rows
3. **Set visibility windows** — `visibleStartsAt`/`visibleEndsAt` determine which tier shows as "active" vs "coming soon" vs "expired"
4. **Use `requiresInvitation: true`** for speaker/sponsor/volunteer comps — these are automatically filtered out
5. **Add descriptions** — only shown on standalone ticket cards, not in the tiered grid
6. **Verify the grid** — after creating tickets, check `/tickets` to confirm the matrix renders as expected

#### Common Mistakes

| Mistake                                                                      | Result                                |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| Typo in category across tiers (e.g., "Conference only" vs "Conference Only") | Two separate rows instead of one      |
| Only one tier has a colon in names                                           | All tickets become standalone cards   |
| Missing colon separator                                                      | Ticket treated as standalone          |
| Forgetting to set `position`                                                 | Unpredictable row/column ordering     |
| Price set to 0 for a public ticket                                           | Ticket filtered out and not displayed |

### Caching Strategy

- `getPublicTicketTypes()` uses `'use cache'` + `cacheLife('hours')` + `cacheTag('content:tickets')`
- The page component `CachedTicketsContent` has its own `'use cache'` layer
- Cache can be invalidated via `revalidateTag('content:tickets')`

---

## Comparison: Sponsor Page vs Tickets Page

The sponsor page is the most mature public-facing page and serves as the template for how the tickets page should evolve.

### Sponsor Page Sections

| Section                       | Config Source                                            | Tickets Page Equivalent                                       |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Hero (headline + subheadline) | `sponsorship_customization.hero_headline/subheadline`    | **Missing** — should add customizable headline                |
| Vanity metrics (stats bar)    | `conference.vanity_metrics[]`                            | **Missing** — could reuse (attendees, speakers, tracks, etc.) |
| Why Sponsor (benefit cards)   | `conference.sponsor_benefits[]` (icon + title + desc)    | **Missing** — should add "What's Included" cards              |
| Tier pricing cards            | `sponsorTier` Sanity documents                           | ✅ Exists — pricing grid from Checkin.no                       |
| Philosophy section            | `sponsorship_customization.philosophy_title/description` | **Missing** — could add registration type explanations        |
| Closing CTA                   | `sponsorship_customization.closing_quote/cta_text`       | ✅ Partial — has "Register Now" button                         |
| Contact footer                | `conference.sponsor_email`                               | ✅ Exists — uses `contact_email`                               |
| Past sponsors grid            | `sponsorForConference` documents                         | N/A                                                           |

### KubeCon Registration Page Sections

| Section                                                                   | Our Equivalent                     | Priority |
| ------------------------------------------------------------------------- | ---------------------------------- | -------- |
| Pricing grid (pass types × tiers × registration types)                    | ✅ Exists                           | —        |
| Pass types explanation ("What can I expect?")                             | **Missing**                        | High     |
| Registration types explanation (Corporate, Individual, Academic, Speaker) | **Missing**                        | High     |
| What's Included (bullet list of benefits)                                 | **Missing**                        | High     |
| Group discounts info                                                      | **Missing**                        | Medium   |
| Scholarship / travel funding link                                         | **Missing**                        | Medium   |
| Refund / cancellation policy                                              | **Missing**                        | Low      |
| Invoices & certificates info                                              | **Missing**                        | Low      |
| Sponsors footer                                                           | Could reuse `<Sponsors>` component | Low      |

---

## Proposed Enhancements

### New Sections for the Tickets Page

Based on the sponsor page pattern and KubeCon's registration page, these sections should be added:

#### 1. Hero with Customizable Copy (High Priority)

Like the sponsor page's `sponsorship_customization`, allow organizers to set a headline and subheadline for the tickets page.

**Config:** Sanity `ticket_customization.hero_headline` / `hero_subheadline`

#### 2. What's Included (High Priority)

A bullet list or card grid showing what attendees get with their ticket. KubeCon lists: keynotes, breakouts, social events, solutions showcase, lunches/coffee, conference t-shirt, on-demand recordings, etc.

**Config:** Sanity `ticket_inclusions[]` — array of `{icon: HeroIcon, title: string, description?: text}`, same pattern as `sponsor_benefits[]`.

#### 3. Ticket Type Explanations (High Priority)

Each ticket category needs a short description explaining what it includes and who it's for. Similar to KubeCon's "Pass Types" and "Registration Types" sections.

**Config:** This data already exists in Checkin.no's `EventTicket.description` field — it's rendered on standalone cards but not on tiered rows. Could also add a Sanity `ticket_type_descriptions[]` override.

#### 4. Group Discounts & Special Offers (Medium Priority)

Information about available discounts — group pricing, community partner codes, etc.

**Config:** Sanity `ticket_customization.group_discount_info` (text) or reference the existing discount system (`src/lib/discounts/`).

#### 5. FAQ / Additional Information (Medium Priority)

Collapsible FAQ section covering: registration deadlines, cancellation policy, invoice info, accessibility, etc.

**Config:** Sanity `ticket_faqs[]` — array of `{question: string, answer: text}`.

#### 6. Vanity Metrics Bar (Optional)

Reuse the existing `conference.vanity_metrics[]` (attendees, speakers, tracks) to build excitement. The sponsor page already renders this data.

**Config:** Already exists in Sanity — just render it on the tickets page too.

---

## Configuration Approach

### Sanity Schema Additions

Follow the `sponsorship_customization` pattern — a collapsible object on the conference document:

```
conference.ticket_customization (object, collapsible)
  ├── hero_headline: string          (default: "Secure Your Spot")
  ├── hero_subheadline: text         (default: auto-generated from conference name + dates)
  ├── show_vanity_metrics: boolean   (default: true — reuse existing vanity_metrics array)
  ├── group_discount_info: text      (optional — freeform markdown/text about group discounts)
  └── closing_cta_text: string       (optional — override "Register Now" button text)

conference.ticket_inclusions[] (array of objects)
  ├── icon: string (HeroIcon name — same predefined list as sponsor_benefits)
  ├── title: string
  └── description: text (optional)

conference.ticket_faqs[] (array of objects)
  ├── question: string
  └── answer: text
```

### What Stays in Checkin.no (Not Configurable in Sanity)

| Data                                  | Reason                                            |
| ------------------------------------- | ------------------------------------------------- |
| Ticket names, prices, VAT             | Source of truth is the ticketing provider         |
| Sale windows (visibleStartsAt/EndsAt) | Managed in Checkin.no                             |
| Availability count                    | Real-time from API                                |
| Ticket descriptions                   | Already in Checkin.no — used for standalone cards |

### What Stays Hardcoded

| Data                                    | Reason                                             |
| --------------------------------------- | -------------------------------------------------- |
| Grid layout logic                       | Structural — derives from ticket naming convention |
| Currency formatting (NOK, nb-NO locale) | Consistent with Checkin.no event config            |
| Brand colors, typography                | Governed by branding guidelines                    |
| Cache durations                         | Infrastructure concern                             |

---

## File Map

| File                                               | Purpose                                                    |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `src/app/(main)/tickets/page.tsx`                  | Public tickets page (Server Component with cache)          |
| `src/components/TicketPricingGrid.tsx`             | Pricing grid table + standalone ticket cards               |
| `src/lib/tickets/public.ts`                        | Public data layer: fetch, parse, format ticket data        |
| `src/lib/tickets/types.ts`                         | Shared ticket types (admin + public)                       |
| `src/lib/tickets/api.ts`                           | Admin ticket data fetching                                 |
| `src/lib/tickets/graphql-client.ts`                | Singleton Checkin.no GraphQL client                        |
| `src/lib/discounts/api.ts`                         | Discount code management (admin)                           |
| `src/lib/discounts/types.ts`                       | Discount types                                             |
| `src/server/routers/tickets.ts`                    | tRPC admin procedures for ticket management                |
| `sanity/schemaTypes/conference.ts`                 | Conference document: Checkin.no IDs, registration settings |
| `src/app/(admin)/admin/tickets/page.tsx`           | Admin ticket overview dashboard                            |
| `src/app/(admin)/admin/tickets/orders/page.tsx`    | Admin order management                                     |
| `src/app/(admin)/admin/tickets/discount/page.tsx`  | Admin discount code management                             |
| `src/app/(admin)/admin/tickets/companies/page.tsx` | Admin company ticket tracking                              |

---

## Checkin.no API Reference

### Authentication

- Basic auth: `CHECKIN_API_KEY` : `CHECKIN_API_SECRET` (base64 encoded)
- Endpoint: `https://api.checkin.no/graphql`

### Key Types

```graphql
type EventTicket {
  id: Int!
  name: String!
  type: String!
  description: String
  price: [Price!]!
  available: Int
  requiresInvitation: Boolean!
  visibleStartsAt: DateTime
  visibleEndsAt: DateTime
  position: Int!
  fee: Amount
  # ... 15 more fields
}

type Price {
  price: Amount! # excl. VAT
  vat: Amount! # VAT percentage (e.g., "25")
  description: String
  key: String
}

scalar Amount # String-encoded decimal
```

### Public Query

```graphql
query FindEvent($id: Int!) {
  findEventById(id: $id) {
    id
    name
    registrationOpensAt
    registrationClosesAt
    currencies
    tickets {
      id
      name
      type
      description
      price {
        price
        vat
        description
        key
      }
      available
      requiresInvitation
      visibleStartsAt
      visibleEndsAt
      position
    }
  }
}
```

### Filtering Rules

- Exclude `requiresInvitation: true` (speaker/sponsor comps)
- Exclude tickets with `price[0].price == 0` (free/internal)
- Sort by `position` (organizer-defined order)

---

## Admin Pages

| Route                      | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `/admin/tickets`           | Overview dashboard with ticket type stats, capacity tracking, sales progress |
| `/admin/tickets/orders`    | Order list with search, filtering, and order details                         |
| `/admin/tickets/discount`  | Create and manage discount/promo codes                                       |
| `/admin/tickets/companies` | Company-level ticket purchase tracking                                       |

Admin pages use tRPC procedures from `src/server/routers/tickets.ts` which call `src/lib/tickets/api.ts` for data.
