import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { groq } from 'next-sanity'

/**
 * Whether anything would be left pointing at posts a delete is about to remove.
 *
 * THREE separate paths delete a post — a single Task (`deleteTask`), a post
 * tidy-up (`deleteSocialPost`), and a Campaign or plan delete (the deletion
 * tree) — and each grew its own idea of "is this the last variant?", built from
 * a projection of LIVE, same-conference variants. That was safe only while
 * `variant.post` was a strong reference and Sanity refused the delete itself.
 * #1084 declared it weak, because a chunked Campaign or plan delete cannot get
 * through a strong reference, and every one of those paths silently lost its
 * guard. They share this one now, so the next gap cannot appear in only one.
 *
 * Two different things block, and `references()` sees only the first:
 *
 * 1. A REFERRER the delete does not remove — a draft-only sibling variant, a
 *    variant on another edition, a Content Release version of a variant. Asked
 *    generically rather than by naming types.
 * 2. A VERSION TWIN of the post itself. `versions.<release>.<postId>` does not
 *    reference the post, it IS the post under a scheduled release, so no
 *    referrer query can see it — and applying that release later would recreate
 *    a post the organizer deleted.
 */
export async function postDeletionBlockers(
  postIds: readonly string[],
  deletedIds: readonly string[],
): Promise<number> {
  if (postIds.length === 0) return 0
  // Both scoped in GROQ. Listing every Content Release version of every post in
  // the dataset and matching ids here made each of the three callers — Task
  // deletion, post deletion, and the Campaign/plan deletion PREVIEW — grow with
  // other tenants' release history, on operations an organizer waits for.
  //
  // A version twin cannot be found by `references()`, so each target
  // contributes its own `versions.*.<postId>` pattern. `path()` takes a
  // parameter, so no id is interpolated into the query text.
  const twinParams = Object.fromEntries(
    postIds.map((id, index) => [`twin${index}`, `versions.*.${id}`]),
  )
  const twinClause = postIds
    .map((_, index) => `_id in path($twin${index})`)
    .join(' || ')
  // groq-global-scoped: by-id over post ids a conference-scoped read already admitted.
  const referrerQuery = groq`count(*[references($postIds) && !(_id in $deleted)])`
  // groq-global-scoped: version twins of those same post ids; a release carries no conference of its own.
  const versionQuery = groq`count(*[_type == "socialPost" && (${twinClause})])`
  const counts = await clientReadUncached.fetch<{
    referrers: number | null
    twins: number | null
  }>(
    `{"referrers": ${referrerQuery}, "twins": ${versionQuery}}`,
    { postIds, deleted: deletedIds, ...twinParams },
    { cache: 'no-store' },
  )
  return (counts?.referrers ?? 0) + (counts?.twins ?? 0)
}
