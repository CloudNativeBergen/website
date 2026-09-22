import type { DocumentActionComponent } from 'sanity'

/**
 * The document types that carry a `/go/<code>` short code (short-links spec
 * §2.1): the Task-owned `socialPostVariant`, and the outreach `marketingTask`.
 */
export const SHORT_CODE_TYPES: ReadonlySet<string> = new Set([
  'marketingTask',
  'socialPostVariant',
])

/**
 * Remove Studio's Duplicate action from the types that carry a short code.
 *
 * A code is unique within the conference and is never changed once minted
 * (§2.2). `readOnly: true` stops an organizer TYPING over the field; it does
 * not stop the Duplicate document action, which copies every field. Two live
 * documents would then share one code, later mutations would preserve it on
 * both, and the resolver's unordered `[0]` match would send `/go/<code>` to
 * whichever the query happened to return — a silently wrong destination, not
 * an error.
 *
 * Duplicating these two types has no legitimate use anyway: a variant belongs
 * to a post and a Task, and a Task belongs to a Campaign with a `key` that is
 * its `utm_content` and must also be unique.
 */
export function shortCodeSafeActions(
  actions: readonly DocumentActionComponent[],
  schemaType: string,
): DocumentActionComponent[] {
  return SHORT_CODE_TYPES.has(schemaType)
    ? actions.filter((action) => action.action !== 'duplicate')
    : [...actions]
}
