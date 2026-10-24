import { TRPCError } from '@trpc/server'
import { publicProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getWall } from '@/lib/photo-wall/cache'
import { wallPageView } from '@/lib/photo-wall/wall-read'

const notFound = () =>
  new TRPCError({ code: 'NOT_FOUND', message: 'This conference has no wall' })

/**
 * The public Photo Wall (spec §8, §9): what `/wall` polls every 10 s. No
 * sign-in and no input: the conference is the host's, from the CACHED tenant
 * read (a live read per poll would cost Sanity reads the cached wall is
 * there to save), never from the client.
 */
export const wallRouter = router({
  get: publicProcedure.query(async () => {
    const { conference, error } = await getConferenceForCurrentDomain()
    if (error || !conference?._id) throw notFound()
    const data = await getWall(conference._id)
    if (!data) throw notFound()
    return wallPageView(data, conference, new Date())
  }),
})
