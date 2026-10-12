/**
 * A SAVE WHOSE OUTCOME NOBODY KNOWS.
 *
 * `patch.commit()` can fail after Sanity applied the patch: a timeout, a
 * dropped connection, a 5xx on the way back. The server then cannot say that
 * the change was saved, and it cannot say that it was not. It answers with
 * this code, which is not one of the codes that mean "refused, nothing
 * written" (`CONFLICT`, `PRECONDITION_FAILED`, `BAD_REQUEST`, …) and not the
 * `INTERNAL_SERVER_ERROR` of a read that failed before any write.
 *
 * A request that never got an answer from the server at all is the same
 * situation seen from the browser: the mutation may have run.
 *
 * `BAD_GATEWAY` (HTTP 502): the store behind this server did not give a usable
 * answer. One of the codes of tRPC 11.
 */
export const UNCONFIRMED_SAVE = 'BAD_GATEWAY' as const

/**
 * Does this client-side mutation error leave the outcome unknown, and how?
 *
 *  - `'unconfirmed'`: the server answered, and says it could not confirm its
 *    write. The server is reachable, so the page can reload what is stored.
 *  - `'no-answer'`: no code, so no answer from the server at all (the request
 *    or its response was lost). The connection is likely down. DO NOT refresh
 *    the page data then: in Next 16 an RSC fetch that fails falls back to a
 *    browser navigation, and the service worker answers a failed navigation
 *    with the offline page, which would replace the page and the warning with
 *    it. The organizer is told to reload once they can.
 *  - `null`: the server answered with something else; the outcome is known.
 */
export function unknownOutcome(error: {
  data?: { code?: string } | null
}): 'unconfirmed' | 'no-answer' | null {
  const code = error.data?.code
  if (code === undefined) return 'no-answer'
  return code === UNCONFIRMED_SAVE ? 'unconfirmed' : null
}
