import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  ALLOWED_FROM,
  APPROVE_ALL_MAX,
  postingState,
  photoWallLinks,
  POSTING_MODES,
  WALL_LOOKS,
  type PhotoWall,
  type PhotoWallAdminView,
} from '@/lib/photo-wall'
import {
  expirePhotoWall,
  expireWallPost,
  getModerationQueue,
} from '@/lib/photo-wall/cache'
import { deleteWallPost } from '@/lib/photo-wall/delete'
import { COUNT_TIMEOUT_MS, countConsentedPhotos } from '@/lib/photo-wall/export'
import {
  approveAllPending,
  moderateWallPost,
  type ModerationResult,
} from '@/lib/photo-wall/moderate'
import { withdrawWallPostMarketing } from '@/lib/photo-wall/marketing'
import { pendingOf } from '@/lib/photo-wall/moderation'
import { PUBLISHED_ID } from '@/lib/photo-wall/fields'
import {
  isConferenceTalk,
  readTaggableTalks,
  setWallPostTalk,
} from '@/lib/photo-wall/talk-tag'
import { liveConferenceInOrg } from '@/lib/photo-wall/tenant'
import { isWallPostId } from '@/lib/photo-wall/wall-post'
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
  const posting = wall ? postingState(wall, conference, new Date()) : 'paused'
  return {
    wall,
    posting,
    ...(posting === 'notYetOpen' &&
      conference.startDate && { opensOn: conference.startDate }),
    links: photoWallLinks(conference),
    marketingExportCount: wall ? await exportCount(conference._id) : 0,
  }
}

/**
 * THE EXPIRY RULE of every moderation write (§8): the wall, the queue and
 * the device of each post written to, on EVERY outcome, a throw and a
 * `changed` or `gone` answer included. A write can commit and still throw
 * (its answer lost), so "nothing was written" is never known for sure, and
 * over-expiring is cheap. A post whose device is not known (no post, or the
 * read failed) expires the wall and the queue only: the empty key's tag
 * holds nothing. With them, the photos of every talk those posts are (or,
 * on a tag change, were and are) tagged with (Talk photos spec §8).
 */
function expirePosts(
  conferenceId: string,
  deviceKeys: (string | null)[],
  talks: (string | null)[] = [],
) {
  const keys = deviceKeys.length ? deviceKeys : [null]
  for (const key of new Set(keys)) {
    expireWallPost(conferenceId, key ?? '', { wall: true, talks })
  }
}

/**
 * Approve, Reject or Remove (§10) on the live conference: decide, expire by
 * {@link expirePosts} the device of every post the decision READ (it writes
 * only a post it read, and reports each read before any write, so a write
 * that commits and then throws is covered too), and answer the outcome only,
 * never the device key.
 */
async function moderate(
  orgId: string | null,
  args: Omit<Parameters<typeof moderateWallPost>[0], 'conferenceId' | 'onRead'>,
): Promise<{ status: ModerationResult['status'] }> {
  const conference = await requestConference(orgId)
  const devices: (string | null)[] = []
  const talks: (string | null)[] = []
  try {
    const result = await moderateWallPost({
      conferenceId: conference._id,
      ...args,
      onRead: (deviceKey, talkId) => {
        devices.push(deviceKey)
        talks.push(talkId)
      },
    })
    return { status: result.status }
  } finally {
    expirePosts(conference._id, devices, talks)
  }
}

const postId = z.string().refine(isWallPostId, 'Not a Wall Post id')

/** The post a card showed (§10): which one, beyond its id. */
const shown = z
  .object({
    createdAt: z.string().max(64).nullable(),
    assetId: z.string().max(200).nullable(),
  })
  .strict()

const settingsInput = z
  .object({
    postingMode: z.enum(POSTING_MODES).optional(),
    sponsorStrip: z.boolean().optional(),
    trustedPostersSkipApproval: z.boolean().optional(),
    look: z.enum(WALL_LOOKS).optional(),
  })
  .strict()
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: 'Nothing to change',
  })

/**
 * `/admin/photo-wall` (Photo Wall spec §10): the wall's settings and links,
 * Set up, the Posting and Sponsor strip switches, the moderation queue and
 * its actions. Organizers of the conference's organization only, through the
 * `adminProcedure` waist; every write also checks the live conference.
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

  /** The talks the card's tag picker lists (Talk photos spec §6.3). */
  talks: adminProcedure.query(async ({ ctx }) =>
    readTaggableTalks((await requestConference(ctx.orgId))._id),
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

  /**
   * Approve a Pending or Not shown post (§10). `from` is the status its card
   * showed: a post another organizer moved meanwhile is left as it is.
   * Answers `done`, `changed` (the card refreshes) or `gone` ("This photo
   * was deleted").
   */
  approve: adminProcedure
    .input(
      z
        .object({ id: postId, from: z.enum(ALLOWED_FROM.approve), shown })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      moderate(ctx.orgId, {
        postId: input.id,
        action: 'approve',
        from: input.from,
        shown: input.shown,
      }),
    ),

  /** Reject a Pending post (§10): Not shown. */
  reject: adminProcedure
    .input(z.object({ id: postId, shown }).strict())
    .mutation(({ ctx, input }) =>
      moderate(ctx.orgId, {
        postId: input.id,
        action: 'reject',
        shown: input.shown,
      }),
    ),

  /**
   * Remove a post from the wall (§10): Not shown. `from`, optional, is the
   * status the card (or the Undo of an Approve) showed.
   */
  remove: adminProcedure
    .input(
      z
        .object({
          id: postId,
          from: z.enum(ALLOWED_FROM.remove).optional(),
          shown,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      moderate(ctx.orgId, {
        postId: input.id,
        action: 'remove',
        from: input.from,
        shown: input.shown,
      }),
    ),

  /**
   * Approve all pending (§10) of the posts the organizer was SHOWN: `shown`
   * are the Pending cards on their screen, and only those still pending on
   * this wall, and still the post each card showed, are approved, so a post
   * that arrived since their last poll never reaches the wall unseen.
   * Answers how many it approved of how many of them were still pending.
   */
  approveAllPending: adminProcedure
    .input(
      z
        .object({
          shown: z
            .array(shown.extend({ id: postId }).strict())
            .max(APPROVE_ALL_MAX),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const conference = await requestConference(ctx.orgId)
      // Every post it tried, acknowledged or not (a patch can commit and
      // still throw); none known if the run itself failed.
      let attempted: string[] = []
      let talks: string[] = []
      try {
        const result = await approveAllPending({
          conferenceId: conference._id,
          shown: input.shown,
        })
        attempted = result.deviceKeys
        talks = result.talkIds
        return {
          approved: result.approved,
          approvedIds: result.approvedIds,
          pending: result.pending,
        }
      } finally {
        expirePosts(conference._id, attempted, talks)
      }
    }),

  /**
   * Withdraw marketing OK (§10, §12): how organizers honour a contributor's
   * withdrawal of marketing consent without deleting the post, for one who
   * no longer has the phone's cookie. It only ever unticks: there is no
   * consent in the input, so an organizer can never give it on a
   * contributor's behalf. Expires the queue and the post's device once
   * written (or on a throw after the patch was attempted), never the wall:
   * consent changes nothing it shows. Answers `done`, `changed` or `gone`.
   */
  withdrawMarketing: adminProcedure
    .input(z.object({ id: postId, shown }).strict())
    .mutation(async ({ ctx, input }) => {
      const conference = await requestConference(ctx.orgId)
      let device: string | null = null
      let written = false
      try {
        const result = await withdrawWallPostMarketing({
          conferenceId: conference._id,
          postId: input.id,
          shown: input.shown,
          onRead: (deviceKey) => (device = deviceKey),
          onWrite: (pending) => (written = pending),
        })
        written = result.status === 'done'
        return result
      } finally {
        if (written) {
          expireWallPost(conference._id, device ?? '', { wall: false })
        }
      }
    }),

  /**
   * Set, change or clear a post's talk tag (Talk photos spec §6.3): the one
   * named exception to "organizers never edit a Wall Post". A talk not of
   * this conference is BAD_REQUEST, checked before the post is read. Only
   * `talk` is written. Expires as the decisions do, plus the old and the
   * new talk's photos (§8). Answers `done`, `changed` or `gone`.
   */
  setTalkTag: adminProcedure
    .input(
      z
        .object({
          id: postId,
          shown,
          talkId: z.string().regex(PUBLISHED_ID).nullable(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const conference = await requestConference(ctx.orgId)
      if (
        input.talkId &&
        !(await isConferenceTalk(input.talkId, conference._id))
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown talk' })
      }
      const devices: (string | null)[] = []
      // The new talk and every old one read: both lists change (§8).
      const talks: (string | null)[] = [input.talkId]
      try {
        return await setWallPostTalk({
          conferenceId: conference._id,
          postId: input.id,
          shown: input.shown,
          talkId: input.talkId,
          onRead: (deviceKey, talkId) => {
            devices.push(deviceKey)
            talks.push(talkId)
          },
        })
      } finally {
        expirePosts(conference._id, devices, talks)
      }
    }),

  /**
   * Delete now (§10, §12): the post and its photo for good, from any status;
   * on a `deleting` post, Try again. Answers `deleted`, `failed` (the card
   * says "Couldn't delete. Try again.") or `gone`.
   */
  deletePost: adminProcedure
    .input(z.object({ id: postId, shown }).strict())
    .mutation(async ({ ctx, input }) => {
      const conference = await requestConference(ctx.orgId)
      // The device of every post the Delete read, as for the decisions.
      const devices: (string | null)[] = []
      const talks: (string | null)[] = []
      try {
        const result = await deleteWallPost({
          conferenceId: conference._id,
          postId: input.id,
          shown: input.shown,
          onRead: (deviceKey, talkId) => {
            devices.push(deviceKey)
            talks.push(talkId)
          },
        })
        return { status: result.status }
      } finally {
        expirePosts(conference._id, devices, talks)
      }
    }),
})
