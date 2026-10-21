/**
 * Up to this many responses per Hide, Unhide or Remove request. Remove
 * deletes them in chunks of 100 (speaker feedback spec §10.3); a talk
 * panel's range larger than this goes in several requests (F6). Client-safe.
 */
export const MAX_RESPONSES_PER_REQUEST = 2000

/**
 * Remove `ids` in requests of at most {@link MAX_RESPONSES_PER_REQUEST},
 * one after another. A failure stops the rest: the first request's own
 * error as it is, a later one's as how many went before it.
 */
export async function removeInRequests(
  ids: readonly string[],
  send: (chunk: string[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += MAX_RESPONSES_PER_REQUEST) {
    try {
      await send(ids.slice(i, i + MAX_RESPONSES_PER_REQUEST))
    } catch (error) {
      if (i === 0) throw error
      throw new Error(
        `Removed ${i} of ${ids.length} responses. Reload to see what’s left, then remove those.`,
      )
    }
  }
}
