/**
 * Up to this many responses per Hide, Unhide or Remove request. Remove
 * deletes them in chunks of 100 (speaker feedback spec §10.3); a talk
 * panel's range larger than this goes in several requests (F6). Client-safe.
 */
export const MAX_RESPONSES_PER_REQUEST = 2000

/**
 * Remove `ids` in requests of at most {@link MAX_RESPONSES_PER_REQUEST},
 * one after another; a failure stops the rest. One request's own error
 * counts the whole range, so it is passed on as it is; with several, a
 * failing request counts only its chunk, so the range is described instead.
 */
export async function removeInRequests(
  ids: readonly string[],
  send: (chunk: string[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += MAX_RESPONSES_PER_REQUEST) {
    try {
      await send(ids.slice(i, i + MAX_RESPONSES_PER_REQUEST))
    } catch (error) {
      if (ids.length <= MAX_RESPONSES_PER_REQUEST) throw error
      throw new Error(
        `Not all ${ids.length} responses were removed${i > 0 ? ` (at least ${i} were)` : ''}. Reload to see what’s left, then remove those.`,
      )
    }
  }
}
