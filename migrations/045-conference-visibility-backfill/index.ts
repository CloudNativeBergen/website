import { defineMigration, at, patch, set } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'

/**
 * ⚠️ MIGRATION NOT RUN — MAINTAINER DECISION REQUIRED. ⚠️
 *
 * VERIFIED NOT RUN, two ways, on 2026-08-05: it appears in NONE of the "Run
 * Sanity Migration" workflow's dispatches, AND its effect is absent from the
 * data — all 3 non-draft conference documents still lack `visibility`
 * (`count(*[_type=="conference" && !(_id in path("drafts.**")) &&
 * !defined(visibility)])` returns 3 of 3). This banner is accurate; unlike its
 * neighbours 041/043/044/046/047, it has not gone stale.
 *
 * Stamp `visibility: 'live'` onto every EXISTING conference that lacks the field
 * (M0 trial groundwork, conference visibility state).
 *
 * WHY (explicitness, NOT correctness): the schema now models a `visibility`
 * field (`'unlisted' | 'live'`) that gates a conference's presence on discovery
 * surfaces (sitemap / robots / search indexing). Server code already treats an
 * ABSENT value as `'live'` (see `@/lib/conference/visibility`), so NO backfill is
 * strictly required — every legacy conference stays public without this. This
 * migration exists only to make the current state EXPLICIT in the data (house
 * pattern: additive backfills that stamp the new field on pre-existing docs), so
 * the field is present and unambiguous going forward.
 *
 * WHAT IT DOES: for each `conference` document that has NO `visibility` value,
 * set `visibility = 'live'`. Documents that already carry a value (including a
 * deliberately-unlisted one) are left untouched.
 *
 * SAFETY / IDEMPOTENCY: ADDITIVE ONLY. It never overwrites an existing value,
 * never touches any other field, never deletes, and skips DRAFTS (the published
 * doc is the source of truth; a publish inherits the value). A re-run only
 * patches whatever is still missing the field.
 *
 * NOT RUN: run intentionally, after review, via the "Run Sanity Migration"
 * workflow (.github/workflows/run-migration.yml) with migration id
 * `045-conference-visibility-backfill`, dataset `production`. The workflow
 * exports a dataset backup and performs a dry run first.
 */

const isDraft = (id: string): boolean => id.startsWith('drafts.')

interface ConferenceDoc extends SanityDocument {
  visibility?: string | null
}

export default defineMigration({
  title: 'Backfill conference.visibility = live on existing conferences',
  description:
    'Additively stamps visibility = "live" on every conference document that ' +
    'lacks the field. Server code already treats absent as live, so this is ' +
    'for explicitness only. Additive and idempotent (skips docs already ' +
    'carrying a value, skips drafts). NOT RUN by default — run via the Run ' +
    'Sanity Migration workflow after maintainer review.',
  documentTypes: ['conference'],

  async *migrate(documents) {
    let patched = 0
    let skipped = 0

    for await (const rawDoc of documents()) {
      const doc = rawDoc as ConferenceDoc
      if (isDraft(doc._id)) continue

      if (doc.visibility) {
        skipped += 1
        continue
      }

      console.log(`  ✓ conference ${doc._id}: set visibility = live`)
      yield patch(doc._id, [at('visibility', set('live'))])
      patched += 1
    }

    console.log('\n=== Conference visibility backfill summary ===')
    console.log(`  ${patched} patched, ${skipped} skipped (already had value)`)
  },
})
