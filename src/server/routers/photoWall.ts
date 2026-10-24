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

  /** Every Wall Post with its status and the pending count, polled (§8, §10). */
  moderationQueue: adminProcedure.query(async ({ ctx }) => {
    const conference = await requestConference(ctx.orgId)
    return getModerationQueue(conference._id)
  }),

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
