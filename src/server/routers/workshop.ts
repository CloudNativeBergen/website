import { z } from 'zod'
import { formatDateTimeSafe, formatRegistrationInstant } from '@/lib/time'
import {
  router,
  publicProcedure,
  protectedProcedure,
  resolveConferenceId,
  type Context,
  type WorkshopUserIdentity,
} from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { resendWorkshopSignupInstructions } from '@/lib/workshop/resend-instructions'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  workshopListInputSchema,
  workshopAvailabilitySchema,
  workshopSignupInputSchema,
  workshopSignupClientInputSchema,
  workshopSignupsByWorkshopSchema,
  cancelWorkshopSignupSchema,
  confirmWorkshopSignupSchema,
  updateWorkshopCapacitySchema,
  workshopSignupFiltersSchema,
  batchConfirmSignupsSchema,
  batchCancelSignupsSchema,
  WorkshopSignupIdSchema,
  workshopAnnounceSchema,
  workshopUpdateAnnouncementSchema,
  workshopDeleteAnnouncementSchema,
  workshopAnnouncementsQuerySchema,
  workshopEarlySignupsSchema,
} from '@/server/schemas/workshop'
import {
  checkWorkshopCapacity,
  verifyWorkshopBelongsToConference,
  getWorkshopSignups,
  deleteWorkshopSignup,
  moveWorkshopSignupToWaitlist,
  getWorkshopById,
  getWorkshopSignupsByWorkshop,
  getAllWorkshopSignups,
  getWorkshopStatistics,
} from '@/lib/workshop/sanity'
import {
  changeCapacity,
  confirmSignups,
  signUpForWorkshop,
  type SignUpOutcome,
} from '@/lib/workshop/seats'
import { emailPromotedSignups } from '@/lib/workshop/promoted'
import { SEATS_BUSY } from '@/lib/workshop/seats-busy'
import { getWorkshops } from '@/lib/proposal/data/sanity'
import { Status } from '@/lib/proposal/types'
import { sendBasicWorkshopConfirmation } from '@/lib/email/workshop'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { workshopAdminProcedure } from '../workshopAdmin'
import { decideWorkshopPortalAccess } from '@/lib/workshop/access'
import { WorkshopSignupStatus } from '@/lib/workshop/types'
import {
  sponsorStartTimeProblem,
  type WorkshopRegistrationTimes,
} from '@/lib/workshop/registration-window'
import {
  earlyAccessTokenOf,
  expireEarlyAccessLinksIfTheyDisagree,
  findEarlyAccessSponsor,
  listEarlySignups,
  registrationWindowFor,
} from '@/lib/workshop/early-access'
import {
  isOrganizerForCurrentOrg,
  type OrganizerSpeaker,
} from '@/lib/authz/organizer'
import {
  getWorkshopForAnnouncement,
  getConfirmedAnnouncementRecipients,
  createWorkshopAnnouncement,
  getWorkshopAnnouncements,
  getAnnouncementsByWorkshop,
  getWorkshopAnnouncementForAuthz,
  updateWorkshopAnnouncementBody,
  deleteWorkshopAnnouncement,
  sendAnnouncementToConfirmedParticipants,
  isWorkshopFormat,
} from '@/lib/workshop/announcements'
import { consumeAnnouncementRateLimit } from '@/lib/workshop/announcementRateLimit'
import { requireDocumentInCurrentConference } from '@/server/tenancy'

/**
 * Return the signed-in attendee for a self-service workshop action, or throw
 * UNAUTHORIZED. The identity comes exclusively from the portal's sealed session
 * cookie (see `resolveWorkshopUser` in trpc.ts) — it is NEVER taken from client
 * input, which is what an attacker previously spoofed.
 */
/**
 * A seat decision (#1344) that lost the race every time it tried. Nothing was
 * written, and trying again is the remedy.
 */
const seatsBusy = (): never => {
  throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: SEATS_BUSY })
}

/**
 * A refused sign-up (#1344), answered with a clear message: for the attendee
 * about their own sign-up (`own`), or for the organizer adding someone.
 */
const signUpRefused = (
  refused: Extract<SignUpOutcome, { refused: string }>['refused'],
  { own }: { own: boolean },
): never => {
  switch (refused) {
    case 'not-found':
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Workshop does not belong to this conference',
      })
    case 'already-signed-up':
      throw new TRPCError({
        code: 'CONFLICT',
        message: own
          ? 'You are already signed up for this workshop'
          : 'User is already signed up for this workshop',
      })
    case 'full':
      throw new TRPCError({ code: 'CONFLICT', message: 'Workshop is full' })
    case 'removed':
      throw new TRPCError({
        code: 'CONFLICT',
        message: own
          ? 'Your sign-up was cancelled just after it was saved. Sign up again if you still want a place.'
          : 'The sign-up was removed just after it was saved.',
      })
    case 'busy':
      return seatsBusy()
  }
}

/** "Workshop w-2 (31 of 30 seats)": what an organizer's confirm went past. */
const beyondCapacityText = (
  beyond: { workshopTitle: string; seatsTaken: number; capacity: number }[],
) =>
  beyond
    .map((b) => `${b.workshopTitle} (${b.seatsTaken} of ${b.capacity} seats)`)
    .join(', ')

function requireWorkshopUser(ctx: Context): WorkshopUserIdentity {
  const user = ctx.workosUser
  if (!user?.id) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to manage workshop signups',
    })
  }
  return user
}

/**
 * The gate for every attendee self-service procedure (#1294): a WorkOS session
 * AND the portal access decision for the domain-resolved conference. Returns the
 * attendee and that conference, or throws.
 *
 * A session alone is not enough — a WorkOS account is free to create. The
 * decision is the same one `/workshop` renders from
 * (`decideWorkshopPortalAccess`), so the API cannot be more permissive than the
 * page. It runs BEFORE any signup read or write, so a refused caller learns
 * nothing about what exists.
 */
async function requireWorkshopAttendee(ctx: Context) {
  const actor = requireWorkshopUser(ctx)

  const { conference, error } = await getConferenceForCurrentDomain({})
  // The helper NEVER returns null — on failure it returns `{} as Conference`
  // plus `error`, so a bare `!conference` check can never fire. Check the error
  // AND a usable _id instead.
  if (error || !conference?._id) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Conference not found' })
  }
  // The session is for one conference: the one that claims this host, read
  // live. `conference` is resolved through a cache, so right after a host
  // changes hands the two can differ. Then nobody is signed in to this one.
  if (actor.conferenceId !== conference._id) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to manage workshop signups',
    })
  }

  const access = await decideWorkshopPortalAccess({ conference, user: actor })
  if (!access.allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: access.reason })
  }

  return { actor, conference }
}

/**
 * Authorize an announcement edit/delete: the caller must OWN the workshop the
 * announcement belongs to (be one of its speakers) OR be an organizer OF THIS
 * REQUEST'S ORG — the SAME rule as `announce`. Also re-checks multi-tenant
 * isolation (the announcement must live in the caller's resolved conference).
 * Throws NOT_FOUND / FORBIDDEN; returns nothing on success. Author/createdAt are
 * NOT consulted — ownership is by the workshop, not the original author.
 *
 * ORG-SCOPED (see the `announce` gate for the full rationale): the organizer arm
 * goes through `isOrganizerForCurrentOrg`, never through a set of "organizers of
 * any conference".
 */
async function authorizeAnnouncementMutation(
  speaker: OrganizerSpeaker,
  announcementId: string,
): Promise<void> {
  const speakerId = speaker._id
  const conferenceId = await resolveConferenceId()
  const announcement = await getWorkshopAnnouncementForAuthz(announcementId)

  if (
    !announcement ||
    !announcement.workshopId ||
    announcement.conferenceId !== conferenceId
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Announcement not found for this conference',
    })
  }

  const workshop = await getWorkshopForAnnouncement(announcement.workshopId)
  if (!workshop || workshop.conferenceId !== conferenceId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Workshop not found for this conference',
    })
  }

  const isOwner = workshop.speakerIds.includes(speakerId)
  const isOrganizer = isOwner ? false : await isOrganizerForCurrentOrg(speaker)

  if (!isOwner && !isOrganizer) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'Only the workshop owner or an organizer can manage announcements',
    })
  }
}

/** Display name for a signup doc: the name they signed in with, or the email. */
function workshopUserName(user: WorkshopUserIdentity): string {
  return user.name || user.email
}

/**
 * The names `WorkshopRegistrationSettings` gives the three registration
 * times, for a refusal that has to point an organizer at one of them.
 */
const REGISTRATION_TIME_LABELS = {
  workshopRegistrationSponsorStart: 'Sponsor Early Access Opens',
  workshopRegistrationStart: 'Registration Opens',
  workshopRegistrationEnd: 'Registration Closes',
} as const

export const workshopRouter = router({
  list: publicProcedure.input(workshopListInputSchema).query(async () => {
    try {
      const conferenceId = await resolveConferenceId()
      const { workshops, workshopsError } = await getWorkshops({
        conferenceId,
        statuses: [Status.confirmed],
        includeScheduleInfo: true,
      })

      if (workshopsError) {
        throw workshopsError
      }

      return {
        success: true,
        data: workshops,
        count: workshops.length,
      }
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch workshops',
        cause: error,
      })
    }
  }),

  // Public read of a workshop's broadcast announcements, newest first. Bounded
  // [0...50] by the schema. Author name is projected through a WEAK ref, so it
  // may be null if the authoring speaker was erased (GDPR).
  announcements: publicProcedure
    .input(workshopAnnouncementsQuerySchema)
    .query(async ({ input }) => {
      try {
        const announcements = await getWorkshopAnnouncements(
          input.workshopId,
          input.limit,
        )
        return {
          success: true,
          data: announcements,
          count: announcements.length,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch workshop announcements',
          cause: error,
        })
      }
    }),

  // Every workshop's announcements for the conference of the request, in ONE
  // read through the CDN host: what the attendee portal shows under its cards.
  // (`announcements` above reads one workshop, live, for the organizer's view.)
  announcementsByWorkshop: publicProcedure.query(async () => {
    const conferenceId = await resolveConferenceId()
    try {
      return {
        success: true,
        data: await getAnnouncementsByWorkshop(conferenceId),
      }
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch workshop announcements',
        cause: error,
      })
    }
  }),

  // Compose + broadcast an announcement to a workshop's CONFIRMED participants.
  // One-way only (no threads/replies): recipients are WorkOS attendees, not
  // speakers, so there is no identity to attribute a reply to.
  announce: protectedProcedure
    .input(workshopAnnounceSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const conferenceId = await resolveConferenceId()
        const workshop = await getWorkshopForAnnouncement(input.workshopId)

        // Multi-tenant isolation: the workshop must live in the caller's
        // resolved conference, and must actually be a workshop-format talk.
        if (!workshop || workshop.conferenceId !== conferenceId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Workshop not found for this conference',
          })
        }
        if (!isWorkshopFormat(workshop.format)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Referenced talk is not a workshop',
          })
        }

        // Authorization: the caller must OWN the workshop (be one of its
        // speakers) OR be an organizer OF THIS REQUEST'S ORG.
        //
        // ORG-SCOPED (#723). This gate previously asked
        // `getOrganizerSpeakerIds()` — which, with no argument and an
        // unresolvable org, returned the organizers of EVERY conference in the
        // dataset. That made an organizer of tenant A an organizer of tenant B
        // here, letting them broadcast to B's workshop attendees. Authorization
        // now goes through the one org-scoped gate (`isOrganizerForCurrentOrg`,
        // session `organizerOrgIds` vs the domain-resolved org), which fails
        // CLOSED when the org cannot be resolved.
        const speakerId = ctx.speaker._id
        const isOwner = workshop.speakerIds.includes(speakerId)
        const isOrganizer = isOwner
          ? false
          : await isOrganizerForCurrentOrg(ctx.speaker)

        if (!isOwner && !isOrganizer) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'Only the workshop owner or an organizer can send announcements',
          })
        }

        // Rate limit: 3 announcements per workshop per hour (best-effort,
        // per-instance). Guards against an accidental double/triple send.
        const rateLimit = consumeAnnouncementRateLimit(input.workshopId)
        if (!rateLimit.allowed) {
          const minutes = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 60000))
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `Announcement limit reached for this workshop. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`,
          })
        }

        const announcement = await createWorkshopAnnouncement({
          workshopId: input.workshopId,
          conferenceId,
          authorId: speakerId,
          body: input.body,
        })

        // Fan out one email per confirmed participant (bounded concurrency,
        // never-fail per recipient). Failures are counted, not thrown: the
        // announcement is already persisted and visible on the page.
        const recipients = await getConfirmedAnnouncementRecipients(
          input.workshopId,
        )
        const { conference } = await getConferenceForCurrentDomain({})
        const { sent, failed } = await sendAnnouncementToConfirmedParticipants({
          conference: conference || undefined,
          workshopTitle: workshop.title,
          authorName: ctx.speaker.name,
          body: input.body,
          recipients,
        })

        revalidateTag('content:workshops', 'default')

        return {
          success: true,
          data: {
            ...announcement,
            authorName: ctx.speaker.name,
          },
          recipientCount: recipients.length,
          sent,
          failed,
          message: `Announcement sent to ${sent} of ${recipients.length} confirmed participant${recipients.length === 1 ? '' : 's'}`,
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to send workshop announcement',
          cause: error,
        })
      }
    }),

  // Edit an existing announcement's BODY only. Author + createdAt are immutable
  // (never sent, never patched). Authz mirrors `announce`: workshop owner ∨
  // organizer.
  //
  // NO RE-EMAIL POLICY: editing does NOT re-send emails. The announcement was
  // already emailed to confirmed participants when it was created; an edit is a
  // copy correction that only updates the persisted body (and thus the workshop
  // page). Re-emailing on every typo fix would spam participants, so it is
  // deliberately omitted.
  updateAnnouncement: protectedProcedure
    .input(workshopUpdateAnnouncementSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await authorizeAnnouncementMutation(ctx.speaker, input.announcementId)

        await updateWorkshopAnnouncementBody(input.announcementId, input.body)

        revalidateTag('content:workshops', 'default')

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update workshop announcement',
          cause: error,
        })
      }
    }),

  // Delete an announcement. Authz mirrors `announce`: workshop owner ∨
  // organizer. No re-email; the announcement simply disappears from the page.
  deleteAnnouncement: protectedProcedure
    .input(workshopDeleteAnnouncementSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await authorizeAnnouncementMutation(ctx.speaker, input.announcementId)

        await deleteWorkshopAnnouncement(input.announcementId)

        revalidateTag('content:workshops', 'default')

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete workshop announcement',
          cause: error,
        })
      }
    }),

  getAvailability: publicProcedure
    .input(workshopAvailabilitySchema)
    .query(async ({ input }) => {
      try {
        const conferenceId = await resolveConferenceId()
        const belongs = await verifyWorkshopBelongsToConference(
          input.workshopId,
          conferenceId,
        )

        if (!belongs) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Workshop not found for this conference',
          })
        }

        const capacity = await checkWorkshopCapacity(input.workshopId)

        return {
          success: true,
          data: {
            workshopId: input.workshopId,
            available: capacity.available,
            capacity: capacity.capacity,
            signups: capacity.signups,
            isAvailable: capacity.available > 0,
          },
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check workshop availability',
          cause: error,
        })
      }
    }),

  getMySignups: publicProcedure.query(async ({ ctx }) => {
    try {
      // Identity is taken ONLY from the WorkOS session — never from client
      // input — so a caller cannot read another attendee's signups. No session
      // → no signups (rather than an error, since the workshop page renders
      // this list optimistically).
      if (!ctx.workosUser?.id) {
        return {
          success: true,
          data: [],
          count: 0,
        }
      }

      const { actor, conference } = await requireWorkshopAttendee(ctx)

      const signups = await getWorkshopSignups(
        actor.id,
        conference._id,
        undefined,
      )

      return {
        success: true,
        data: signups,
        count: signups.length,
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch user signups',
        cause: error,
      })
    }
  }),

  signup: publicProcedure
    .input(workshopSignupClientInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Bind the signup to the authenticated WorkOS session. The id/email come
        // from the sealed session cookie (authoritative); the client no longer
        // sends — and cannot spoof — any identity.
        const { actor, conference } = await requireWorkshopAttendee(ctx)
        const userWorkOSId = actor.id
        const userEmail = actor.email
        const userName = workshopUserName(actor)

        // THE ONE WINDOW RULE (#1345), the same one the portal page and its
        // list ask, with this caller's early access (#1346). The gate above
        // has passed. The link is looked up LIVE, within this conference, and
        // only when it can matter: the request carries the cookie, the
        // conference has an early-access window and the official opening has
        // not passed. A revoke takes effect on the next attempt.
        const { registration, access: sponsor } = await registrationWindowFor(
          conference,
          new Date(),
          async () => {
            const token = earlyAccessTokenOf(ctx.req.cookies)
            if (!token) return null
            let found: Awaited<ReturnType<typeof findEarlyAccessSponsor>>
            try {
              found = await findEarlyAccessSponsor(conference._id, token)
            } catch (error) {
              // NEVER ADMITS, and never names the official opening to a
              // person whose early access was simply not checked.
              console.error('[workshop] early-access lookup failed', error)
              throw new TRPCError({
                code: 'SERVICE_UNAVAILABLE',
                message:
                  'We could not check your early access right now. Please try again in a moment.',
              })
            }
            // The link is not live. If the portal page's cached links still
            // say it is, the page is showing this person an early access
            // they do not have: make its next view read them again.
            if (!found) {
              await expireEarlyAccessLinksIfTheyDisagree(
                conference._id,
                token,
                {
                  live: false,
                },
              )
            }
            return found
          },
        )
        if (registration.status === 'not-open-yet') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            // The day AND the time of day, as the portal's banner names it:
            // two start times can fall on one day (spec §6). For a caller
            // with early access this is the sponsor start time.
            message: `Workshop registration opens on ${formatRegistrationInstant(registration.opensAt)}`,
          })
        }

        if (registration.status === 'closed') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Workshop registration has closed',
          })
        }

        // The conference is ALWAYS the domain-resolved one — never client
        // input — so a signup cannot target (or bypass the registration
        // window of) another tenant's conference. Confirmed or waitlisted,
        // and one sign-up per person, is decided in the write (#1344).
        const outcome = await signUpForWorkshop(
          {
            userWorkOSId,
            userEmail,
            userName,
            experienceLevel: input.experienceLevel,
            operatingSystem: input.operatingSystem,
            notes: input.notes,
            workshopId: input.workshop._ref,
            conferenceId: conference._id,
            // AN EARLY SIGN-UP records the sponsor whose link admitted it. A
            // sponsor was looked up only inside the early-access window, so a
            // sign-up after the official opening records nothing, cookie or
            // not.
            earlyAccessSponsorId: sponsor?._id,
          },
          { whenFull: 'waitlist' },
        )
        if ('refused' in outcome) {
          return signUpRefused(outcome.refused, { own: true })
        }
        const { signup } = outcome
        const isWaitlist = signup.status === WorkshopSignupStatus.WAITLIST

        await sendBasicWorkshopConfirmation({
          userEmail: signup.userEmail,
          userName: signup.userName,
          status: signup.status,
          conference: conference || undefined,
          workshopTitle: signup.workshop?.title ?? input.workshop._ref,
          workshopDate: (signup.workshop as { date?: string })?.date,
          workshopTime: (signup.workshop as { startTime?: string })?.startTime,
        }).catch(() => {})

        revalidateTag('content:workshops', 'default')
        revalidateTag('admin:workshops', 'default')

        return {
          success: true,
          data: signup,
          message: isWaitlist
            ? 'Successfully added to workshop waitlist'
            : 'Successfully signed up for workshop',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create workshop signup',
          cause: error,
        })
      }
    }),

  cancelSignup: publicProcedure
    .input(cancelWorkshopSignupSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { actor, conference } = await requireWorkshopAttendee(ctx)

        // TENANCY: resolve the signup INSIDE the request's conference. Without
        // the predicate this was a by-id lookup across every tenant.
        const signups = await getAllWorkshopSignups({
          conferenceId: conference._id,
          signupIds: [input.signupId],
        })

        if (signups.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Signup not found',
          })
        }

        // Ownership check: a caller may only cancel their OWN signup. Previously
        // any authenticated caller could cancel ANY signup id, evicting other
        // attendees' seats.
        if (signups[0].userWorkOSId !== actor.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only cancel your own workshop signup',
          })
        }

        // A cancel REMOVES the sign-up (#1331). It used to set `waitlist`, so
        // a person who backed out sat among the people waiting for a seat and
        // could be confirmed, and emailed, by a capacity increase.
        await deleteWorkshopSignup(input.signupId)

        revalidateTag('content:workshops', 'default')

        return {
          success: true,
          message: 'Workshop signup cancelled successfully',
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to cancel workshop signup',
          cause: error,
        })
      }
    }),

  admin: router({
    getAllSignups: workshopAdminProcedure
      .input(workshopSignupFiltersSchema)
      .query(async ({ input }) => {
        try {
          const conferenceId = await resolveConferenceId()
          const signups = await getAllWorkshopSignups({
            conferenceId,
            workshopId: input.workshopId,
            status: input.status as WorkshopSignupStatus | undefined,
            page: input.page,
            pageSize: input.pageSize,
          })

          const allSignups = await getAllWorkshopSignups({
            conferenceId,
            workshopId: input.workshopId,
            status: input.status as WorkshopSignupStatus | undefined,
          })

          return {
            success: true,
            data: signups,
            pagination: {
              page: input.page || 1,
              pageSize: input.pageSize || 50,
              total: allSignups.length,
              totalPages: Math.ceil(allSignups.length / (input.pageSize || 50)),
            },
          }
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch workshop signups',
            cause: error,
          })
        }
      }),

    listSignups: workshopAdminProcedure
      .input(workshopSignupsByWorkshopSchema)
      .query(async ({ input }) => {
        try {
          // OWNERSHIP (#730): `input.workshopId` is client input and the helper
          // had NO tenant predicate — any workshop id read that tenant's signup
          // list, attendee names and email addresses included.
          const signups = await getWorkshopSignupsByWorkshop(
            input.workshopId,
            await resolveConferenceId(),
            input.status as WorkshopSignupStatus | undefined,
          )

          return {
            success: true,
            data: signups,
            count: signups.length,
          }
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch workshop signups',
            cause: error,
          })
        }
      }),

    /**
     * The "Early sign-ups" list (#1348, spec §9): every sign-up of the
     * request's conference that a sponsor's early-access link admitted,
     * narrowed to one sponsor when `sponsorId` is sent. THE NARROWING IS DONE
     * HERE, over every match: the page's general read (`getAllSignups`) holds
     * the first hundred sign-ups only. One read, see `listEarlySignups`.
     */
    listEarlySignups: workshopAdminProcedure
      .input(workshopEarlySignupsSchema)
      .query(async ({ input }) => {
        try {
          return await listEarlySignups(
            await resolveConferenceId(),
            input.sponsorId,
          )
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch early sign-ups',
            cause: error,
          })
        }
      }),

    confirmSignup: workshopAdminProcedure
      .input(confirmWorkshopSignupSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): `getAllWorkshopSignups` only constrains the
          // conference when the filter is PASSED. Without it this confirmed any
          // signup id in the shared dataset, including another tenant's.
          const conferenceId = await resolveConferenceId()
          const signups = await getAllWorkshopSignups({
            conferenceId,
            signupIds: [input.signupId],
          })

          if (signups.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Signup not found',
            })
          }

          const signup = signups[0]

          // Past capacity is the organizer's call (#1344), and is named as
          // such. The seat is taken through the same guard as a sign-up.
          const outcome = signup.workshop?._id
            ? await confirmSignups(signup.workshop._id, conferenceId, [
                signup._id,
              ])
            : ({ refused: 'not-found' } as const)
          if ('refused' in outcome && outcome.refused === 'busy') {
            return seatsBusy()
          }
          if ('refused' in outcome || !outcome.confirmed.includes(signup._id)) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Signup not found',
            })
          }
          // Waiting at the time of the write, not at this read.
          const wasWaitlisted = outcome.newlyConfirmed.includes(signup._id)
          const beyond = wasWaitlisted && outcome.seatsTaken > outcome.capacity

          if (input.sendEmail && wasWaitlisted) {
            const { conference } = await getConferenceForCurrentDomain({})
            if (conference) {
              await sendBasicWorkshopConfirmation({
                userEmail: signup.userEmail,
                userName: signup.userName,
                status: 'confirmed',
                conference,
                workshopTitle: signup.workshop?.title ?? 'Workshop',
                workshopDate: (signup.workshop as { date?: string })?.date,
                workshopTime: (signup.workshop as { startTime?: string })
                  ?.startTime,
              }).catch(() => {})
            }
          }

          revalidateTag('admin:workshops', 'default')
          revalidateTag('content:workshops', 'default')

          return {
            success: true,
            message: beyond
              ? `Participant confirmed beyond capacity (${outcome.seatsTaken} of ${outcome.capacity} seats)${input.sendEmail && wasWaitlisted ? ' and notification email sent' : ''}`
              : wasWaitlisted
                ? 'Participant confirmed and notification email sent'
                : 'Workshop signup confirmed successfully',
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to confirm workshop signup',
            cause: error,
          })
        }
      }),

    updateCapacity: workshopAdminProcedure
      .input(updateWorkshopCapacitySchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): the same check the public `signup` path already
          // does. Unguarded, `updateWorkshopCapacity` is a bare
          // `patch(id).set({capacity})` — no tenant check and no `_type` check,
          // so it could stamp `capacity` onto any document in the dataset.
          // The capacity, and the waitlisted sign-ups it lets in, are written
          // together through the seats guard (#1344): a sign-up at the same
          // moment cannot take a seat on the old count.
          const conferenceId = await resolveConferenceId()
          const outcome = await changeCapacity(
            input.workshopId,
            conferenceId,
            input.capacity,
          )
          if ('refused' in outcome) {
            switch (outcome.refused) {
              case 'not-found':
                throw new TRPCError({
                  code: 'NOT_FOUND',
                  message: 'Workshop not found for this conference',
                })
              case 'below-seats-taken':
                throw new TRPCError({
                  code: 'CONFLICT',
                  message: `Cannot reduce capacity below current signup count (${outcome.seatsTaken})`,
                })
              case 'busy':
                return seatsBusy()
            }
          }

          const updatedWorkshop = await getWorkshopById(input.workshopId)
          const promotedCount = outcome.promoted.length
          await emailPromotedSignups(conferenceId, outcome.promoted)

          revalidateTag('content:workshops', 'default')
          revalidateTag('admin:workshops', 'default')

          return {
            success: true,
            data: updatedWorkshop,
            message:
              promotedCount > 0
                ? `Workshop capacity updated successfully. ${promotedCount} participant${promotedCount === 1 ? '' : 's'} promoted from waitlist.`
                : 'Workshop capacity updated successfully',
            promotedCount,
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update workshop capacity',
            cause: error,
          })
        }
      }),

    batchConfirmSignups: workshopAdminProcedure
      .input(batchConfirmSignupsSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): scope to the request's conference — foreign ids
          // simply do not come back — and then refuse the WHOLE batch unless
          // every supplied id came back. Filtering alone reported `success: true`
          // for a batch that silently dropped foreign ids (and, with the default
          // page size, ids past the 50th).
          const conferenceId = await resolveConferenceId()
          const uniqueIds = Array.from(new Set(input.signupIds))
          const signups = await getAllWorkshopSignups({
            conferenceId,
            signupIds: uniqueIds,
            pageSize: Math.max(1, uniqueIds.length),
          })
          if (signups.length !== uniqueIds.length) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'One or more signups do not belong to this conference',
            })
          }

          if (signups.length !== input.signupIds.length) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'One or more signups were not found for this conference',
            })
          }

          const { conference } = await getConferenceForCurrentDomain({})

          // ONE guarded write per workshop (#1344). Past capacity is the
          // organizer's call, and the answer names each workshop it went past.
          const byWorkshop = new Map<string, typeof signups>()
          for (const signup of signups) {
            const workshopId = signup.workshop?._id
            if (!workshopId) continue
            const group = byWorkshop.get(workshopId) ?? []
            group.push(signup)
            byWorkshop.set(workshopId, group)
          }
          const confirmed: typeof signups = []
          const newlyConfirmed: typeof signups = []
          const busy: string[] = []
          const errored: string[] = []
          const beyondCapacity: {
            workshopTitle: string
            seatsTaken: number
            capacity: number
          }[] = []
          for (const [workshopId, group] of byWorkshop) {
            const outcome = await confirmSignups(
              workshopId,
              conferenceId,
              group.map((signup) => signup._id),
            ).catch((error) => {
              console.error(
                '[workshop] batch confirm failed',
                workshopId,
                error,
              )
              return null
            })
            const workshopTitle = group[0].workshop?.title ?? 'Workshop'
            // One workshop's failure does not undo another's committed write:
            // it is named, so the organizer can try that one again.
            if (!outcome) errored.push(workshopTitle)
            if (outcome && 'refused' in outcome && outcome.refused === 'busy') {
              busy.push(workshopTitle)
            }
            if (!outcome || 'refused' in outcome) continue
            confirmed.push(
              ...group.filter((s) => outcome.confirmed.includes(s._id)),
            )
            newlyConfirmed.push(
              ...group.filter((s) => outcome.newlyConfirmed.includes(s._id)),
            )
            if (
              outcome.newlyConfirmed.length > 0 &&
              outcome.seatsTaken > outcome.capacity
            ) {
              beyondCapacity.push({
                workshopTitle,
                seatsTaken: outcome.seatsTaken,
                capacity: outcome.capacity,
              })
            }
          }

          if (input.sendEmails && conference) {
            await Promise.allSettled(
              newlyConfirmed.map((signup) =>
                sendBasicWorkshopConfirmation({
                  userEmail: signup.userEmail,
                  userName: signup.userName,
                  status: 'confirmed',
                  conference,
                  workshopTitle: signup.workshop?.title ?? 'Workshop',
                  workshopDate: (signup.workshop as { date?: string })?.date,
                  workshopTime: (signup.workshop as { startTime?: string })
                    ?.startTime,
                }),
              ),
            )
          }

          const succeeded = confirmed.length
          const failed = signups.length - succeeded
          const beyond =
            beyondCapacity.length > 0
              ? ` Beyond capacity: ${beyondCapacityText(beyondCapacity)}.`
              : ''
          const tryAgain =
            busy.length > 0
              ? ` Many people were signing up for ${busy.join(', ')}, so nothing was saved there. Try again in a moment.`
              : ''
          const failedFor =
            errored.length > 0
              ? ` Something went wrong for ${errored.join(', ')}, so no one was confirmed there. Try again.`
              : ''

          revalidateTag('admin:workshops', 'default')
          revalidateTag('content:workshops', 'default')

          return {
            success: true,
            message: `Confirmed ${succeeded} signup${succeeded === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}.${beyond}${tryAgain}${failedFor}`,
            results: {
              succeeded,
              failed,
              total: signups.length,
              beyondCapacity,
            },
          }
        } catch (error) {
          // Preserve the fail-closed refusal instead of masking it as a 500.
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to batch confirm signups',
            cause: error,
          })
        }
      }),

    /**
     * "Move to waitlist" (#1331). The name says cancel and is kept: a caller
     * outside this repository was not ruled out. It sets `waitlist` and frees
     * the seat; it does not delete, and it emails nobody.
     */
    batchCancelSignups: workshopAdminProcedure
      .input(batchCancelSignupsSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): resolve which of the supplied ids actually belong
          // to the request's conference and refuse the WHOLE batch if any does
          // not — a silent partial move would hide the attempt.
          const uniqueIds = Array.from(new Set(input.signupIds))
          const owned = await getAllWorkshopSignups({
            conferenceId: await resolveConferenceId(),
            signupIds: uniqueIds,
            pageSize: Math.max(1, uniqueIds.length),
          })
          if (owned.length !== uniqueIds.length) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'One or more signups do not belong to this conference',
            })
          }
          const results = await Promise.allSettled(
            owned.map((signup) => moveWorkshopSignupToWaitlist(signup._id)),
          )

          const succeeded = results.filter(
            (r) => r.status === 'fulfilled',
          ).length
          const failed = results.filter((r) => r.status === 'rejected').length

          revalidateTag('admin:workshops', 'default')
          revalidateTag('content:workshops', 'default')

          return {
            success: true,
            message: `Moved ${succeeded} signup${succeeded === 1 ? '' : 's'} to the waitlist${failed > 0 ? `, ${failed} failed` : ''}`,
            results: {
              succeeded,
              failed,
              total: input.signupIds.length,
            },
          }
        } catch (error) {
          // Preserve the fail-closed refusal instead of masking it as a 500.
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to move signups to the waitlist',
            cause: error,
          })
        }
      }),

    deleteSignup: workshopAdminProcedure
      .input(WorkshopSignupIdSchema)
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): `input.signupId` is client input and the delete
          // was completely unguarded — it removed any document in the dataset.
          await requireDocumentInCurrentConference(
            input.signupId,
            'workshopSignup',
          )
          await deleteWorkshopSignup(input.signupId)

          revalidateTag('admin:workshops', 'default')
          revalidateTag('content:workshops', 'default')

          return {
            success: true,
            message: 'Signup deleted successfully',
          }
        } catch (error) {
          // Preserve the fail-closed refusal instead of masking it as a 500.
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete signup',
            cause: error,
          })
        }
      }),

    getSummary: workshopAdminProcedure.query(async () => {
      try {
        const conferenceId = await resolveConferenceId()
        const statistics = await getWorkshopStatistics(conferenceId)

        return {
          success: true,
          data: statistics,
          generatedAt: new Date().toISOString(),
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate workshop summary',
          cause: error,
        })
      }
    }),

    /**
     * Mail every workshop ticket holder the sign-up instructions WITH the
     * portal link (#1298) — for tickets sold while the main host could not
     * sign in, whose email went out without it. Refused until the link works;
     * at most once an hour per conference. See `resend-instructions.ts`.
     */
    resendSignupInstructions: workshopAdminProcedure.mutation(async () => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference?._id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conference not found',
        })
      }
      const outcome = await resendWorkshopSignupInstructions({
        ...conference,
        _id: conference._id,
      })
      switch (outcome.kind) {
        case 'sent':
          return {
            sent: outcome.sent,
            failed: outcome.failed,
            unconfirmed: outcome.unconfirmed,
          }
        case 'email-unavailable':
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Email sending is not available right now, so nothing was sent. Try again in a few minutes.',
          })
        case 'portal-unavailable':
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Attendees cannot sign in yet on the conference’s main host, so there is no working link to send. Check the domain card in Settings.',
          })
        case 'registration-closed':
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Workshop registration has closed, so there is nothing to sign up for. Nothing was sent.',
          })
        case 'ticketing-unavailable':
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'The ticket list could not be read, so nothing was sent. Try again in a few minutes.',
          })
        case 'rate-limited': {
          const minutes = Math.max(1, Math.ceil(outcome.retryAfterMs / 60_000))
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `The instructions were resent less than an hour ago. Try again in ${minutes} minutes.`,
          })
        }
      }
    }),

    manualSignup: workshopAdminProcedure
      .input(workshopSignupInputSchema.omit({ conference: true }))
      .mutation(async ({ ctx, input }) => {
        try {
          // Conference is resolved from the request domain — never client
          // input — so an organizer cannot write signups into another
          // tenant's conference.
          const conferenceId = await resolveConferenceId()

          // Refused when full, decided in the write (#1344).
          const outcome = await signUpForWorkshop(
            {
              userWorkOSId: input.userWorkOSId,
              userEmail: input.userEmail,
              userName: input.userName,
              experienceLevel: input.experienceLevel,
              operatingSystem: input.operatingSystem,
              notes: input.notes,
              workshopId: input.workshop._ref,
              conferenceId,
            },
            { whenFull: 'refuse' },
          )
          if ('refused' in outcome) {
            return signUpRefused(outcome.refused, { own: false })
          }
          const { signup } = outcome

          await sendBasicWorkshopConfirmation({
            userEmail: signup.userEmail,
            userName: signup.userName,
            // No conference document here — the request's org IS the tenant.
            orgId: ctx.orgId,
            workshopTitle: signup.workshop?.title ?? input.workshop._ref,
            workshopDate: (signup.workshop as { date?: string })?.date,
            workshopTime: (signup.workshop as { startTime?: string })
              ?.startTime,
          }).catch(() => {})

          revalidateTag('content:workshops', 'default')
          revalidateTag('admin:workshops', 'default')

          return {
            success: true,
            data: signup,
            message: 'Successfully added participant to workshop',
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to add participant to workshop',
            cause: error,
          })
        }
      }),

    updateRegistrationTimes: workshopAdminProcedure
      .input(
        z.object({
          // OMITTED MEANS UNCHANGED, `null` means cleared. A form sends only
          // the times its organizer changed, so a form seeded before a
          // colleague's save cannot erase a time it never showed.
          sponsorStartDate: z.string().nullable().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const conferenceId = await resolveConferenceId()

          // What this save sets: only the times it was sent, as instants.
          const changes: WorkshopRegistrationTimes = {}
          const sent = (value: string | null) =>
            value ? new Date(value).toISOString() : null
          if (input.sponsorStartDate !== undefined) {
            changes.workshopRegistrationSponsorStart = sent(
              input.sponsorStartDate,
            )
          }
          if (input.startDate !== undefined) {
            changes.workshopRegistrationStart = sent(input.startDate)
          }
          if (input.endDate !== undefined) {
            changes.workshopRegistrationEnd = sent(input.endDate)
          }
          if (Object.keys(changes).length === 0) {
            return {
              success: true,
              message: 'Workshop registration times updated successfully',
            }
          }

          // THE RULES ARE APPLIED TO WHAT WILL BE STORED: the sent times over
          // the stored ones, read live. A save that moves or clears the
          // official opening is judged against the sponsor start time that is
          // stored, whether or not the form that sent it knew of one.
          //
          // `_rev` comes from the SAME read as the times, and the patch below
          // is conditioned on it: two saves of different fields at once would
          // otherwise each pass against the same stored pair and together
          // store a combination neither was judged on.
          const stored = await clientReadUncached.fetch<
            (WorkshopRegistrationTimes & { _rev?: string }) | null
          >(
            // groq-global-scoped: keyed by `resolveConferenceId()`'s id, the request's own conference and the one patched below; never client input.
            `*[_type == "conference" && _id == $id][0]{ _rev, workshopRegistrationSponsorStart, workshopRegistrationStart, workshopRegistrationEnd }`,
            { id: conferenceId },
            { cache: 'no-store' },
          )
          // No document, or none that a write can be conditioned on: judging
          // the sent times alone would let through what the stored ones
          // forbid. Refused before anything is written.
          if (!stored?._rev) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message:
                'This conference could not be read, so nothing was saved. Reload the page and try again.',
            })
          }
          const { _rev: readAt, ...storedTimes } = stored
          const merged: WorkshopRegistrationTimes = {
            ...storedTimes,
            ...changes,
          }

          // A REFUSAL NAMES EVERY STORED TIME IT WAS JUDGED AGAINST THAT THE
          // SAVE DID NOT SEND, by the name the card gives it and as the card
          // shows it: the form that sent the save may not be showing it, and
          // its organizer could not otherwise tell what to change.
          const refusal = (
            message: string,
            ...judgedOn: (keyof typeof REGISTRATION_TIME_LABELS)[]
          ) => {
            const unseen = judgedOn.flatMap((field) => {
              const time = storedTimes[field]
              return field in changes || !time
                ? []
                : [
                    `${REGISTRATION_TIME_LABELS[field]} is set to ${formatDateTimeSafe(time)}.`,
                  ]
            })
            return new TRPCError({
              code: 'BAD_REQUEST',
              message: unseen.length
                ? `${message}. ${unseen.join(' ')}`
                : message,
            })
          }

          if (
            merged.workshopRegistrationStart &&
            merged.workshopRegistrationEnd &&
            new Date(merged.workshopRegistrationStart) >=
              new Date(merged.workshopRegistrationEnd)
          ) {
            throw refusal(
              // By the names the form gives the two fields.
              'Registration Closes must be later than Registration Opens',
              'workshopRegistrationStart',
              'workshopRegistrationEnd',
            )
          }

          // A sponsor start time needs an official opening and must be
          // earlier than it (#1345): the rule the `conference` schema
          // validates with.
          const sponsorStartProblem = sponsorStartTimeProblem(merged)
          if (sponsorStartProblem) {
            throw refusal(
              sponsorStartProblem,
              'workshopRegistrationSponsorStart',
              'workshopRegistrationStart',
            )
          }

          // Only the fields that were sent: the others are not touched. And
          // only if the document is still the one that was read. No retry: a
          // second pass would judge the organizer's change against times they
          // have not seen.
          try {
            await clientWrite
              .patch(conferenceId)
              .ifRevisionId(readAt)
              .set(changes)
              .commit()
          } catch (error) {
            if ((error as { statusCode?: number } | null)?.statusCode !== 409) {
              throw error
            }
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                'The registration times were changed while you were saving, so nothing was saved. Review the times and try again.',
            })
          }

          revalidateTag('admin:settings', 'default')
          revalidateTag(conferenceTag(conferenceId), 'default')

          return {
            success: true,
            message: 'Workshop registration times updated successfully',
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update workshop registration times',
            cause: error,
          })
        }
      }),
  }),
})
