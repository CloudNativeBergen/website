import { at, defineMigration, patch, set } from 'sanity/migrate'

/**
 * ⏳ NOT YET RUN — AND IT REFUSES TO RUN WHILE ANY TIER IS UNRESOLVED.
 *
 * Backfill `sponsorTier.ticketEntitlement` (the number of complimentary
 * conference tickets a sponsor in that tier gets), seeded from each tier's own
 * "Tickets" perk description.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The allocation used to live as a hardcoded map in the ticketing code:
 *
 *     SPONSOR_TIER_TICKET_ALLOCATION = { Pod: 2, Service: 3, Ingress: 5 }
 *
 * keyed by tier TITLE. Those are the old Kubernetes-themed tier names, and the
 * live tiers were renamed — so `map[title] || 0` fell through to 0 for nearly
 * every sponsor, sponsor discount codes could not be created, and the sponsor
 * ticket budget read as zero.
 *
 * The numbers were never actually lost. They were recorded all along in
 * `perks[].description`, as English prose:
 *
 *     Community Partner Package → "2 included conference tickets"
 *     Gold                      → "4 conference tickets"
 *     Platinum                  → "8 conference tickets"
 *     Ingress / Service / Pod   → "5 tickets" / "3 tickets" / "2 tickets"
 *
 * A free-text field that no code can act on. That is precisely WHY the
 * hardcoded map existed, and why its drift went unnoticed: the truth was in
 * the dataset, unreadable, while a stale copy in the source tree answered 0.
 * It also means those sponsors were entitled to tickets the whole time the
 * admin panel was telling organizers "No ticket entitlement".
 *
 * This migration moves those numbers, once, into the typed field. See
 * `DERIVE_FROM_PERK` for why prose-parsing is acceptable here and nowhere else.
 *
 * ── THIS MIGRATION IS NOT REQUIRED FOR CORRECTNESS ─────────────────────────
 *
 * The application reads an ABSENT `ticketEntitlement` as 0. A dataset that
 * never runs this migration is consistent, just ungenerous. The migration
 * exists only to restore the INTENDED allocations in one reviewed write
 * instead of a dozen hand-edits in the Studio.
 *
 * ── SAFETY / IDEMPOTENCY ───────────────────────────────────────────────────
 *
 *   - It PRINTS every tier, the perk description it read and the number it
 *     extracted, BEFORE yielding a single patch — then ABORTS as a whole if
 *     any tier is unresolved. See `reportOnce` / `assertAllResolved`. The
 *     owner is expected to read that table: a stale sentence in a perk is as
 *     wrong as a stale map, and harder to spot.
 *   - A tier whose description does not yield an unambiguous integer is NOT
 *     guessed at and NOT defaulted to 0 — it stays unresolved and stops the
 *     run, naming itself.
 *   - It only ever SETS a field that is ABSENT. A tier that already carries a
 *     `ticketEntitlement` — including a deliberate 0 — is skipped, never
 *     clobbered, so a re-run patches only what is still missing.
 *   - It skips DRAFTS (the published document is the source of truth).
 *   - A tier whose title is NOT in the table is skipped with a warning.
 *   - It touches one field on one document type, and never deletes.
 *
 * ── TITLES REPEAT ACROSS EDITIONS ──────────────────────────────────────────
 *
 * As of 2026-08 the dataset holds 17 published `sponsorTier` documents with 14
 * distinct titles: "Pod", "Service" and "Ingress" each exist twice, once for
 * Cloud Native Day Bergen 2024 and once for 2025. Derivation is per DOCUMENT,
 * so each edition is read from its own perks and the two cannot be conflated —
 * but an explicit integer in the table applies to BOTH. Worth knowing before
 * overriding a historical edition whose sponsors were already invoiced.
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
 * "Take this tier's number from its own `Tickets` perk description."
 *
 * ── THIS IS A ONE-OFF MIGRATION CONVENIENCE, NEVER A RUNTIME STRATEGY ──────
 *
 * The allocations were recorded all along — in `perks[].description`, as
 * English prose ("2 included conference tickets", "5 tickets"). A free-text
 * field no code can act on. THAT is why the hardcoded
 * SPONSOR_TIER_TICKET_ALLOCATION map existed in the first place, and why its
 * drift went unnoticed for so long: the real numbers were sitting in the
 * dataset, unreadable, while a stale copy in the source tree quietly answered
 * 0.
 *
 * Parsing prose is how we got here. It is acceptable exactly once, under human
 * review, to move those numbers into a typed field — and never again. After
 * this migration `sponsorTier.ticketEntitlement` is the source of truth, the
 * application reads only that, and the perk description reverts to what it
 * always should have been: display copy. Do NOT reach for this parser at
 * runtime, and do not generalise it.
 *
 * A row marked this way is resolved PER DOCUMENT, so two editions sharing a
 * title each get their own reading.
 */
const DERIVE_FROM_PERK = 'derive-from-perk' as const

type Allocation = number | null | typeof DERIVE_FROM_PERK

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  OWNER ACTION REQUIRED — 7 TIERS STILL NEED A NUMBER.                    │
 * │                                                                          │
 * │  Every key below is a sponsor tier title that exists in the production   │
 * │  dataset (queried 2026-08, published documents only).                    │
 * │                                                                          │
 * │  DERIVE_FROM_PERK rows resolve themselves from that tier's own           │
 * │  "Tickets" perk description, and need nothing from you beyond reviewing  │
 * │  the table this migration prints before it writes.                       │
 * │                                                                          │
 * │  UNFILLED rows have NO "Tickets" perk to read, so there is nothing to    │
 * │  derive. Replace each with a non-negative integer (0 is a legitimate     │
 * │  answer for a tier that includes no tickets) — a commercial decision     │
 * │  that belongs to the conference owner, not to this file's author.        │
 * │                                                                          │
 * │  Delete a row instead of filling it if that tier should keep no value    │
 * │  at all — a title absent from this table is simply skipped, and the      │
 * │  application already reads a missing `ticketEntitlement` as 0.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const TICKET_ENTITLEMENT_BY_TIER_TITLE: Record<string, Allocation> = {
  // ── Cloud Native Days Norway 2026 ──────────────────────────────────────
  'Community Partner Package': DERIVE_FROM_PERK, // "2 included conference tickets"

  // No "Tickets" perk exists on these — nothing to derive from. Their perk
  // labels are Networking/Branding/Visibility/Impact/Marketing/Event only.
  'Afterparty Sponsorship': UNFILLED,
  'Barista Bar Sponsorship': UNFILLED,
  'Lanyard Sponsorship': UNFILLED,
  'Speakers Dinner': UNFILLED,
  'Streaming & Video Sponsorship': UNFILLED,
  'Track Sponsorship': UNFILLED,

  // ── Cloud Native Day Bergen 2024 + 2025 ────────────────────────────────
  // Each of these titles exists in BOTH editions. Derivation is per DOCUMENT,
  // so the two editions are read independently even though they share a row
  // here — if their perks ever disagree, each gets its own number.
  Ingress: DERIVE_FROM_PERK, // "5 tickets"
  Pod: DERIVE_FROM_PERK, // "2 tickets"
  Service: DERIVE_FROM_PERK, // "3 tickets"

  'Gateway (Media Sponsor)': UNFILLED, // 2025 only; no Tickets perk

  // ── KontainerKonf 2026 (demo tenant, `kkdemo.tier.*`) ──────────────────
  Community: DERIVE_FROM_PERK, // "2 conference tickets"
  Gold: DERIVE_FROM_PERK, // "4 conference tickets"
  Platinum: DERIVE_FROM_PERK, // "8 conference tickets"
}

export interface SponsorTier {
  _id: string
  _type: 'sponsorTier'
  title: string
  ticketEntitlement?: number | null
  perks?: Array<{ label?: string; description?: string } | null>
}

const isDraft = (id: string): boolean => id.startsWith('drafts.')

const isUsableAllocation = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/**
 * The largest ticket count this migration will DERIVE from prose. Not a
 * business rule — a sanity bound, so a well-formed number that is obviously
 * not a ticket count (a year, most of all) refuses instead of being written.
 */
export const MAX_DERIVED_TICKETS = 100

/**
 * The number of tickets stated by a tier's own "Tickets" perk, or `null`.
 *
 * Deliberately strict — an unparseable description must fall through to
 * UNFILLED and stop the migration, never be guessed at or defaulted to 0:
 *
 *  - the perk label must be "Tickets" (case-insensitive, whitespace-trimmed);
 *  - the description must BEGIN with an integer followed by a WORD ("2
 *    included conference tickets" → 2). A number buried mid-sentence, a
 *    range ("2-4"), a word ("two"), a qualifier ("up to 5"), a percentage
 *    written with the SYMBOL in either spacing ("20%" and Norwegian "20 %"),
 *    an ordinal ("2nd ticket free"), a "2+" / "2 +" and a space-grouped
 *    thousand ("2 000") all yield null. Every one is pinned as a fixture; the
 *    first four were the stated contract, the rest are escapes adversarial
 *    review found in weaker forms of this anchor. A percentage written as a
 *    WORD ("20 percent", "20 prosent") is NOT refused — see the blind spots
 *    below, and do not read this line as covering it;
 *  - a derived value above MAX_DERIVED_TICKETS yields null, because the regex
 *    cannot tell a count from a year ("2026 conference tickets");
 *  - more than one matching perk yields null: ambiguity is not resolvable here.
 *
 * The remaining blind spots are all ONE shape: a leading count that belongs
 * to a different noun. "20 percent discount on tickets" and "20 prosent
 * rabatt" derive 20; so do "20 kr per billett" and "10 free drink coupons and
 * 2 tickets" (→ 10) and "1 per 10 employees" (→ 1). These are digits followed
 * by a word and under the bound, so they are indistinguishable from a real
 * count by any anchor — the difference is semantic. They are left to the
 * human reviewing the printed table, which is why the table prints every tier
 * and its description before a single patch is yielded. Deliberately open, and
 * deliberately NOT fixtured as `valid`, which would freeze them as intended.
 */
export function deriveFromPerks(tier: SponsorTier): {
  value: number | null
  description: string | null
} {
  const ticketPerks = (tier.perks ?? []).filter(
    (perk) => perk?.label?.trim().toLowerCase() === 'tickets',
  )

  if (ticketPerks.length !== 1) return { value: null, description: null }

  const description = ticketPerks[0]?.description ?? null
  if (typeof description !== 'string') return { value: null, description: null }

  // Anchored, and deliberately an ALLOWLIST: the integer must lead and the
  // next token must begin with a LETTER ("2 included conference tickets").
  // Two weaker forms shipped before this one and both let a number through:
  //
  //  - a denylist `(?![\d.,-])` accepted every character it had not thought
  //    to forbid, so "20% discount on conference tickets" derived 20;
  //  - requiring merely whitespace closed that in its en-US spelling but not
  //    in Norwegian, where "20 %" is the correct orthography — and Norwegian
  //    organizers are this platform's primary authors.
  //
  // Requiring a letter refuses "20 %", "2 +" and the space-grouped thousand
  // "2 000" in one clause. `\p{L}` rather than [A-Za-z] so a description
  // starting "2 årskort" is read, not refused. Only widen this lookahead
  // with a fixture proving what the wider form means.
  const match = /^\s*(\d+)(?=\s+\p{L}|$)/u.exec(description)
  if (!match) return { value: null, description }

  const value = Number.parseInt(match[1], 10)
  if (!isUsableAllocation(value)) return { value: null, description }

  // A bound, because the regex cannot tell a count from a year: "2026
  // conference tickets" is well-formed and parses to 2026. No tier grants
  // triple-digit comp tickets, so a number this large means the description
  // was misread — refuse and let a human fill the row. Applied to DERIVED
  // values only; an explicit table entry is a deliberate decision and is
  // not second-guessed.
  if (value > MAX_DERIVED_TICKETS) return { value: null, description }

  return { value, description }
}

interface Resolution {
  id: string
  title: string
  value: number | null
  source: 'perk' | 'table' | 'unresolved'
  description: string | null
}

/**
 * What this migration would write for one tier, and where the number came
 * from. An explicit integer in the table WINS over derivation: it is a
 * deliberate owner decision overriding whatever the prose says.
 */
export function resolve(tier: SponsorTier): Resolution {
  const configured = Object.prototype.hasOwnProperty.call(
    TICKET_ENTITLEMENT_BY_TIER_TITLE,
    tier.title,
  )
    ? TICKET_ENTITLEMENT_BY_TIER_TITLE[tier.title]
    : undefined

  if (isUsableAllocation(configured)) {
    return {
      id: tier._id,
      title: tier.title,
      value: configured,
      source: 'table',
      description: null,
    }
  }

  if (configured === DERIVE_FROM_PERK) {
    const { value, description } = deriveFromPerks(tier)
    return {
      id: tier._id,
      title: tier.title,
      value,
      source: value === null ? 'unresolved' : 'perk',
      description,
    }
  }

  // UNFILLED, or a title absent from the table entirely.
  return {
    id: tier._id,
    title: tier.title,
    value: null,
    source: configured === undefined ? 'table' : 'unresolved',
    description: null,
  }
}

let reported = false

/**
 * Prints EVERY tier and the number derived for it, before a single write.
 *
 * The owner has to eyeball this list: a stale sentence in a perk description
 * is exactly as wrong as the stale map this replaces, and considerably harder
 * to spot — it reads like documentation, not like configuration.
 */
function reportOnce(tiers: SponsorTier[]): Resolution[] {
  const resolutions = tiers.filter((t) => !isDraft(t._id)).map(resolve)

  if (!reported) {
    reported = true
    console.log(
      '\n[050] Derived complimentary-ticket allocations — REVIEW BEFORE WRITING:\n',
    )
    for (const r of resolutions) {
      const shown =
        r.source === 'perk'
          ? `${r.value}   (from perk: ${JSON.stringify(r.description)})`
          : r.source === 'table'
            ? r.value === null
              ? '—    (no table entry; tier will be skipped)'
              : `${r.value}   (explicit table override)`
            : `UNRESOLVED${r.description ? ` (perk said ${JSON.stringify(r.description)})` : ' (no "Tickets" perk)'}`
      console.log(`  ${r.title.padEnd(34)} ${shown}`)
    }
    console.log('')
  }

  return resolutions
}

/**
 * The guard. Runs before this migration returns a single operation, so an
 * unresolved tier produces an error instead of a write. Nothing about a
 * partial fill is safe: a `null` would be written as an empty field and a
 * stray non-integer would fail schema validation later, both silently.
 */
function assertAllResolved(resolutions: Resolution[]): void {
  const unresolved = resolutions
    .filter((r) => r.source === 'unresolved')
    .map((r) => r.title)

  if (unresolved.length > 0) {
    const unique = [...new Set(unresolved)]
    throw new Error(
      `[050] refusing to run: ${unique.length} sponsor tier(s) have no usable allocation — ` +
        `${unique.map((title) => JSON.stringify(title)).join(', ')}. ` +
        `Either give each a non-negative integer in TICKET_ENTITLEMENT_BY_TIER_TITLE (a conference-owner decision), ` +
        `or delete the row so that tier is left untouched. ` +
        `An unset ticketEntitlement already reads as 0 in the application, so doing nothing is safe — writing a guess is not.`,
    )
  }
}

export default defineMigration({
  title: 'Backfill ticketEntitlement on sponsorTier documents missing it',
  description:
    'Sets sponsorTier.ticketEntitlement (complimentary tickets per sponsor), ' +
    'seeded from each tier\'s own "Tickets" perk description, replacing the ' +
    'drifted hardcoded SPONSOR_TIER_TICKET_ALLOCATION map. Additive, ' +
    'conditional on the field being absent, idempotent, skips drafts. Prints ' +
    'every derived number for review, and REFUSES TO RUN if any tier cannot ' +
    'be resolved unambiguously.',
  documentTypes: ['sponsorTier'],

  /**
   * The async-iterable form, not the per-document one, DELIBERATELY: the whole
   * derived table has to be printed and validated before any tier is written.
   * A per-document hook would let the first few tiers be patched and only then
   * abort on an unresolved one, leaving the dataset half-migrated.
   */
  migrate: async function* (documents) {
    const tiers: SponsorTier[] = []
    for await (const doc of documents()) {
      tiers.push(doc as unknown as SponsorTier)
    }

    // Print the whole derived table, then refuse as a WHOLE if any tier is
    // unresolved — before yielding a single patch.
    const resolutions = reportOnce(tiers)
    assertAllResolved(resolutions)

    const byId = new Map(resolutions.map((r) => [r.id, r]))

    for (const tier of tiers) {
      if (isDraft(tier._id)) continue

      // Never clobber an existing value — including a deliberate 0.
      if (typeof tier.ticketEntitlement === 'number') {
        console.log(
          `Skipping sponsorTier ${tier._id} (${tier.title}) — ticketEntitlement already set to ${tier.ticketEntitlement}`,
        )
        continue
      }

      const resolution = byId.get(tier._id)
      if (!resolution || resolution.value === null) {
        console.warn(
          `Skipping sponsorTier ${tier._id} (${tier.title}) — no entry for this title in TICKET_ENTITLEMENT_BY_TIER_TITLE`,
        )
        continue
      }

      console.log(
        `Adding ticketEntitlement ${resolution.value} to sponsorTier ${tier._id} (${tier.title}) [source: ${resolution.source}]`,
      )
      yield patch(tier._id, at('ticketEntitlement', set(resolution.value)))
    }
  },
})
