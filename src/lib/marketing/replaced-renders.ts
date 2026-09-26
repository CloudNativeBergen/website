import 'server-only'
import type { Patch } from '@sanity/client'
import { clientWrite } from '@/lib/sanity/client'
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
