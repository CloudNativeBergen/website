import { isFeedbackColour, type FeedbackColour } from './colour'

/**
 * The comment's limit (speaker feedback spec §7.2), counted in UTF-16 code
 * units (`String.length`, which is what the box's `maxLength` and the schema's
 * `Rule.max` count too) after trimming. One definition for the page, Submit
 * and the schema. Client-safe: no server imports.
 */
export const MAX_COMMENT_LENGTH = 1000

/**
 * A response's comment, if it has one worth showing: a known colour and a
 * comment that is not blank. The one filter for every list of comments,
 * the speaker's (§9.3) and the organizers' (§10.1).
 */
export function commentOf(row: {
  colour?: unknown
  comment?: unknown
}): { colour: FeedbackColour; comment: string } | null {
  if (!isFeedbackColour(row.colour)) return null
  if (typeof row.comment !== 'string' || !row.comment.trim()) return null
  return { colour: row.colour, comment: row.comment }
}
