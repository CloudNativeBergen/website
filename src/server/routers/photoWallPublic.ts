import { TRPCError } from '@trpc/server'
import { publicProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { readWallPage } from '@/lib/photo-wall/wall-page'

/**
 * The public Photo Wall (spec §8, §9): what `/wall` polls every 10 s. No
 * sign-in and no input: the conference is the host's, from the CACHED tenant
 * read (a live read per poll would cost Sanity reads the cached wall is
 * there to save), never from the client. The admin side is `photoWall`.
 */
export const photoWallPublicRouter = router({
  get: publicProcedure.query(async () => {
    // The whole conference, not `resolveConferenceId()`: whether posting is
    // open depends on its dates (§7).
    const { conference, error } = await getConferenceForCurrentDomain()
    const view =
      !error && conference?._id
        ? await readWallPage(conference, new Date())
        : null
    if (!view) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'This conference has no wall',
      })
    }
    return view
  }),
})
