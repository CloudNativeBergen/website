import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { sanityStatus } from '@/lib/sanity/status'
import type { ShownIncarnation, WallPostTalk } from './moderation'
import {
  AGAIN,
  atMostTwice,
  isShown,
  readWallPost,
  sameIncarnation,
  type StoredWallPost,
} from './wall-post'

/**
 * A published talk of this conference (Talk photos spec §6.2, §6.3), read on
 * the uncached client. The id must already match `PUBLISHED_ID`
 * (`./fields`): no `.`, no list.
 */
export async function isConferenceTalk(talkId: string, conferenceId: string) {
  const talk = await clientReadUncached.getDocument<{
    _type?: string
    conference?: { _ref?: string }
  }>(talkId)
  return talk?._type === 'talk' && talk.conference?._ref === conferenceId
}

/**
 * The picker's list on `/admin/photo-wall` (§6.3): this conference's
 * confirmed talks, by title. Read once per page load, never polled.
 */
export async function readTaggableTalks(
  conferenceId: string,
): Promise<WallPostTalk[]> {
  const rows = await scopedFetch<
    { _id: string; title: string | null; speakers: (string | null)[] | null }[]
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "talk" && status == "confirmed" && !(_id in path("drafts.**"))] | order(title asc) { _id, title, "speakers": speakers[]->name }`,
  )
  return rows.map((row) => ({
    _id: row._id,
    title: row.title ?? '',
    speakers: (row.speakers ?? []).filter(
      (name): name is string => typeof name === 'string',
    ),
  }))
}

/** `done` written; `changed` conflicted twice; `gone` no such post as shown. */
export type TalkTagResult = { status: 'done' | 'changed' | 'gone' }

/**
 * THE TAG CHANGE (Talk photos spec §6.3): an organizer sets, changes or
 * clears a post's talk tag, the one named exception to "organizers never
 * edit a Wall Post". ONE patch of `talk` and nothing else: status and
 * decision times stay, so a post on the wall stays on it. Guarded with
 * `ifRevisionId` against the live read; on a conflict, re-read once and
 * retry on the same post. The caller checks the talk
 * ({@link isConferenceTalk}) and expires the cache tags.
 */
export async function setWallPostTalk({
  conferenceId,
  postId,
  shown,
  talkId,
  onRead,
}: {
  conferenceId: string
  postId: string
  /** The post the card showed: a replacement under the id is `gone`. */
  shown: ShownIncarnation
  /** The talk to tag, or null to clear the tag. */
  talkId: string | null
  /** Told the device and talk of every post read, before any write. */
  onRead?: (deviceKey: string | null, talkId: string | null) => void
}): Promise<TalkTagResult> {
  const read = async (): Promise<StoredWallPost | null> => {
    const post = await readWallPost(conferenceId, postId)
    // A Delete in progress has no tag to change.
    if (!post || post.status === 'deleting') return null
    onRead?.(post.deviceKey, post.talkId)
    return post
  }
  const first = await read()
  if (!first || !isShown(first, shown)) return { status: 'gone' }

  return atMostTwice<TalkTagResult>(
    async (attempt) => {
      let post = first
      if (attempt === 1) {
        const again = await read()
        if (!again || !sameIncarnation(again, first)) return { status: 'gone' }
        post = again
      }
      const patch = clientWrite.patch(postId).ifRevisionId(post._rev)
      try {
        await (
          talkId
            ? patch.set({
                talk: { _type: 'reference', _ref: talkId, _weak: true },
              })
            : patch.unset(['talk'])
        ).commit()
        return { status: 'done' }
      } catch (error) {
        if (sanityStatus(error) === 404) return { status: 'gone' }
        if (sanityStatus(error) === 409) return AGAIN
        throw error
      }
    },
    () => ({ status: 'changed' }),
  )
}
