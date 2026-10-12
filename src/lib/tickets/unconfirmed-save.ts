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

/** Is this client-side mutation error one that leaves the outcome unknown? */
export function isUnconfirmedSave(error: {
  data?: { code?: string } | null
}): boolean {
  const code = error.data?.code
  // No code: no answer from the server (the request or its response was lost).
  return code === undefined || code === UNCONFIRMED_SAVE
}
