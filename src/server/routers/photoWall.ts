import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  postingState,
  photoWallLinks,
  POSTING_MODES,
  type PhotoWall,
  type PhotoWallAdminView,
} from '@/lib/photo-wall'
import { expirePhotoWall, getModerationQueue } from '@/lib/photo-wall/cache'
import { COUNT_TIMEOUT_MS, countConsentedPhotos } from '@/lib/photo-wall/export'
import { liveConferenceInOrg } from '@/lib/photo-wall/tenant'
import {
  readPhotoWall,
  setUpPhotoWall,
  updatePhotoWallSettings,
} from '@/lib/photo-wall/sanity'

/** The request's conference, read live, in the caller's organization. */
async function requestConference(orgId: string | null) {
  const conference = await liveConferenceInOrg(orgId)
  if (!conference) {
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

/**
 * The consented export's count (P5), or undefined when it can't be read in
 * time: metadata, so it never fails the settings read, nor a Set up or
 * settings change that has already been committed.
 */
async function exportCount(conferenceId: string): Promise<number | undefined> {
  try {
    return await countConsentedPhotos(
      conferenceId,
      AbortSignal.timeout(COUNT_TIMEOUT_MS),
    )
  } catch (error) {
    console.error('Could not count the Photo Wall export', error)
    return undefined
  }
}

async function adminView(
  conference: Conference,
  wall: PhotoWall | null,
): Promise<PhotoWallAdminView> {
  return {
    wall,
    posting: wall ? postingState(wall, conference, new Date()) : 'paused',
    links: photoWallLinks(conference),
    marketingExportCount: wall ? await exportCount(conference._id) : 0,
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
