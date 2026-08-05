import { defineMigration, at, patch, set } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'
import {
  TARGET_COUNT,
  resolveTargets,
  planNotes,
  planSets,
  type ConferenceDefaultsDoc,
  type ConferenceTargetDoc,
} from './plan'

/**
 * ✅ RUN IN PRODUCTION — 2026-08-04 (GitHub Actions run 30885965431).
 *
 * Verified by EFFECT against production on 2026-08-05: all 3 conference
 * documents carry `analyticsPirschCode`, `venueTravelInfo`, `speakerDinnerInfo`
 * and `localRecommendations`; `socialHashtag` = '#cndb2025' is present on Bergen
 * 2025 and on NEITHER of the other two — exactly the Bergen-2025-only targeting
 * described below, which is what makes this a verification rather than a
 * coincidence.
 *
 * Do NOT re-run against `production` as a matter of course. It is idempotent
 * (every write is conditional on the field being absent), but a re-run is still
 * an unnecessary production write. See README.md.
 *
 * Companion to 046. Where 046 pinned the three Cloud Native Days editions'
 * VISUAL identity, this one pins the remaining values that were hardcoded in
 * CODE and are neutralised by the same PR:
 *
 *   `analyticsPirschCode`  the Pirsch site code that was a string literal in
 *                          `src/app/layout.tsx` and injected on EVERY host the
 *                          platform served — a data-ownership problem, since a
 *                          new tenant's traffic landed in a property they do
 *                          not own and cannot read. The field's ABSENT state
 *                          now means "no analytics script at all"; there is
 *                          deliberately no platform-level fallback.
 *   `venueTravelInfo`
 *   `speakerDinnerInfo`    the three /info FAQ answers that were hardcoded
 *   `localRecommendations` Bergen geography (Bybanen, Flesland, Ulriken,
 *                          Bryggen, visitbergen.com) rendered with whatever
 *                          city a tenant had configured. Each is now optional
 *                          and absent means the question is not rendered.
 *   `socialHashtag`        the '#cndb2025' the live social wall searched for,
 *                          written to Bergen 2025 ONLY.
 *
 * Applying it changes NOTHING on screen: every value written is exactly what
 * the code produced before the neutralisation.
 *
 * SAFETY / IDEMPOTENCY: ADDITIVE ONLY. Every write is conditional on the field
 * being absent, so a re-run patches nothing; it never overwrites a stored
 * value, never deletes, never touches a field not listed above, and skips
 * DRAFTS.
 *
 * TARGETING: shared with 046 — by ROUTING IDENTITY, aborting before a single
 * patch is yielded if any target resolves to zero or to more than one
 * conference.
 *
 * ORDERING: independent of 046 (disjoint fields), so it may run before or
 * after it. BOTH had to be applied before the neutralisation PR was deployed;
 * both were, on 2026-08-04 (046 = run 30882197078, this one = run 30885965431).
 *
 * HOW IT WAS RUN, and how to run it against ANOTHER dataset: intentionally,
 * after review, via the "Run Sanity Migration" workflow
 * (.github/workflows/run-migration.yml) with migration id
 * `047-tenant-defaults-backfill`. The workflow exports a dataset backup and
 * performs a dry run first — read the dry-run log, which prints every field it
 * would set and every manual follow-up it detected. `production` has already
 * had this applied (see above).
 */

const isDraft = (id: string): boolean => id.startsWith('drafts.')

/** Targeting only needs the routing fields; the value checks run on the stream. */
const TARGETING_PROJECTION = `{ _id, title, domains }`

export default defineMigration({
  title: 'Backfill the three existing editions’ code-hardcoded tenant defaults',
  description:
    'Pins the analytics site code, the three place-specific /info answers and ' +
    'the social-wall hashtag — all previously hardcoded in application code and ' +
    'served to every tenant — onto the three Cloud Native Days conference ' +
    'documents, so those sites are unchanged once the code defaults become ' +
    'neutral. Additive and idempotent (never overwrites a stored value, skips ' +
    'drafts); aborts if any target is missing or ambiguous. Companion to 046 — ' +
    'both were applied to production on 2026-08-04, ahead of the neutralisation ' +
    'deploy. Run against another dataset via the Run Sanity Migration workflow ' +
    'after maintainer review.',
  documentTypes: ['conference'],

  async *migrate(documents, context) {
    // Pre-pass: resolve every target BEFORE yielding any patch, so an
    // unresolvable target aborts with an empty changeset rather than
    // half-applying.
    const rows = await context.client.fetch<ConferenceTargetDoc[]>(
      `*[_type == "conference" && !(_id in path("drafts.**"))]${TARGETING_PROJECTION}`,
    )

    const { resolved, errors } = resolveTargets(rows ?? [])
    if (errors.length > 0) {
      for (const error of errors) console.error(`  ✗ ${error}`)
      throw new Error(
        `047-tenant-defaults-backfill: ${errors.length} target(s) could not be ` +
          `resolved unambiguously. Nothing was patched. Fix the domains[] entries ` +
          `or update TARGETS in 046's plan.ts, then re-run.`,
      )
    }

    console.log(
      `\n=== Tenant defaults backfill — ${resolved.length}/${TARGET_COUNT} targets resolved ===`,
    )

    const byId = new Map(resolved.map((entry) => [entry.doc._id, entry]))
    const patchedIds = new Set<string>()
    let fieldsWritten = 0

    for await (const rawDoc of documents()) {
      const doc = rawDoc as SanityDocument & ConferenceDefaultsDoc
      if (isDraft(doc._id)) continue

      const target = byId.get(doc._id)
      if (!target) continue

      console.log(`\n  ▸ ${target.spec.label} (${doc._id})`)

      for (const note of planNotes(doc)) {
        console.log(`      · note: ${note}`)
      }

      const sets = planSets(doc, target.spec.host)
      if (sets.length === 0) {
        console.log('      = nothing to do (every field already stored)')
        patchedIds.add(doc._id)
        continue
      }

      for (const planned of sets) {
        console.log(`      ✓ set ${planned.path} — ${planned.reason}`)
        console.log(`          ${JSON.stringify(planned.value)}`)
      }

      yield patch(
        doc._id,
        sets.map((planned) => at(planned.path, set(planned.value))),
      )
      fieldsWritten += sets.length
      patchedIds.add(doc._id)
    }

    const missed = resolved.filter(({ doc }) => !patchedIds.has(doc._id))
    if (missed.length > 0) {
      throw new Error(
        `047-tenant-defaults-backfill: ${missed.length} resolved target(s) never ` +
          `appeared in the document stream (${missed.map((m) => m.doc._id).join(', ')}). ` +
          `The changeset is incomplete — do not treat this run as applied.`,
      )
    }

    console.log(
      `\n=== Summary: ${fieldsWritten} field(s) set across ${resolved.length} conference(s) ===`,
    )
  },
})
