import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { groq } from 'next-sanity'

/**
 * Whether anything would be left pointing at the posts or variants a delete is
 * about to remove.
 *
 * Several paths remove this media — a single Task (`deleteTask`), a post
 * tidy-up (`deleteSocialPost`), and a Campaign or plan delete (the deletion
 * tree) — and each grew its own idea of "is anything still using this?", built
 * from a projection of LIVE, same-conference documents. That was safe only
 * while `variant.post` and `task.variant` were STRONG references and Sanity
 * refused the delete itself. #1084 declared them weak, because a chunked
 * Campaign or plan delete cannot get through a strong reference, and every one
 * of those paths silently lost its guard. They share this one now, so the next
 * gap cannot appear in only one of them.
 *
 * Two different things block, and `references()` sees only the first:
 *
 * 1. A REFERRER the delete does not remove — a draft-only sibling variant, a
 *    document on another edition, a Content Release version. For a VARIANT that
 *    is a Task holding it: the tree's `survivingTaskIds` is conference-scoped
 *    and excludes drafts and versions, so a draft twin, a scheduled release or
 *    a Task on another edition was invisible and its variant was deleted out
 *    from under it. Asked generically rather than by naming types.
 * 2. A VERSION TWIN of a target itself. `versions.<release>.<id>` does not
 *    reference the document, it IS the document under a scheduled release, so
 *    no referrer query can see it — and applying that release later would
 *    recreate something the organizer deleted.
 */
export async function mediaDeletionBlockers(
  ids: readonly string[],
  deletedIds: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0
  // Both scoped in GROQ. Listing every Content Release version of every post in
  // the dataset and matching ids here made each of the three callers — Task
  // deletion, post deletion, and the Campaign/plan deletion PREVIEW — grow with
  // other tenants' release history, on operations an organizer waits for.
  //
  // A version twin cannot be found by `references()`, so each target
  // contributes its own `versions.*.<postId>` pattern. `path()` takes a
  // parameter, so no id is interpolated into the query text.
  const twinParams = Object.fromEntries(
    ids.map((id, index) => [`twin${index}`, `versions.*.${id}`]),
  )
  const twinClause = ids
    .map((_, index) => `_id in path($twin${index})`)
    .join(' || ')
  // groq-global-scoped: by-id over ids a conference-scoped read already admitted.
  const referrerQuery = groq`*[references($ids) && !(_id in $deleted)]._id`
  // groq-global-scoped: version twins of those same ids; a release carries no conference of its own.
  const versionQuery = groq`*[${twinClause}]._id`
  const found = await clientReadUncached.fetch<{
    referrers: string[] | null
    twins: string[] | null
  }>(
    `{"referrers": ${referrerQuery}, "twins": ${versionQuery}}`,
    { ids, deleted: deletedIds, ...twinParams },
    { cache: 'no-store' },
  )
  // DISTINCT documents, not the sum of two counts. One document can block for
  // both reasons at once — a release version of a variant is a version twin of
  // that variant AND a referrer of its post — and this number is shown to the
  // organizer, so counting it twice would overstate what they have to clear.
  return new Set([...(found?.referrers ?? []), ...(found?.twins ?? [])]).size
}
