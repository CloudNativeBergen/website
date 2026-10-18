/**
 * The comment's limit (speaker feedback spec §7.2), counted in UTF-16 code
 * units (`String.length`, which is what the box's `maxLength` and the schema's
 * `Rule.max` count too) after trimming. One definition for the page, Submit
 * and the schema. Client-safe: no server imports.
 */
export const MAX_COMMENT_LENGTH = 1000
