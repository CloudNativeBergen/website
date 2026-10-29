import type { DocumentActionComponent } from 'sanity'

/**
 * The document types that carry a short code unique within their conference:
 * the `/go/<code>` carriers (short-links spec §2.1), the Task-owned
 * `socialPostVariant` and the outreach `marketingTask`; and `talk`, whose
 * `feedbackCode` is the `/f/<code>` Feedback Code (speaker feedback spec §5).
 */
export const SHORT_CODE_TYPES: ReadonlySet<string> = new Set([
  'marketingTask',
  'socialPostVariant',
  'talk',
])

/**
 * Remove Studio's Duplicate action from the types that carry a short code.
 *
 * A code is unique within the conference. `readOnly: true` stops an organizer
 * TYPING over the field; it does not stop the Duplicate document action, which
 * copies every field. Two live documents would then share one code, later
 * mutations would preserve it on both, and a lookup by code would resolve to
 * whichever the query happened to return: a `/go/<code>` link to the wrong
 * destination, or an attendee's Feedback Response filed against the wrong
 * talk. A silently wrong answer, not an error.
 *
 * Duplicating these types has no legitimate use anyway: a variant belongs to a
 * post and a Task, a Task belongs to a Campaign with a `key` that is its
 * `utm_content` and must also be unique, and a talk is a speaker's proposal,
 * which an organizer never copies.
 */
export function shortCodeSafeActions(
  actions: readonly DocumentActionComponent[],
  schemaType: string,
): DocumentActionComponent[] {
  return SHORT_CODE_TYPES.has(schemaType)
    ? actions.filter((action) => action.action !== 'duplicate')
    : [...actions]
}
