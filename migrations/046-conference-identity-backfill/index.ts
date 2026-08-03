import { defineMigration, at, patch, set } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'
import {
  TARGETS,
  planNotes,
  planSets,
  resolveTargets,
  type ConferenceIdentityDoc,
  type ConferenceTargetDoc,
} from './plan'

/**
 * ⚠️ MIGRATION NOT RUN — MAINTAINER DECISION REQUIRED. ⚠️
 *
 * Make the three EXISTING Cloud Native Days editions' visual identity EXPLICIT
 * DATA on their own conference documents, before the platform's hardcoded
 * defaults are neutralised toward Konf.
 *
 * WHY NOW: today the platform's fallbacks ARE Cloud Native Days' identity — the
 * house palette is their blue (`var(--brand-primary, #1d4ed8)`), the default
 * page background is the animated CNCF logo field, the prospectus copy is their
 * wording. Those three sites render correctly *because* nothing is configured.
 * The moment a default becomes neutral, every one of them silently drifts. This
 * migration writes, as stored values, exactly what the fallbacks produce today,
 * so applying it changes nothing on screen — and the sites keep their look when
 * the defaults move.
 *
 * WHAT IT WRITES (only where the field is ABSENT):
 *   1. `theme`                     = { primaryColor: #1D4ED8, accentColor: #06B6D4 }
 *   2. `backgroundPattern`         = 'cloud-native'
 *   3. `logoBright` / `logomarkBright` — Bergen 2024 + 2025 ONLY: the Cloud
 *      Native Bergen mark those two sites rendered until #703 deleted the
 *      `<Logo>` fallback component. See the caveat below.
 *   4. `sponsorshipCustomization.*` — the eight prospectus strings, merged
 *      UNDER whatever the document already stores.
 *
 * THE ONE DELIBERATE NON-NO-OP: item 3. #703 has ALREADY shipped, so the two
 * Bergen sites are ALREADY rendering a generated name-wordmark instead of their
 * logo, and a foreign house mark as their PWA icon. Writing these slots REVERTS
 * that live regression; it is a no-op against the pre-#703 site, not against
 * today's. Everything else in this migration is a no-op against both.
 *
 * SAFETY / IDEMPOTENCY: ADDITIVE ONLY. Every write is conditional on the field
 * being absent, so a re-run patches nothing; it never overwrites a stored value
 * (including a schema-invalid half-theme), never deletes, never touches a field
 * not listed above, and skips DRAFTS.
 *
 * TARGETING: by ROUTING IDENTITY. A conference is a target iff one of its
 * `domains[]` entries would serve the target host under the exact predicate the
 * site router uses (`domainServesHost`). If any target resolves to zero or to
 * more than one conference the migration ABORTS before yielding a single patch,
 * rather than patching whatever it happened to find.
 *
 * NOT RUN: run intentionally, after review, via the "Run Sanity Migration"
 * workflow (.github/workflows/run-migration.yml) with migration id
 * `046-conference-identity-backfill`, dataset `production`. The workflow exports
 * a dataset backup and performs a dry run first — read the dry-run log, which
 * prints every field it would set and every manual follow-up it detected.
 */

const isDraft = (id: string): boolean => id.startsWith('drafts.')

/**
 * The pre-pass only needs to answer "which conference serves this host?", and
 * the FIELD checks all run against the streamed document below, not against
 * this row. So project the three routing fields and nothing else: the identity
 * fields this migration writes include two ~19KB inline SVGs, and pulling those
 * for every conference in the dataset just to compare `domains[]` is waste.
 */
const TARGETING_PROJECTION = `{ _id, title, domains }`

export default defineMigration({
  title: 'Backfill the three existing editions’ visual identity as stored data',
  description:
    'Pins the house theme, background pattern, prospectus copy and (for the two ' +
    'Bergen editions) the pre-#703 default logo onto the conference documents ' +
    'that currently inherit them from code defaults, so those sites do not drift ' +
    'when the defaults are neutralised toward Konf. Additive and idempotent ' +
    '(never overwrites a stored value, skips drafts). Targets are matched by ' +
    'routing domain and the migration aborts if any target is missing or ' +
    'ambiguous. NOT RUN by default — run via the Run Sanity Migration workflow ' +
    'after maintainer review.',
  documentTypes: ['conference'],

  async *migrate(documents, context) {
    // --- Pre-pass: resolve every target BEFORE yielding any patch ------------
    // Doing this up front means an unresolvable target aborts the run with an
    // empty changeset instead of half-applying.
    const rows = await context.client.fetch<ConferenceTargetDoc[]>(
      `*[_type == "conference" && !(_id in path("drafts.**"))]${TARGETING_PROJECTION}`,
    )

    const { resolved, errors } = resolveTargets(rows ?? [])
    if (errors.length > 0) {
      for (const error of errors) console.error(`  ✗ ${error}`)
      throw new Error(
        `046-conference-identity-backfill: ${errors.length} target(s) could not be ` +
          `resolved unambiguously. Nothing was patched. Fix the domains[] entries ` +
          `or update TARGETS in plan.ts, then re-run.`,
      )
    }

    console.log(
      `\n=== Conference identity backfill — ${resolved.length}/${TARGETS.length} targets resolved ===`,
    )

    const byId = new Map(resolved.map((entry) => [entry.doc._id, entry]))
    const patchedIds = new Set<string>()
    let fieldsWritten = 0

    // --- Stream the conferences and patch the resolved targets ---------------
    // The streamed document is the freshest state, so the absent-field checks
    // run against what is really stored right now.
    for await (const rawDoc of documents()) {
      const doc = rawDoc as SanityDocument & ConferenceIdentityDoc
      if (isDraft(doc._id)) continue

      const target = byId.get(doc._id)
      if (!target) continue

      const label = `${target.spec.label} (${doc._id})`
      console.log(`\n  ▸ ${label} — ${target.spec.host}`)

      for (const note of planNotes(doc, target.spec)) {
        console.log(`      · note: ${note}`)
      }

      const sets = planSets(doc, target.spec)
      if (sets.length === 0) {
        console.log('      = nothing to do (every field already stored)')
        patchedIds.add(doc._id)
        continue
      }

      for (const planned of sets) {
        const preview =
          typeof planned.value === 'string'
            ? `<${planned.value.length} bytes of SVG>`
            : JSON.stringify(planned.value)
        console.log(`      ✓ set ${planned.path} — ${planned.reason}`)
        console.log(`          ${preview}`)
      }

      yield patch(
        doc._id,
        sets.map((planned) => at(planned.path, set(planned.value))),
      )
      fieldsWritten += sets.length
      patchedIds.add(doc._id)
    }

    // --- Post-check: every resolved target must have been seen in the stream -
    const missed = resolved.filter(({ doc }) => !patchedIds.has(doc._id))
    if (missed.length > 0) {
      throw new Error(
        `046-conference-identity-backfill: ${missed.length} resolved target(s) never ` +
          `appeared in the document stream (${missed.map((m) => m.doc._id).join(', ')}). ` +
          `The changeset is incomplete — do not treat this run as applied.`,
      )
    }

    console.log(
      `\n=== Summary: ${fieldsWritten} field(s) set across ${resolved.length} conference(s) ===`,
    )
  },
})
