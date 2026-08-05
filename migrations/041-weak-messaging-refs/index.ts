import { defineMigration, at, patch, set } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'

/**
 * ✅ RUN IN PRODUCTION — 2026-07-19 (GitHub Actions run 29679682997).
 * It did its job: 24 documents processed, 24 mutations, 1 transaction committed,
 * and NO strong ref predating that run survives in production today.
 *
 * ⚠️ BUT THE TRAP HAS REOPENED — the backfill is NOT self-sustaining. ⚠️
 *
 * As of 2026-08-05 production again holds 802 STRONG speaker refs on these very
 * fields (notification.recipient 408, notification.actor 373, message.author 13,
 * conversation.createdBy 7, conversation.subjectSpeaker 1). EVERY one was created
 * AFTER this migration ran — the oldest 2026-07-19T17:47Z, nine hours later; the
 * newest the day before this note.
 *
 * WHY the "fixed going forward" assumption below is WRONG: schema `weak: true`
 * governs Studio writes and validation, NOT writes made through the API. The
 * shared `createReference()` helper (`src/lib/sanity/helpers.ts`) returns
 * `{ _type: 'reference', _ref }` with no `_weak`, so every ref the application
 * writes is STRONG regardless of the schema. Re-running this migration would
 * clean the backlog and then the backlog would rebuild.
 *
 * DO NOT treat a re-run as the fix. The fix is at the write path; until it lands,
 * the GDPR erasure trap this migration was written to clear is open again.
 *
 * Do NOT re-run against `production` as a matter of course. It is idempotent
 * (already-weak refs are skipped), but a re-run is still an unnecessary
 * production write. See README.md.
 *
 * Backfill `_weak: true` onto the speaker references that the messaging system
 * newly declares `weak` in the schema (see the matching `weak: true` edits in
 * `sanity/schemaTypes/{message,conversation,notification}.ts`):
 *
 *   - `message.author`
 *   - `conversation.createdBy`
 *   - `conversation.subjectSpeaker`
 *   - `notification.recipient`
 *   - `notification.actor`
 *
 * WHY: these were STRONG references, so Sanity refused to delete any speaker who
 * had ever sent a message, created/was the subject of a conversation, or
 * received/triggered a notification — a GDPR erasure trap. Reference strength
 * lives on each stored ref object (`_weak`), not the schema, so EXISTING
 * documents keep their strong refs until rewritten. This migration rewrites them.
 *
 * Marking the fields `weak` in the schema was ASSUMED to fix it going FORWARD.
 * It does not — see the reopened-trap note above. That assumption is the reason
 * this was scoped as a one-shot backfill rather than a write-path change.
 *
 * SAFETY / IDEMPOTENCY: read-only-ish — it only adds `_weak: true` to ref
 * objects that already point at a speaker and don't already carry it. Re-running
 * is a no-op (already-weak refs are skipped). It never changes `_ref` targets,
 * never deletes anything, and preserves any extra keys on the ref object.
 *
 * HOW IT WAS RUN, and how to run it against ANOTHER dataset: intentionally,
 * after review, via the "Run Sanity Migration" workflow
 * (`.github/workflows/run-migration.yml`) with migration id
 * `041-weak-messaging-refs`. The workflow exports a dataset backup and performs
 * a dry run first. `production` has already had this applied (see above).
 */

interface RefObject {
  _type?: string
  _ref?: string
  _weak?: boolean
  [key: string]: unknown
}

interface MessagingDoc extends SanityDocument {
  author?: RefObject | null
  createdBy?: RefObject | null
  subjectSpeaker?: RefObject | null
  recipient?: RefObject | null
  actor?: RefObject | null
}

/** The ref fields to weaken, per document type. */
const WEAK_FIELDS: Record<string, readonly string[]> = {
  message: ['author'],
  conversation: ['createdBy', 'subjectSpeaker'],
  notification: ['recipient', 'actor'],
}

const isDraft = (id: string): boolean => id.startsWith('drafts.')

/** True when `value` is a reference object that is not yet weak. */
function isStrongRef(value: unknown): value is RefObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RefObject)._ref === 'string' &&
    (value as RefObject)._weak !== true
  )
}

export default defineMigration({
  title: 'Weaken messaging/notification speaker references (GDPR erasure)',
  description:
    'Adds _weak:true to message.author, conversation.createdBy/subjectSpeaker, ' +
    'and notification.recipient/actor on existing documents so a speaker who ' +
    'ever messaged can be erased. Idempotent; APPLIED to production on ' +
    '2026-07-19 — run against another dataset via the Run Sanity Migration ' +
    'workflow after maintainer review.',
  documentTypes: ['message', 'conversation', 'notification'],

  async *migrate(documents) {
    let patched = 0
    let refsWeakened = 0

    for await (const rawDoc of documents()) {
      const doc = rawDoc as MessagingDoc
      // The published document is the source of truth; a draft inherits on
      // publish. (Weakening a draft's refs is harmless but unnecessary.)
      if (isDraft(doc._id)) continue

      const fields = WEAK_FIELDS[doc._type] ?? []
      const mutations = []
      for (const field of fields) {
        const value = doc[field as keyof MessagingDoc]
        if (isStrongRef(value)) {
          mutations.push(at(field, set({ ...value, _weak: true })))
          refsWeakened++
        }
      }

      if (mutations.length > 0) {
        patched++
        console.log(
          `  ✓ ${doc._type} ${doc._id}: weakening ${mutations.length} ref(s)`,
        )
        yield patch(doc._id, mutations)
      }
    }

    console.log('\n=== Weaken-refs summary ===')
    console.log(
      `  ${patched} document(s) patched, ${refsWeakened} reference(s) weakened.`,
    )
  },
})
