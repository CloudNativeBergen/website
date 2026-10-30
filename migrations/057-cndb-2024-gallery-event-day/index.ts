import { defineMigration, at, patch, set } from 'sanity/migrate'
import { EVENT_DAY, MARKER_FIELD, planDoc, type GalleryDoc } from './plan'

/**
 * One-off for Cloud Native Day Bergen 2024: moves its gallery photos from the
 * import date (6–7 Nov) to the event day (30 Oct 2024), keeping each photo's
 * Oslo clock time. Run after 056. See plan.ts.
 *
 * Env: BACKFILL_CONFERENCE_ID, required, must be the 2024 conference.
 * Each patch keeps the old value in dateBeforeEventDayFix (marker and undo
 * path) and carries ifRevision.
 */

const CNDB_2024 = '0d9747cd-e128-4698-8ba7-3dfd4029d692'
const conferenceId = process.env.BACKFILL_CONFERENCE_ID?.trim()

export default defineMigration({
  title: 'CNDB 2024 gallery photos to the event day',
  description: `Moves CNDB 2024 gallery dates to ${EVENT_DAY}, keeping the Oslo clock time.`,
  documentTypes: ['imageGallery'],

  async *migrate(documents) {
    if (conferenceId !== CNDB_2024)
      throw new Error(`057: set BACKFILL_CONFERENCE_ID=${CNDB_2024}`)

    let moved = 0
    for await (const raw of documents()) {
      const doc = raw as unknown as GalleryDoc
      if (doc.conference?._ref !== conferenceId) continue
      const plan = planDoc(doc)
      if (plan.action === 'skip') {
        console.log(`  = ${doc._id} skip: ${plan.reason}`)
        continue
      }
      console.log(`  ✓ ${doc._id} ${plan.oldValue} -> ${plan.newValue}`)
      yield patch(
        doc._id,
        [at('date', set(plan.newValue)), at(MARKER_FIELD, set(plan.oldValue))],
        { ifRevision: doc._rev },
      )
      moved++
    }
    console.log(`\n=== Summary: ${moved} moved to ${EVENT_DAY} ===`)
  },
})
