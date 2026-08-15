# Migration 050: Add ticketEntitlement to Sponsor Tiers

> **⏳ NOT RUNNABLE AS COMMITTED.** The allocation table in `index.ts` ships
> with every number blank, and the migration throws rather than write blanks.
> The conference owner has to fill it in first — see
> [Owner action required](#owner-action-required).

## Overview

This migration backfills the optional `ticketEntitlement` field on `sponsorTier`
documents — the number of complimentary conference tickets included for each
sponsor in that tier. Values come from a lookup table of tier **title** → number
declared at the top of `index.ts`.

## Why this exists

The allocation used to be a hardcoded map in the ticketing code
(`src/lib/tickets/processor.ts` and `src/lib/tickets/config.ts`):

```ts
export const SPONSOR_TIER_TICKET_ALLOCATION: Record<string, number> = {
  Pod: 2,
  Service: 3,
  Ingress: 5,
}
```

It was keyed by tier **title**, and the live tier titles drifted away from those
old Kubernetes-themed names. The current dataset holds titles such as `Gold`,
`Platinum`, `Community`, `Track Sponsorship` and `Afterparty Sponsorship`, so
the `map[title] || 0` lookup fell through to `0` for nearly every sponsor:
sponsor discount codes could not be created for anyone, and the sponsor ticket
budget read as zero.

The number now lives on the `sponsorTier` document instead, where an organizer
can edit it without a code change and where renaming a tier cannot silently
detach its allocation.

## Changes

### Added Fields

- `ticketEntitlement` — non-negative integer, complimentary tickets per sponsor
  in that tier. Written only where the field is currently absent.

## This migration is not required for correctness

The application treats an **unset `ticketEntitlement` as 0**. A dataset that
never runs this migration is therefore self-consistent — just ungenerous: no
tier grants complimentary tickets, and nothing anywhere reads a stale hardcoded
number. Running it restores the **intended** allocations in one reviewed write
instead of a dozen hand-edits in the Studio. If the intended numbers are not
known, leaving it unrun is a safe outcome; do not guess them into the table.

## Owner action required

`index.ts` declares `TICKET_ENTITLEMENT_BY_TIER_TITLE` with one key per sponsor
tier title present in production (queried 2026-08, published documents only) and
every value set to the `UNFILLED` placeholder:

| Tier title                      | Conference edition(s)                     |
| ------------------------------- | ----------------------------------------- |
| `Afterparty Sponsorship`        | Cloud Native Days Norway 2026             |
| `Barista Bar Sponsorship`       | Cloud Native Days Norway 2026             |
| `Community Partner Package`     | Cloud Native Days Norway 2026             |
| `Lanyard Sponsorship`           | Cloud Native Days Norway 2026             |
| `Speakers Dinner`               | Cloud Native Days Norway 2026             |
| `Streaming & Video Sponsorship` | Cloud Native Days Norway 2026             |
| `Track Sponsorship`             | Cloud Native Days Norway 2026             |
| `Gateway (Media Sponsor)`       | Cloud Native Day Bergen 2025              |
| `Ingress`                       | Cloud Native Day Bergen 2024 **and** 2025 |
| `Pod`                           | Cloud Native Day Bergen 2024 **and** 2025 |
| `Service`                       | Cloud Native Day Bergen 2024 **and** 2025 |
| `Community`                     | KontainerKonf 2026 (demo tenant)          |
| `Gold`                          | KontainerKonf 2026 (demo tenant)          |
| `Platinum`                      | KontainerKonf 2026 (demo tenant)          |

How many tickets each tier includes is a commercial decision, so it is left to
the conference owner. Before running:

1. Replace every `UNFILLED` with a non-negative integer (`0` is a legitimate
   answer for a tier that includes no tickets).
2. Or delete the row entirely — a title absent from the table is skipped, and an
   unset `ticketEntitlement` already reads as 0.

Note that the table is keyed by title and three titles exist in **two** Bergen
editions; a value written for `Pod` lands on both. If the editions must differ,
edit those documents individually in the Studio instead.

## Safety

- **Refuses to run while any value is unfilled.** `assertAllocationsAreFilled()`
  runs before a single operation is returned and throws, naming every unfilled
  tier. Nulls and accidental zeros cannot reach the dataset.
- **Never clobbers.** Only documents with no `ticketEntitlement` are written; an
  existing value — including a deliberate `0` — is skipped and logged.
- **Idempotent.** A re-run patches only what is still missing.
- **Skips drafts.** The published document is the source of truth.
- **Skips unknown titles** with a warning rather than guessing.
- Additive: one field, one document type, no deletions.

## Dependencies

The `ticketEntitlement` field must exist in `sanity/schemaTypes/sponsorTier.ts`
(it does) and be deployed before the values are useful to the application.

## Running the Migration

Preferred: the **Run Sanity Migration** workflow
(`.github/workflows/run-migration.yml`), with migration id
`050-sponsortier-add-ticket-entitlement` and dataset `production`. It exports a
dataset backup artifact, dry-runs, and only then applies.

Equivalent local invocation:

```bash
# Dry run — logs intended patches, writes nothing
pnpm sanity migration run 050-sponsortier-add-ticket-entitlement \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production

# Apply
pnpm sanity migration run 050-sponsortier-add-ticket-entitlement \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run --no-confirm
```

With the table unfilled, the dry run fails immediately with
`[050] refusing to run: … allocation(s) are still unfilled …`. That is the
expected state of this migration as committed.

## Verification

```bash
npx sanity documents query \
  '*[_type == "sponsorTier" && !(_id in path("drafts.**"))]{title, ticketEntitlement, "conf": conference->title} | order(title asc)'
```
