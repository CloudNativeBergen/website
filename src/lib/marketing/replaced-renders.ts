import 'server-only'
import type { Patch } from '@sanity/client'
import { groq } from 'next-sanity'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { deleteImageAssetIfOrphaned } from '@/lib/sanity/orphaned-asset'

/**
 * The renders a Task REPLACED that are not yet deleted (#1162).
 *
 * A replaced render is deleted through the shared orphan check, so a post it
 * was already handed to keeps it. Until it is deleted it stays recorded in the
 * Task's `replacedRenders`:
 *
 *  - so the next replacement retries it (a failed cleanup stays retryable);
 *  - and so a speaker's erasure still finds it as a render of a Task about
 *    them. After the replace nothing else records that the file in that post
 *    came from this Task, and erasure never deletes an image merely for
 *    sitting in a post about the speaker (it may be a sponsor's graphic).
 *
 * RECORDED IN THE SAVE, REMOVED AFTER THE DELETE. The id goes into the same
 * revision-guarded patch as the save that replaces it
 * ({@link recordReplacedRender}), so no crash or failure between the two can
 * lose it; and it leaves the record only by VALUE, after its delete succeeded
 * ({@link retireReplacedRenders}), so a replacement landing meanwhile is kept.
 */
export const REPLACED_RENDERS = 'replacedRenders'

/** Ids are interpolated into a patch path only if they look like this. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/

/**
 * Add `replaced` to the Task's record, in the patch that replaces it. One
 * insert per patch: the client keeps only the last insert of a chain.
 */
export function recordReplacedRender(patch: Patch, replaced: string): Patch {
  return patch
    .setIfMissing({ [REPLACED_RENDERS]: [] })
    .insert('after', `${REPLACED_RENDERS}[-1]`, [replaced])
}

/**
 * Try each recorded render; remove from the record the ones deleted. Never
 * throws: a render save or upload must not fail over its cleanup, and an id
 * that stays recorded is retried by the next replacement and found by an
 * erasure.
 */
export async function retireReplacedRenders(
  taskId: string,
  ids: string[],
): Promise<void> {
  for (const id of new Set(ids)) {
    if (!SAFE_ID.test(id)) continue
    const deleted = await deleteImageAssetIfOrphaned(id).then(
      (result) => result.deleted,
      () => false,
    )
    if (!deleted) continue
    try {
      await clientWrite
        .patch(taskId)
        .unset([`${REPLACED_RENDERS}[@=="${id}"]`])
        .commit()
    } catch (error) {
      console.error(`Could not unrecord render ${id} on Task ${taskId}`, error)
    }
  }
}

/**
 * Every render the Tasks name — `asset`, `pendingStudioAsset` and
 * `replacedRenders` — on each Task and its draft twin. Read BEFORE a Task is
 * deleted: afterwards nothing records these files, so a speaker's erasure
 * could not find them and `--verify` would report clean over them (#1162).
 */
export async function readTaskRenderIds(taskIds: string[]): Promise<string[]> {
  if (taskIds.length === 0) return []
  const ids = [...taskIds, ...taskIds.map((id) => `drafts.${id}`)]
  const rows =
    (await clientReadUncached.fetch<
      Array<{ ids: Array<string | null> | null }>
    >(
      // groq-global-scoped: by-id read over Task ids the caller's tenancy guard (or its conference-scoped tree read) admitted, and their draft twins, which share it by construction.
      groq`*[_type == "marketingTask" && _id in $ids]{ "ids": [asset.asset._ref, pendingStudioAsset.asset._ref] + coalesce(replacedRenders, []) }`,
      { ids },
      { cache: 'no-store' },
    )) ?? []
  return [
    ...new Set(
      rows.flatMap((row) =>
        (row.ids ?? []).filter((id): id is string => typeof id === 'string'),
      ),
    ),
  ]
}

/**
 * After a Task delete: each of its renders goes through the shared orphan
 * check, so it is deleted only if nothing references it. Never throws — the
 * Task is already gone, and a cleanup failure must not report the delete
 * failed.
 *
 * KNOWN HOLES, named because with the Task gone nothing links these files to
 * a speaker any more, so an erasure does not find them:
 *
 *  - a render ANY other document still references is kept — a surviving
 *    post is the usual one, but any holder counts, weak references included;
 *  - a render whose reference count or delete FAILS is kept too. There is no
 *    durable retry record for it (the Task that held the ids is gone), so it
 *    is logged at error level with its id, for deleting by hand;
 *  - a render written to the Task WHILE a chunked plan delete runs (the ids
 *    are read before the first chunk) is not seen.
 *
 * All three are in the erasure runbook's "The hole".
 */
export async function deleteOrphanedRenders(ids: string[]): Promise<void> {
  for (const id of new Set(ids)) {
    const result = await deleteImageAssetIfOrphaned(id).catch(() => null)
    // `remainingReferences: -1` is a failed count; 0 with no delete is a
    // failed delete. Either way nothing else will ever retry this file.
    if (!result || (!result.deleted && result.remainingReferences <= 0))
      console.error(
        `Render ${id} of a deleted Task could not be cleaned up; delete it by hand if nothing references it`,
      )
  }
}
