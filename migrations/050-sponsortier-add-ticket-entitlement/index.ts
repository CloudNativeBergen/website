import { at, defineMigration, set } from 'sanity/migrate'

/**
 * ⏳ NOT YET RUN — AND IT REFUSES TO RUN UNTIL THE TABLE BELOW IS FILLED IN.
 *
 * Backfill `sponsorTier.ticketEntitlement` (the number of complimentary
 * conference tickets a sponsor in that tier gets) from a per-title lookup
 * table declared in this file.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The allocation used to live as a hardcoded map in the ticketing code:
 *
 *     SPONSOR_TIER_TICKET_ALLOCATION = { Pod: 2, Service: 3, Ingress: 5 }
 *
 * keyed by tier TITLE. Those are the old Kubernetes-themed tier names, and the
 * live tiers were renamed years ago — so `map[title] || 0` fell through to 0
 * for nearly every sponsor, sponsor discount codes could not be created, and
 * the sponsor ticket budget read as zero. The number now lives on the
 * `sponsorTier` document itself (optional `ticketEntitlement` field), where an
 * organizer can edit it without a code change and where a rename cannot
 * silently detach it from its tier.
 *
 * ── THIS MIGRATION IS NOT REQUIRED FOR CORRECTNESS ─────────────────────────
 *
 * The application reads an ABSENT `ticketEntitlement` as 0. A dataset that
 * never runs this migration is therefore consistent, just ungenerous: no tier
 * grants any complimentary tickets. The migration exists only to restore the
 * INTENDED allocations in one reviewed write instead of a dozen hand-edits in
 * the Studio. If the intended numbers are unknown, doing nothing is a safe
 * outcome — do not invent them here.
 *
 * ── SAFETY / IDEMPOTENCY ───────────────────────────────────────────────────
 *
 *   - It ABORTS (throws) if ANY entry in the table below is still the `UNFILLED`
 *     placeholder, or is not a non-negative integer. It cannot write nulls or
 *     accidental zeros over the dataset; see `assertAllocationsAreFilled`.
 *   - It only ever SETS a field that is ABSENT. A tier that already carries a
 *     `ticketEntitlement` — including a deliberate 0 — is skipped, never
 *     clobbered, so a re-run patches only what is still missing.
 *   - It skips DRAFTS (the published document is the source of truth).
 *   - A tier whose title is NOT in the table is skipped with a warning rather
 *     than guessed at.
 *   - It touches one field on one document type, and never deletes.
 *
 * ── THE TABLE IS KEYED BY TITLE, AND TITLES REPEAT ACROSS EDITIONS ─────────
 *
 * As of 2026-08 the dataset holds 17 published `sponsorTier` documents with 14
 * distinct titles: "Pod", "Service" and "Ingress" each exist twice, once for
 * Cloud Native Day Bergen 2024 and once for 2025. A number written here lands
 * on BOTH editions of that title. That is usually what is wanted (the tier is
 * the same product), but it is worth knowing before filling in a value for a
 * historical edition whose sponsors were already invoiced. If the two editions
 * must differ, edit the individual documents in the Studio instead.
 *
 * ── HOW TO RUN ─────────────────────────────────────────────────────────────
 *
 * Via the "Run Sanity Migration" workflow (`.github/workflows/run-migration.yml`)
 * with migration id `050-sponsortier-add-ticket-entitlement`. It exports a
 * dataset backup and performs a dry run first. Do NOT run it from a laptop.
 */

/**
 * Placeholder for an allocation nobody has decided yet. Its presence anywhere
 * in the table below makes the migration refuse to run.
 */
const UNFILLED = null

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  OWNER ACTION REQUIRED — FILL IN EVERY NUMBER BEFORE RUNNING.            │
 * │                                                                          │
 * │  Every key below is a sponsor tier title that exists in the production   │
 * │  dataset (queried 2026-08, published documents only). The value is the   │
 * │  number of COMPLIMENTARY CONFERENCE TICKETS that tier includes — a       │
 * │  commercial decision that belongs to the conference owner, not to this   │
 * │  file's author. Replace each `UNFILLED` with a non-negative integer      │
 * │  (0 is a legitimate answer for a tier that includes no tickets).         │
 * │                                                                          │
 * │  Delete a row instead of filling it if that tier should keep no value    │
 * │  at all — a title absent from this table is simply skipped, and the      │
 * │  application already reads a missing `ticketEntitlement` as 0.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const TICKET_ENTITLEMENT_BY_TIER_TITLE: Record<string, number | null> = {
  // Cloud Native Days Norway 2026
  'Afterparty Sponsorship': UNFILLED,
  'Barista Bar Sponsorship': UNFILLED,
  'Community Partner Package': UNFILLED,
  'Lanyard Sponsorship': UNFILLED,
  'Speakers Dinner': UNFILLED,
  'Streaming & Video Sponsorship': UNFILLED,
  'Track Sponsorship': UNFILLED,

  // Cloud Native Day Bergen 2024 + 2025 (each title exists in BOTH editions,
  // except "Gateway (Media Sponsor)", which is 2025 only)
  'Gateway (Media Sponsor)': UNFILLED,
  Ingress: UNFILLED,
  Pod: UNFILLED,
  Service: UNFILLED,

  // KontainerKonf 2026 (demo tenant, `kkdemo.tier.*`)
  Community: UNFILLED,
  Gold: UNFILLED,
  Platinum: UNFILLED,
}

interface SponsorTier {
  _id: string
  _type: 'sponsorTier'
  title: string
  ticketEntitlement?: number | null
}

const isDraft = (id: string): boolean => id.startsWith('drafts.')

const isUsableAllocation = (value: number | null): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/**
 * The guard. Runs before this migration returns a single operation, so an
 * unfilled table produces an error instead of a write. Nothing about a partial
 * fill is safe: a `null` would be written as an empty field and a stray
 * non-integer would fail schema validation later, both silently.
 */
function assertAllocationsAreFilled(): void {
  const unfilled = Object.entries(TICKET_ENTITLEMENT_BY_TIER_TITLE)
    .filter(([, allocation]) => !isUsableAllocation(allocation))
    .map(([title]) => title)

  if (unfilled.length > 0) {
    throw new Error(
      `[050] refusing to run: ${unfilled.length} sponsor tier allocation(s) are still unfilled in TICKET_ENTITLEMENT_BY_TIER_TITLE — ` +
        `${unfilled.map((title) => JSON.stringify(title)).join(', ')}. ` +
        `Each one needs a non-negative integer number of complimentary tickets (a conference-owner decision), ` +
        `or the row should be deleted so that tier is left untouched. ` +
        `An unset ticketEntitlement already reads as 0 in the application, so doing nothing is safe — writing a guess is not.`,
    )
  }
}

export default defineMigration({
  title: 'Backfill ticketEntitlement on sponsorTier documents missing it',
  description:
    'Sets sponsorTier.ticketEntitlement (complimentary tickets per sponsor) ' +
    'from a per-title table declared in the migration, replacing the drifted ' +
    'hardcoded SPONSOR_TIER_TICKET_ALLOCATION map. Additive, conditional on ' +
    'the field being absent, idempotent, skips drafts. REFUSES TO RUN until ' +
    'every allocation in that table has been filled in by the conference owner.',
  documentTypes: ['sponsorTier'],

  migrate: {
    document(doc) {
      // Before anything else, and before any operation is returned.
      assertAllocationsAreFilled()

      const tier = doc as unknown as SponsorTier
      const operations: ReturnType<typeof at>[] = []

      if (isDraft(tier._id)) {
        return operations
      }

      // Never clobber an existing value — including a deliberate 0.
      if (typeof tier.ticketEntitlement === 'number') {
        console.log(
          `Skipping sponsorTier ${tier._id} (${tier.title}) — ticketEntitlement already set to ${tier.ticketEntitlement}`,
        )
        return operations
      }

      const allocation = Object.prototype.hasOwnProperty.call(
        TICKET_ENTITLEMENT_BY_TIER_TITLE,
        tier.title,
      )
        ? TICKET_ENTITLEMENT_BY_TIER_TITLE[tier.title]
        : undefined

      if (allocation === undefined) {
        console.warn(
          `Skipping sponsorTier ${tier._id} (${tier.title}) — no entry for this title in TICKET_ENTITLEMENT_BY_TIER_TITLE`,
        )
        return operations
      }

      // Unreachable after the guard above; kept so the write can never be a
      // placeholder even if the table is edited into an unusable state later.
      if (!isUsableAllocation(allocation)) {
        throw new Error(
          `[050] refusing to write sponsorTier ${tier._id} (${tier.title}): allocation ${JSON.stringify(allocation)} is not a non-negative integer.`,
        )
      }

      console.log(
        `Adding ticketEntitlement ${allocation} to sponsorTier ${tier._id} (${tier.title})`,
      )
      operations.push(at('ticketEntitlement', set(allocation)))

      return operations
    },
  },
})
