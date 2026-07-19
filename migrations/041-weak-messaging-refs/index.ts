import { defineMigration, at, patch, set } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'

/**
 * ⚠️ MIGRATION NOT RUN — MAINTAINER DECISION REQUIRED. ⚠️
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
 * received/triggered a notification — a GDPR erasure trap. Marking the fields
 * `weak` in the schema fixes it going FORWARD, but reference strength lives on
 * each stored ref object (`_weak`), not the schema, so EXISTING documents keep
 * their strong refs until rewritten. This migration rewrites them.
 *
 * SAFETY / IDEMPOTENCY: read-only-ish — it only adds `_weak: true` to ref
 * objects that already point at a speaker and don't already carry it. Re-running
 * is a no-op (already-weak refs are skipped). It never changes `_ref` targets,
 * never deletes anything, and preserves any extra keys on the ref object.
 *
 * NOT RUN: run intentionally, after review, via the "Run Sanity Migration"
 * workflow (`.github/workflows/run-migration.yml`) with migration id
 * `041-weak-messaging-refs`. The workflow exports a dataset backup and performs
 * a dry run first.
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
    'ever messaged can be erased. Idempotent; NOT RUN by default — run via the ' +
    'Run Sanity Migration workflow after maintainer review.',
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
