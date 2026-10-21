/**
 * Up to this many responses per Hide, Unhide or Remove request. Remove
 * deletes them in chunks of 100 (speaker feedback spec §10.3); a talk
 * panel's range larger than this goes in several requests
 * ({@link removeInRequests}). Client-safe.
 */
export const MAX_RESPONSES_PER_REQUEST = 2000

/** What a range Remove did: deleted, and skipped as already gone. */
export interface RangeRemoved {
  removed: number
  gone: number
}

/**
 * Remove `ids` in requests of at most {@link MAX_RESPONSES_PER_REQUEST},
 * one after another, adding up what each removed and found gone; a failure
 * stops the rest. One request's own error counts the whole range, so it is
 * passed on as it is; with several, a failing request counts only its
 * chunk, so the range is described instead.
 */
export async function removeInRequests(
  ids: readonly string[],
  send: (chunk: string[]) => Promise<RangeRemoved>,
): Promise<RangeRemoved> {
  const total: RangeRemoved = { removed: 0, gone: 0 }
  for (let i = 0; i < ids.length; i += MAX_RESPONSES_PER_REQUEST) {
    try {
      const done = await send(ids.slice(i, i + MAX_RESPONSES_PER_REQUEST))
      total.removed += done.removed
      total.gone += done.gone
    } catch (error) {
      if (ids.length <= MAX_RESPONSES_PER_REQUEST) throw error
      throw new Error(
        `Not all ${ids.length} responses were removed${total.removed > 0 ? ` (at least ${total.removed} were)` : ''}. Reload to see what’s left, then remove those.`,
      )
    }
  }
  return total
}
