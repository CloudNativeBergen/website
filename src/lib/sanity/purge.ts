import 'server-only'
import { clientWrite } from '@/lib/sanity/client'
import { sanityStatus } from '@/lib/sanity/status'

/**
 * Delete a document AND its history (Photo Wall spec §12): a plain delete
 * keeps every revision in the dataset's history, with whatever personal data
 * the document held.
 *
 * A RAW mutation, because the client's typed `delete()` and
 * `transaction().delete()` send only the id and drop `purge`; `mutate()` with
 * a plain mutation object passes it through as written. (The Actions API's
 * delete also takes `purge`, but only from API version 2024-05-23.)
 *
 * Purging needs the token's `editHistory` permission, which no predefined
 * Sanity role grants. On a 403 the document is deleted without its history
 * and a warning is logged, so nothing is left behind for want of the
 * permission: `'historyKept'` says so. Any other refusal is the caller's,
 * thrown as the client threw it (a 409 when another document still holds a
 * strong reference to this one).
 *
 * `ifRevisionId`: delete only THIS revision of the document. A delete takes
 * no revision guard of its own, so the transaction leads with a patch that
 * carries it and changes nothing (it unsets a field no document has): a
 * different revision, or a document created anew under the id, refuses the
 * whole transaction with a 409, and nothing is deleted. The 403 fallback is
 * guarded the same way.
 */
export async function deleteWithHistory(
  id: string,
  { ifRevisionId }: { ifRevisionId?: string } = {},
): Promise<'purged' | 'historyKept'> {
  const guard = ifRevisionId
    ? [{ patch: { id, ifRevisionID: ifRevisionId, unset: [NO_SUCH_FIELD] } }]
    : []
  return mutateDeleting(guard, [id])
}

/**
 * Delete several documents with their history in ONE transaction, the same
 * raw mutation and 403 fallback as {@link deleteWithHistory}, no revision
 * guard: the retention cron's purge (Photo Wall spec §11.1), where the
 * documents were read moments ago from a wall closed to writes. All or
 * nothing, as a transaction is; a missing id is a no-op within it. The
 * caller keeps each call well under Sanity's per-transaction limits.
 */
export async function deleteManyWithHistory(
  ids: readonly string[],
): Promise<'purged' | 'historyKept'> {
  return mutateDeleting([], ids)
}

/** The no-op patch that carries a delete's revision guard. */
interface GuardPatch {
  patch: { id: string; ifRevisionID: string; unset: string[] }
}

async function mutateDeleting(
  guard: readonly GuardPatch[],
  ids: readonly string[],
): Promise<'purged' | 'historyKept'> {
  // Not a literal in the call: the client's `Mutation` type has no `purge`
  // (it is the typed builders' omission), and the request passes it through.
  const purging = [
    ...guard,
    ...ids.map((id) => ({ delete: { id, purge: true } })),
  ]
  try {
    await clientWrite.mutate(purging)
    return 'purged'
  } catch (error) {
    if (sanityStatus(error) !== 403) throw error
  }
  console.warn(
    `Deleted ${ids.join(', ')} WITHOUT history: the write token lacks the editHistory permission`,
  )
  await clientWrite.mutate([...guard, ...ids.map((id) => ({ delete: { id } }))])
  return 'historyKept'
}

/** What the guard patch unsets: a field no document has. */
const NO_SUCH_FIELD = '_deleteGuard'
