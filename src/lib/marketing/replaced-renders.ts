import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { deleteImageAssetIfOrphaned } from '@/lib/sanity/orphaned-asset'

/**
 * Retire the render a Task just REPLACED (#1162), and retry the ones earlier
 * replacements could not delete.
 *
 * A replaced render is deleted through the shared orphan check, so a post it
 * was already handed to keeps it. One that is NOT deleted — still held by a
 * post, or the delete failed — is recorded in the Task's `replacedRenders`:
 *
 *  - so the next replacement retries it (a failed cleanup stays retryable);
 *  - and so a speaker's erasure still finds it as a render of a Task about
 *    them. After the replace nothing else records that the file in that post
 *    came from this Task, and erasure never deletes an image merely for
 *    sitting in a post about the speaker (it may be a sponsor's graphic).
 *
 * Never throws: a render save or upload must not fail over its cleanup. The
 * caller has already proven `taskId` belongs to `conferenceId`.
 */
export async function retireReplacedRenders(
  taskId: string,
  conferenceId: string,
  replaced: string | null,
): Promise<void> {
  try {
    const known =
      (await scopedFetch<string[] | null>(
        clientReadUncached,
        { conferenceId },
        `*[_type == "marketingTask" && _id == $taskId][0].replacedRenders`,
        { taskId },
        { cache: 'no-store' },
      )) ?? []
    const ids = [...new Set([...known, ...(replaced ? [replaced] : [])])]
    if (ids.length === 0) return
    const kept: string[] = []
    for (const id of ids) {
      // One that cannot be tried now is kept, like one that is still held.
      const deleted = await deleteImageAssetIfOrphaned(id).then(
        (result) => result.deleted,
        () => false,
      )
      if (!deleted) kept.push(id)
    }
    if (kept.length === known.length && kept.every((id, i) => id === known[i]))
      return
    const patch = clientWrite.patch(taskId)
    await (
      kept.length > 0
        ? patch.set({ replacedRenders: kept })
        : patch.unset(['replacedRenders'])
    ).commit()
  } catch (error) {
    console.error(`Could not retire the renders Task ${taskId} replaced`, error)
  }
}
