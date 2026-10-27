import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { publicProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { readScreenPage } from '@/lib/photo-wall/screen-page'
import { getTalkPhotos } from '@/lib/photo-wall/cache'
import {
  TALK_CARD_PHOTO_LIMIT,
  WALL_PAGE_WHOLE_PX,
  type TalkPhotosView,
} from '@/lib/photo-wall/wall'
import { publicPost, readWallPage } from '@/lib/photo-wall/wall-page'

/**
 * The public Photo Wall (spec §8, §9): what `/wall` polls every 10 s and
 * `/wall/screen` every 5 s. No
 * sign-in and no input: the conference is the host's, from the CACHED tenant
 * read (a live read per poll would cost Sanity reads the cached wall is
 * there to save), never from the client. The admin side is `photoWall`.
 */
const noWall = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'This conference has no wall' })

export const photoWallPublicRouter = router({
  get: publicProcedure.query(async () => {
    // The whole conference, not `resolveConferenceId()`: whether posting is
    // open depends on its dates (§7).
    const { conference, error } = await getConferenceForCurrentDomain()
    const view =
      !error && conference?._id
        ? await readWallPage(conference, new Date())
        : null
    if (!view) throw noWall()
    return view
  }),
  /** Screen Mode's poll (§9.2): the posts with their approval time and the Sponsor strip switch. */
  screen: publicProcedure.query(async () => {
    const { conference, error } = await getConferenceForCurrentDomain()
    const view =
      !error && conference?._id ? await readScreenPage(conference._id) : null
    if (!view) throw noWall()
    return view
  }),
  /**
   * A talk's photos for its program card (talk photos spec §7.1): the first
   * {@link TALK_CARD_PHOTO_LIMIT} and the count, only through the cached
   * `getTalkPhotos` (approved, no speaker opted out). A closed wall still
   * answers (§3); no conference answers none.
   */
  talkPhotos: publicProcedure
    .input(z.object({ talkId: z.string().min(1).max(128) }))
    .query(async ({ input }): Promise<TalkPhotosView> => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference?._id) return { posts: [], count: 0 }
      const posts = await getTalkPhotos(conference._id, input.talkId)
      return {
        posts: posts
          .slice(0, TALK_CARD_PHOTO_LIMIT)
          .map((p) => publicPost(p, WALL_PAGE_WHOLE_PX)),
        count: posts.length,
      }
    }),
})
