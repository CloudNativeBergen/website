/**
 * Up to this many responses per Hide, Unhide or Remove request. Remove
 * deletes them in chunks of 100 (speaker feedback spec §10.3); a talk
 * panel's range larger than this goes in several requests
 * ({@link removeInRequests}). Client-safe.
 */
export const MAX_RESPONSES_PER_REQUEST = 2000

/**
 * A response as the organizer saw it: its id and the `submittedAt` the page
 * showed (null when it showed none). Remove deletes it only while it is
 * still that answer (§10.3).
 */
export interface SeenResponse {
  id: string
  submittedAt: string | null
}

/**
 * What a Remove sends (`sessionFeedback.adminRemove`), for a comment and a
 * chart range alike (§10.2, §10.3): each response as seen, and for a range
 * its bounds (start inclusive, end exclusive, ISO instants).
 */
export interface RemoveRequest {
  responses: SeenResponse[]
  range?: { from: string; to: string }
}

/** What a Remove did. */
export interface RemovedCounts {
  removed: number
  /** Skipped: no longer a response of this conference. */
  gone: number
  /** Kept: answered again since the organizer saw it. */
  changed: number
}

/**
 * Send a Remove in requests of at most {@link MAX_RESPONSES_PER_REQUEST}
 * responses, one after another, adding up what each did; a failure stops
 * the rest. One request's own error counts the whole Remove, so it is
 * passed on as it is; with several, a failing request counts only its
 * chunk, so the whole is described instead.
 */
export async function removeInRequests(
  request: RemoveRequest,
  send: (chunk: RemoveRequest) => Promise<RemovedCounts>,
): Promise<RemovedCounts> {
  const { responses } = request
  const total: RemovedCounts = { removed: 0, gone: 0, changed: 0 }
  for (let i = 0; i < responses.length; i += MAX_RESPONSES_PER_REQUEST) {
    try {
      const done = await send({
        ...request,
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
