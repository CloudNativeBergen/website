/**
 * Up to this many responses per Hide, Unhide or Remove request. Remove
 * deletes them in chunks of 100 (speaker feedback spec §10.3); a talk
 * panel's range larger than this goes in several requests
 * ({@link removeInRequests}). Client-safe.
 */
export const MAX_RESPONSES_PER_REQUEST = 2000

/** A response as the organizer saw it on the chart. */
export interface SeenResponse {
  id: string
  submittedAt: string
}

/** A range to remove: its bounds and the responses seen in it (§10.2). */
export interface RangeToRemove {
  /** ISO instants: the first bucket's start, the last bucket's end. */
  from: string
  to: string
  responses: SeenResponse[]
}

/** What a range Remove did. */
export interface RangeRemoved {
  removed: number
  /** Skipped: no longer a response of this conference. */
  gone: number
  /** Kept: answered again since the chart was read. */
  changed: number
}

/**
 * Remove a range in requests of at most {@link MAX_RESPONSES_PER_REQUEST}
 * responses, one after another, adding up what each did; a failure stops
 * the rest. One request's own error counts the whole range, so it is passed
 * on as it is; with several, a failing request counts only its chunk, so
 * the range is described instead.
 */
export async function removeInRequests(
  range: RangeToRemove,
  send: (chunk: RangeToRemove) => Promise<RangeRemoved>,
): Promise<RangeRemoved> {
  const { responses } = range
  const total: RangeRemoved = { removed: 0, gone: 0, changed: 0 }
  for (let i = 0; i < responses.length; i += MAX_RESPONSES_PER_REQUEST) {
    try {
      const done = await send({
        ...range,
        responses: responses.slice(i, i + MAX_RESPONSES_PER_REQUEST),
      })
      total.removed += done.removed
      total.gone += done.gone
      total.changed += done.changed
    } catch (error) {
      if (responses.length <= MAX_RESPONSES_PER_REQUEST) throw error
      throw new Error(
        `Not all ${responses.length} responses were removed${total.removed > 0 ? ` (at least ${total.removed} were)` : ''}. Reload to see what’s left, then remove those.`,
      )
    }
  }
  return total
}
