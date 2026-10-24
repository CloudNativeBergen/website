import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, resolveConferenceId, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  postingState,
  photoWallLinks,
  POSTING_MODES,
  type PhotoWall,
  type PhotoWallAdminView,
} from '@/lib/photo-wall'
import { expirePhotoWall, getModerationQueue } from '@/lib/photo-wall/cache'
import { pendingOf } from '@/lib/photo-wall/moderation'
import {
  readPhotoWall,
  setUpPhotoWall,
  updatePhotoWallSettings,
} from '@/lib/photo-wall/sanity'

/**
 * The request's conference: the tenant from `resolveConferenceId()`, its
 * document read live, not from the CDN, so the page shows the end date and
 * domain Settings just wrote. Never from the client. The live document must
 * still belong to `orgId`, the organization the authz waist checked (from a
 * cached read): a conference moved to another organization meanwhile is
 * refused to the old one's organizers.
 */
async function requestConference(orgId: string | null) {
  const conferenceId = await resolveConferenceId()
  const { conference, error } = await getConferenceForCurrentDomain({
    uncached: true,
  })
  if (
    error ||
    conference?._id !== conferenceId ||
    !orgId ||
    conference.organization?._ref !== orgId
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve conference from domain',
    })
  }
  return conference
}

/**
 * The request's conference for the POLLED queue read only, from the CACHED
 * tenant read: every 10 s per open admin page, a live read would cost about
 * 360 Sanity reads an hour (§8 budgets 1–4k per edition). It must still
 * belong to `orgId`. The trade-off: a conference moved to another
 * organization is refused here only once the cached read has caught up, as
 * on every other `adminProcedure` read; M1's writes keep the live check.
 */
async function polledConferenceId(orgId: string | null) {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (
    error ||
    !conference?._id ||
    !orgId ||
    conference.organization?._ref !== orgId
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve conference from domain',
    })
  }
  return conference._id
}

type Conference = Awaited<ReturnType<typeof requestConference>>

function adminView(
  conference: Conference,
  wall: PhotoWall | null,
): PhotoWallAdminView {
  return {
    wall,
    posting: wall ? postingState(wall, conference, new Date()) : 'paused',
    links: photoWallLinks(conference),
  }
}

const settingsInput = z
  .object({
    postingMode: z.enum(POSTING_MODES).optional(),
    sponsorStrip: z.boolean().optional(),
  })
  .strict()
  .refine((c) => c.postingMode !== undefined || c.sponsorStrip !== undefined, {
    message: 'Nothing to change',
  })

/**
 * `/admin/photo-wall` (Photo Wall spec §10): the wall's settings and links,
 * Set up, and the Posting and Sponsor strip switches. Organizers of the
 * conference's organization only, through the `adminProcedure` waist.
 */
export const photoWallRouter = router({
  settings: adminProcedure.query(async ({ ctx }) => {
    const conference = await requestConference(ctx.orgId)
    return adminView(conference, await readPhotoWall(conference._id))
  }),

  /**
   * The pending count on the admin nav's Photo Wall entry (§10, P6), read
   * when the admin shell mounts; `/admin/photo-wall` pushes each count it
   * polls into it. Counted from the polled queue's cache entry, so the badge
   * and the page agree, and a warm cache asks Sanity for nothing.
   */
  pendingCount: adminProcedure.query(async ({ ctx }) =>
    pendingOf(await getModerationQueue(await polledConferenceId(ctx.orgId))),
  ),

  /** Every Wall Post with its status, polled every 10 s (§8, §10). */
  moderationQueue: adminProcedure.query(async ({ ctx }) =>
    getModerationQueue(await polledConferenceId(ctx.orgId)),
  ),

  setUp: adminProcedure.mutation(async ({ ctx }) => {
    const conference = await requestConference(ctx.orgId)
    const wall = await setUpPhotoWall(conference._id)
    expirePhotoWall(conference._id)
    return adminView(conference, wall)
  }),

  updateSettings: adminProcedure
    .input(settingsInput)
    .mutation(async ({ ctx, input }) => {
      const conference = await requestConference(ctx.orgId)
      const wall = await updatePhotoWallSettings(conference._id, input)
      if (!wall) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Set up the Photo Wall first',
        })
      }
      expirePhotoWall(conference._id)
      return adminView(conference, wall)
    }),
})
