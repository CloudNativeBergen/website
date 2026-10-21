/**
 * Up to this many responses per Hide, Unhide or Remove request. Remove
 * deletes them in chunks of 100 (speaker feedback spec §10.3); a talk
 * panel's range larger than this goes in several requests (F6). Client-safe.
 */
export const MAX_RESPONSES_PER_REQUEST = 2000
