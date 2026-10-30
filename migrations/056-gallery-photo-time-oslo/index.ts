import { defineMigration, at, patch, set } from 'sanity/migrate'
import { FIXED_FIELD, planDoc, type GalleryDoc } from './plan'

/**
 * NOT RUN. Shifts gallery photo times that the pre-#1735 helpers stored as
 * Oslo wall-clock time labelled UTC. See README.md and plan.ts.
 *
 * Env (all read by the Run Sanity Migration workflow or set locally):
 *   BACKFILL_CONFERENCE_ID  required; only this conference's photos.
 *   GALLERY_TZ_FIX_CUTOFF   required; ISO time #1735 was deployed. Photos
 *                           updated at or after it are listed, not patched.
 *   GALLERY_TZ_FIX_EXCLUDE  optional; comma-separated _ids to leave alone.
 *
 * Each patch sets the corrected `date`, keeps the old value in
 * `dateBeforeTzFix` (the idempotency marker and the undo path), and carries
 * `ifRevision` so a concurrent edit makes the patch fail instead of being
 * overwritten.
 */

const conferenceId = process.env.BACKFILL_CONFERENCE_ID?.trim()
const cutoff = process.env.GALLERY_TZ_FIX_CUTOFF?.trim()
const excluded = new Set(
  (process.env.GALLERY_TZ_FIX_EXCLUDE ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
)

export default defineMigration({
  title: 'Gallery photo times: Oslo wall clock stored as UTC',
  description:
    'Moves gallery `date` values written by the pre-#1735 EXIF and manual ' +
    'edit helpers back by the Oslo offset (1 h winter, 2 h summer). Keeps the ' +
    'old value in dateBeforeTzFix. Scoped to BACKFILL_CONFERENCE_ID.',
  documentTypes: ['imageGallery'],

  async *migrate(documents) {
    if (!conferenceId) throw new Error('056: set BACKFILL_CONFERENCE_ID')
    if (!cutoff || Number.isNaN(Date.parse(cutoff)))
      throw new Error('056: set GALLERY_TZ_FIX_CUTOFF to an ISO time')

    console.log(
      `\n=== Gallery photo time fix — conference ${conferenceId}, cutoff ${cutoff} ===`,
    )
    let shifted = 0
    let review = 0

    for await (const raw of documents()) {
      const doc = raw as unknown as GalleryDoc
      if (doc.conference?._ref !== conferenceId) continue

      const plan = planDoc(doc, cutoff, excluded)
      if (plan.action === 'skip') {
        console.log(`  = ${doc._id} skip: ${plan.reason}`)
        continue
      }
      if (plan.action === 'review') {
        console.log(`  ? ${doc._id} review: ${plan.reason}`)
        review++
        continue
      }
      console.log(
        `  ✓ ${doc._id} ${conferenceId} ${plan.oldValue} -> ${plan.newValue} (${plan.offset})`,
      )
      yield patch(
        doc._id,
        [at('date', set(plan.newValue)), at(FIXED_FIELD, set(plan.oldValue))],
        { ifRevision: doc._rev },
      )
      shifted++
    }

    console.log(
      `\n=== Summary: ${shifted} shifted, ${review} to review by hand ===`,
    )
  },
})
