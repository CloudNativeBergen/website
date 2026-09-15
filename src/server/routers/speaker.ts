import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  router,
  protectedProcedure,
  adminProcedure,
  resolveConferenceId,
} from '@/server/trpc'
import {
  SpeakerInputSchema,
  SpeakerCreateSchema,
  SpeakerUpdateSchema,
  SpeakerSearchSchema,
  SpeakerMergeSchema,
  EmailUpdateSchema,
  IdParamSchema,
} from '@/server/schemas/speaker'
import { mergeSpeakers, MergeValidationError } from '@/lib/speaker/merge'
import {
  getSpeaker,
  getSpeakerAdminDetail,
  updateSpeaker,
  getOrganizers,
  getSpeakers,
  getOrgSpeakerDirectory,
  getDuplicateSpeakerCandidateRecords,
  getSpeakerTicketGrantState,
  findSpeakerByEmailForOrganizerCreate,
} from '@/lib/speaker/sanity'
import {
  findDuplicateSpeakerCandidates,
  type DuplicateCandidatesReport,
} from '@/lib/speaker/duplicates'
import { clientWrite } from '@/lib/sanity/client'
import { generateKey } from '@/lib/sanity/helpers'
import { getProposals } from '@/lib/proposal/data/sanity'
import { handleSpeakerTicket } from '@/lib/events/handlers/speakerTicket'
import { Action } from '@/lib/proposal/types'
import { getOrganizationRefForCurrentConference } from '@/lib/organization/sanity'
import {
  getVerifiedProfileEmails,
  isEmailVerifiedForSession,
} from '@/lib/profile/server'
import { updateProfileEmail } from '@/lib/profile/sanity'
import { encode } from 'next-auth/jwt'

const CLI_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 // 30 days
const JWT_SALT = 'authjs.session-token'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getFeaturedSpeakers } from '@/lib/featured/sanity'
import { Status } from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import { sendMultiSpeakerEmail } from '@/lib/email/speaker'
import { sendBroadcastEmail } from '@/lib/email/broadcast'
import {
  syncConferenceAudience,
  getOrCreateConferenceAudience,
} from '@/lib/email/audience'
import { isValidPortableText } from '@/lib/portabletext/validation'
import type { PortableTextBlock } from '@portabletext/types'
import { buildOrganizerCreatedSpeaker } from '@/lib/speaker/sanity'
import { canonicalEmail, normalizeEmail } from '@/lib/speaker/email'
import {
  requireCurrentOrgId,
  requireSpeakerInCurrentOrg,
  speakerExclusivityBlocks,
} from '@/server/tenancy'
import {
  isAbsoluteHttpsUrl,
  NO_REGISTRATION_LINK_MESSAGE,
} from '@/lib/conference/validation'
import {
  fetchEventTicketCandidates,
  fetchRedeemedSpeakerEmails,
} from '@/lib/tickets/speakerStatus'
import type {
  SpeakerTicketIssuanceOptions,
  SpeakerTicketIssuanceResult,
} from '@/lib/events/handlers/speakerTicket'

/** The conference shape the ticket sweep passes straight to the handler. */
type TicketSweepConference = NonNullable<
  Awaited<ReturnType<typeof getConferenceForCurrentDomain>>['conference']
>

/**
 * The confirmed programme for THIS domain's conference, read with the speaker
 * claim link intact.
 *
 * `includeSpeakerRegistrationLink`: the sweep calls `handleSpeakerTicket`
 * DIRECTLY rather than through the event bus, so the conference it passes is
 * the handler's only source of that link. Without the flag the redacting read
 * hands the handler `undefined` and every swept speaker gets the no-link email
 * even though the organizer configured one. Only counts and a boolean are
 * returned to the client, so the link never leaves the server.
 */
async function ticketSweepContext(): Promise<{
  conference: TicketSweepConference
  proposals: ProposalExisting[]
}> {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({
      includeSpeakerRegistrationLink: true,
    })

  if (conferenceError || !conference) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch conference',
    })
  }

  const { proposals, proposalsError } = await getProposals({
    conferenceId: conference._id,
    statuses: [Status.confirmed],
  })

  if (proposalsError || !proposals) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch confirmed proposals',
    })
  }

  return { conference, proposals }
}

/** One proposal through the shared issuance path. */
async function issueSpeakerTickets(
  conference: TicketSweepConference,
  proposal: ProposalExisting,
  options: SpeakerTicketIssuanceOptions,
): Promise<SpeakerTicketIssuanceResult> {
  return handleSpeakerTicket(
    {
      eventType: 'proposal.status.changed',
      timestamp: new Date(),
      previousStatus: Status.accepted,
      newStatus: Status.confirmed,
      action: Action.confirm,
      proposal,
      speakers: (proposal.speakers ?? []) as Speaker[],
      conference,
      metadata: {
        triggeredBy: { speakerId: 'admin', isOrganizer: true },
        domain: 'admin',
      },
    },
    options,
  )
}

/**
 * The whole confirmed programme through the issuance path, summed.
 *
 * `dryRun` is the ONLY difference between the preview and the send, so the
 * preview's numbers are produced by the sending code.
 *
 * ONE PERSON, ONE INVITATION, ACROSS THE WHOLE SWEEP. The handler de-duplicates
 * by email WITHIN a proposal, and its delivery marker is written on the proposal
 * it ran for — so a speaker with two confirmed talks used to be invited twice,
 * once per talk, and would be counted twice here. The sweep therefore carries
 * its own set of addresses already handled and hands each proposal only the
 * speakers nobody has covered yet.
 */
async function runTicketSweep(
  conference: TicketSweepConference,
  proposals: ProposalExisting[],
  options: SpeakerTicketIssuanceOptions,
): Promise<SpeakerTicketIssuanceResult> {
  const totals: SpeakerTicketIssuanceResult = {
    sent: 0,
    failed: 0,
    alreadyInvited: 0,
    blocked: false,
  }
  const handledEmails = new Set<string>()

  // NO INVITE LINK, NO RUN — AND NO PROVIDER CALL, NOT EVEN A READ.
  //
  // The handler refuses per proposal for the same reason, but the refusal has
  // to be made here too: the redeemed-ticket read below contacts the provider
  // before the first proposal is ever handed over. Refusing after it would
  // still spare the invitations, but the rule is that a run that cannot produce
  // a usable email does not touch ticketing at all.
  if (!hasUsableRegistrationLink(conference)) {
    return { ...totals, blocked: true, blockedReason: 'no-registration-link' }
  }

  // Speakers who already HOLD a speaker-category ticket. A marker proves an
  // invitation was sent; this proves it was claimed — and the two can disagree,
  // because a ticket issued by hand in the provider leaves no marker here. The
  // status column already reads that speaker as "Claimed" and offers no action,
  // so the sweep must not quietly mail them an invitation for a ticket they
  // have. `null` (provider unreadable) skips nobody, exactly as before.
  const redeemed = await fetchRedeemedSpeakerEmails(conference)

  for (const proposal of proposals) {
    const speakerIds: string[] = []
    for (const speaker of (proposal.speakers ?? []) as Speaker[]) {
      if (!speaker?._id) continue
      // A speaker with no email is passed through: the handler owns that
      // refusal, and swallowing it here would put the decision in two places.
      // `normalizeEmail`, the same function the handler dedupes with — a
      // different normalization here would let one person through twice.
      const key = normalizeEmail(speaker.email)
      if (key && handledEmails.has(key)) continue
      // EVERY address the speaker is known by, matching the join the status
      // column uses (`tickets.speakerTicketStatus`): someone who claimed under
      // a verified address that is not their display one reads as "Claimed"
      // there, and must be skipped here too rather than swept.
      const claimed =
        redeemed &&
        [speaker.email, ...(speaker.knownEmails ?? [])].some((address) => {
          const normalized = normalizeEmail(address)
          return normalized !== '' && redeemed.has(normalized)
        })
      if (claimed) {
        if (key) handledEmails.add(key)
        totals.alreadyInvited++
        continue
      }
      if (key) handledEmails.add(key)
      speakerIds.push(speaker._id)
    }
    if (speakerIds.length === 0) continue

    // Markers from the OTHER confirmed talks. A marker lives on the one
    // proposal issuance ran for, so a speaker on two talks reached through the
    // talk that does NOT carry it would otherwise read as never invited and be
    // mailed again — while the status column, which already unions markers
    // across talks, says "Invited".
    const knownMarkers = proposals
      .filter((other) => other._id !== proposal._id)
      .flatMap((other) => other.issuedSpeakerTickets ?? [])

    let result: SpeakerTicketIssuanceResult
    try {
      result = await issueSpeakerTickets(conference, proposal, {
        ...options,
        speakerIds,
        knownMarkers,
      })
    } catch (error) {
      // Invitations already sent are real and must be reported. Swallowing the
      // count here would leave an organizer with an error and no idea whether
      // to run the sweep again.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Ticket issuance failed part-way: ${ticketResultMessage(totals)} Then the run stopped.`,
        cause: error,
      })
    }

    totals.sent += result.sent
    totals.failed += result.failed
    totals.alreadyInvited += result.alreadyInvited
    totals.blocked ||= result.blocked
    totals.blockedReason ??= result.blockedReason
  }
  return totals
}

/** Same rule the handler uses: anything not an absolute https URL is no link. */
function hasUsableRegistrationLink(conference: TicketSweepConference): boolean {
  const link = conference.speakerRegistrationLink?.trim()
  return !!link && isAbsoluteHttpsUrl(link)
}

/**
 * Says what happened, in the order an organizer cares about.
 *
 * `blocked` is part of the headline, not a footnote: if the ticket-type memo
 * lapses mid-sweep and the re-fetch fails, the remaining proposals are never
 * attempted, and "10 invitations sent." alone would read as a complete run over
 * a programme of 36.
 */
function ticketResultMessage(totals: SpeakerTicketIssuanceResult): string {
  const parts = [
    `${totals.sent} ${totals.sent === 1 ? 'invitation' : 'invitations'} sent`,
  ]
  if (totals.failed > 0) parts.push(`${totals.failed} failed`)
  if (totals.alreadyInvited > 0) {
    parts.push(`${totals.alreadyInvited} skipped as already handled`)
  }
  const summary = `${parts.join(', ')}.`
  // The reason an organizer can act on comes first, and says what to do rather
  // than only that something was refused.
  if (totals.blockedReason === 'no-registration-link') {
    return `${summary} ${NO_REGISTRATION_LINK_MESSAGE}`
  }
  return totals.blocked
    ? `${summary} Ticketing could not be reached for part of the programme, so some speakers were never attempted — check the ticketing configuration and run this again.`
    : summary
}

export const speakerRouter = router({
  // Get current user&apos;s speaker profile
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const { speaker, err } = await getSpeaker(ctx.speaker._id)

    if (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch speaker profile',
        cause: err,
      })
    }

    if (!speaker) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Speaker profile not found',
      })
    }

    return speaker
  }),

  // Update own speaker profile
  update: protectedProcedure
    .input(SpeakerInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { speaker, err } = await updateSpeaker(ctx.speaker._id, input)

        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update speaker profile',
            cause: err,
          })
        }

        if (!speaker) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Speaker not found',
          })
        }

        return speaker
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update speaker profile',
          cause: error,
        })
      }
    }),

  /**
   * NARROW autosave for the message-emails default (V2a). The profile page's
   * "Message emails" toggle calls this on change so the setting sticks WITHOUT
   * pressing "Update Profile" — and without persisting any half-edited fields
   * still sitting in the profile form's local state (which a full `update` would
   * sweep up). Writes exactly one boolean on the caller's own speaker doc.
   */
  setMessagingEmailDefault: protectedProcedure
    .input(z.object({ messagingEmailDefault: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const { speaker, err } = await updateSpeaker(ctx.speaker._id, {
        messagingEmailDefault: input.messagingEmailDefault,
      })
      if (err || !speaker) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update message-email preference',
          cause: err ?? undefined,
        })
      }
      return { messagingEmailDefault: input.messagingEmailDefault }
    }),

  // Get OAuth provider emails
  getEmails: protectedProcedure.query(async ({ ctx }) => {
    // Session is guaranteed by protectedProcedure, but account may not exist
    const session = ctx.session!

    if (!session.account) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'No OAuth account found',
      })
    }

    // Single source of truth for the caller's verified emails; the same helper
    // authorizes `updateEmail` so the picker and the guard can never diverge.
    return getVerifiedProfileEmails(session)
  }),

  // Generate a CLI authentication token
  generateCliToken: protectedProcedure.mutation(async ({ ctx }) => {
    const secret = process.env.AUTH_SECRET
    if (!secret) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Server configuration error',
      })
    }

    const session = ctx.session!

    const token = await encode({
      token: {
        sub: session.user.sub,
        name: session.user.name,
        email: session.user.email,
        picture: session.user.picture,
        speaker: session.speaker,
        account: session.account,
      },
      secret,
      maxAge: CLI_TOKEN_MAX_AGE,
      salt: JWT_SALT,
    })

    const expiresAt = new Date(
      Date.now() + CLI_TOKEN_MAX_AGE * 1000,
    ).toISOString()

    return { token, expiresAt }
  }),

  // Update speaker email
  updateEmail: protectedProcedure
    .input(EmailUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // SECURITY (C1): the display `email` is a login match key in
        // getOrCreateSpeaker, so the caller must PROVE they own the new address.
        // Only accept emails in the caller's provider-verified set — recomputed
        // server-side from the session, never trusting a client-supplied list.
        const owns = await isEmailVerifiedForSession(ctx.session!, input.email)
        if (!owns) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You can only set an email address that is verified by your login provider.',
          })
        }

        const { error } = await updateProfileEmail(input.email, ctx.speaker._id)

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update email',
            cause: error,
          })
        }

        // Echo back the value that was actually STORED (#684), not the raw
        // casing, so the UI never renders an address that differs from the doc.
        return { success: true, email: canonicalEmail(input.email) }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update email',
          cause: error,
        })
      }
    }),

  // Admin operations
  admin: router({
    /**
     * The org's speaker REGISTRY, and the only source the co-speaker picker
     * reads.
     *
     * It used to be `getSpeakers(conference, [submitted, accepted, confirmed])`,
     * which left out anyone whose proposals were all REJECTED or still drafts —
     * i.e. the most ordinary co-speaker there is, someone who submitted a talk
     * of their own and was turned down. The duplicate probe then refused the
     * "create profile" fallback with "add that existing profile as a speaker
     * instead", advice nobody could follow. Picker and probe now stand on the
     * same predicate (`SPEAKER_ORG_FILTER`), so if the probe says a profile
     * exists in this org, the picker can find it.
     *
     * FAILS CLOSED: an unresolvable org returns an empty list, never the whole
     * dataset. `getOrgSpeakerDirectory` refuses a null org id outright.
     */
    list: adminProcedure.query(async () => {
      try {
        const orgId = await getOrganizationRefForCurrentConference()
        if (!orgId) return []

        const { speakers, err } = await getOrgSpeakerDirectory(orgId)

        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch speakers',
            cause: err,
          })
        }

        return speakers
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch speakers',
          cause: error,
        })
      }
    }),

    search: adminProcedure
      .input(SpeakerSearchSchema)
      .query(async ({ input }) => {
        try {
          const { conference, error } = await getConferenceForCurrentDomain()
          if (error || !conference) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to get current conference',
              cause: error,
            })
          }

          // Scope the search corpus to the current org (#615); null orgId falls
          // back to the prior conference-only scoping.
          const orgId = await getOrganizationRefForCurrentConference()
          const { speakers, err } = await getSpeakers(
            conference._id,
            [Status.confirmed, Status.accepted],
            true,
            orgId,
          )
          if (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to get speakers',
              cause: err,
            })
          }

          const { speakers: organizers, err: organizersErr } =
            await getOrganizers(orgId)
          if (organizersErr) {
            console.warn('Could not get organizers:', organizersErr)
          }

          const allSpeakersMap = new Map<
            string,
            Speaker & { proposals?: ProposalExisting[] }
          >()
          speakers.forEach((s) => allSpeakersMap.set(s._id, s))
          organizers?.forEach((o) => {
            if (!allSpeakersMap.has(o._id)) {
              allSpeakersMap.set(o._id, { ...o, proposals: [] })
            }
          })
          const allSpeakers = Array.from(allSpeakersMap.values())

          const { speakers: featuredSpeakers, error: featuredError } =
            await getFeaturedSpeakers(conference._id)
          if (featuredError) {
            console.warn(
              'Could not get featured speakers for exclusion:',
              featuredError,
            )
          }

          const featuredSpeakerIds =
            featuredSpeakers?.map((speaker) => speaker._id) || []

          const filteredSpeakers = allSpeakers.filter((speaker) => {
            if (
              !input.includeFeatured &&
              featuredSpeakerIds.includes(speaker._id)
            ) {
              return false
            }

            if (!input.query || input.query.trim() === '') {
              return true
            }

            const searchTerm = input.query.toLowerCase()
            const nameMatch = speaker.name?.toLowerCase().includes(searchTerm)
            const titleMatch = speaker.title?.toLowerCase().includes(searchTerm)
            const bioMatch = speaker.bio?.toLowerCase().includes(searchTerm)
            return nameMatch || titleMatch || bioMatch
          })

          const sortedSpeakers = filteredSpeakers.sort((a, b) => {
            if (a.isOrganizer && !b.isOrganizer) return -1
            if (!a.isOrganizer && b.isOrganizer) return 1

            const aHasCurrentConference =
              a.proposals?.some(
                (p) =>
                  typeof p.conference === 'object' &&
                  p.conference &&
                  '_id' in p.conference &&
                  p.conference._id === conference._id,
              ) ?? false
            const bHasCurrentConference =
              b.proposals?.some(
                (p) =>
                  typeof p.conference === 'object' &&
                  p.conference &&
                  '_id' in p.conference &&
                  p.conference._id === conference._id,
              ) ?? false

            if (aHasCurrentConference && !bHasCurrentConference) return -1
            if (!aHasCurrentConference && bHasCurrentConference) return 1

            return a.name.localeCompare(b.name)
          })

          return sortedSpeakers
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to search speakers',
            cause: error,
          })
        }
      }),

    getById: adminProcedure.input(IdParamSchema).query(async ({ input }) => {
      // OWNERSHIP (#863). `adminProcedure` proves only that the caller organizes
      // SOME org, and `input.id` is client input, so without this an organizer of
      // tenant A could read any person in the dataset. The guard runs BEFORE the
      // fetch, so a foreign speaker's document never enters the request — and it
      // refuses a foreign id with the same NOT_FOUND as a nonexistent one, so
      // there is no existence oracle either. Its siblings `update` and `delete`
      // were already guarded this way; this read was not.
      const orgId = await requireSpeakerInCurrentOrg(input.id)

      // The narrowed projection (#863), NOT the self read `getSpeaker`, which
      // spreads the whole document — see `SpeakerAdminDetail`. It carries the
      // org predicate too, using the id the guard just proved: two independent
      // controls, and the read cannot be reached with an unresolved tenant.
      const { speaker, err } = await getSpeakerAdminDetail(input.id, orgId)

      if (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch speaker',
          cause: err,
        })
      }

      if (!speaker) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Speaker not found',
        })
      }

      return speaker
    }),

    // Create speaker
    create: adminProcedure
      .input(SpeakerCreateSchema)
      .mutation(async ({ input }) => {
        try {
          // Seed the current conference's organization as the new person's first
          // membership (CaaS T1-1: speaker = global person, org-scoped
          // membership). FAIL CLOSED (#730): a speaker created with NO
          // membership is on no org's admin surface and the ownership guard on
          // update/delete would refuse them — refuse the create instead.
          //
          // The placeholder shape (no `knownEmails`, no `providers`) lives in
          // `buildOrganizerCreatedSpeaker`, shared with
          // `proposal.addCoSpeakerProfile` so the two cannot drift.
          const speaker = await clientWrite.create(
            await buildOrganizerCreatedSpeaker(
              input,
              await requireCurrentOrgId(),
            ),
          )

          // Fetch the created speaker to get the proper format
          const { speaker: createdSpeaker, err } = await getSpeaker(speaker._id)

          if (err || !createdSpeaker) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch created speaker',
              cause: err,
            })
          }

          return createdSpeaker
        } catch (error) {
          if (error instanceof TRPCError) throw error
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create speaker',
            cause: error,
          })
        }
      }),

    // Update speaker
    update: adminProcedure
      .input(IdParamSchema.extend({ data: SpeakerUpdateSchema }))
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): `input.id` is client input and `updateSpeaker`
          // patches it directly, so without this an organizer of tenant A could
          // rewrite tenant B's speaker — or any other document type, since
          // `patch.set` does not check `_type`.
          await requireSpeakerInCurrentOrg(input.id)
          // Only update if there's data to update
          if (Object.keys(input.data).length === 0) {
            const { speaker, err } = await getSpeaker(input.id)
            if (err || !speaker) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Speaker not found',
              })
            }
            return speaker
          }

          const { speaker, err } = await updateSpeaker(input.id, input.data)

          if (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update speaker',
              cause: err,
            })
          }

          if (!speaker) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Speaker not found',
            })
          }

          return speaker
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update speaker',
            cause: error,
          })
        }
      }),

    // Delete speaker
    delete: adminProcedure.input(IdParamSchema).mutation(async ({ input }) => {
      try {
        // OWNERSHIP (#730): `input.id` is client input; unguarded this deleted
        // ANY document in the shared dataset. `requireExclusive` additionally
        // refuses a speaker who belongs to another tenant too — this org has
        // standing to manage them, but not to delete the person out from under
        // the other one.
        await requireSpeakerInCurrentOrg(input.id, { requireExclusive: true })
        await clientWrite.delete(input.id)
        return { success: true }
      } catch (error) {
        // Preserve the fail-closed refusal instead of masking it as a 500.
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete speaker',
          cause: error,
        })
      }
    }),

    /**
     * FIND duplicate speaker documents in THIS organization (#267).
     *
     * The merge tool has always been able to fold two documents together; until
     * now nothing told an organizer WHICH two. Read-only: it runs the shared
     * detector over the org's speakers and stamps each candidate with the merge
     * eligibility the merge guard would compute, so a cross-tenant pair is shown
     * as unmergeable instead of offering a button that throws.
     *
     * `requireCurrentOrgId` (not the best-effort `getOrganizationRefForCurrentConference`
     * the sibling list endpoints use): with no org this would be a cross-tenant
     * listing of every person's email and login providers, so it refuses.
     */
    duplicateCandidates: adminProcedure.query(
      async (): Promise<DuplicateCandidatesReport> => {
        const orgId = await requireCurrentOrgId()

        const { records, err } =
          await getDuplicateSpeakerCandidateRecords(orgId)
        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to scan speakers for duplicates',
            cause: err,
          })
        }

        const groups = findDuplicateSpeakerCandidates(records)

        // One probe for every flagged document — a bounded set, never the whole
        // corpus (the reference-graph arm is the expensive one).
        const flaggedIds = Array.from(
          new Set(groups.flatMap((group) => group.members.map((m) => m._id))),
        )
        const blocks = await speakerExclusivityBlocks(flaggedIds, orgId)

        return {
          scannedCount: records.length,
          // The picker's candidate source: EVERY speaker in the org, sorted by
          // name, with no talk-status filter. See `mergeCandidates` on the
          // report type for why that filter made the merge tool unable to merge
          // the very case it exists for.
          mergeCandidates: records
            .map((record) => ({
              _id: record._id,
              name: record.name || 'Unnamed speaker',
              email: record.email ?? null,
              providers: (record.providers ?? []).filter(
                (entry): entry is string => Boolean(entry),
              ),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          groups: groups.map((group) => ({
            ...group,
            members: group.members.map((member) => ({
              ...member,
              // `has`, not `??`: `null` is the AFFIRMATIVE "may be merged"
              // verdict, and `??` would silently downgrade it to 'unknown'.
              mergeBlockedReason: blocks.has(member._id)
                ? blocks.get(member._id)!
                : 'unknown',
            })),
          })),
        }
      },
    ),

    // Preview a duplicate-speaker merge (identity Phase 3). Read-only: computes
    // exactly what the mutation would repoint/change WITHOUT writing anything so
    // the organizer can review before confirming this destructive operation.
    mergePreview: adminProcedure
      .input(SpeakerMergeSchema)
      .query(async ({ input, ctx }) => {
        // OWNERSHIP (#730): both ids are client input. Guard the PREVIEW with
        // exactly the terms the mutation uses, so the UI can never show a
        // preview of a merge that would be refused (or of foreign documents).
        // Both sides need EXCLUSIVE standing — see the mutation below.
        await requireSpeakerInCurrentOrg(input.survivorId, {
          requireExclusive: true,
        })
        await requireSpeakerInCurrentOrg(input.loserId, {
          requireExclusive: true,
        })
        const { preview, err } = await mergeSpeakers({
          survivorId: input.survivorId,
          loserId: input.loserId,
          actor: { _id: ctx.speaker._id, name: ctx.speaker.name },
          dryRun: true,
          // Side-only overrides (see `SpeakerMergeFieldSelectionsSchema`): the
          // preview resolves them against the two documents it reads, so the
          // operator sees exactly what the mutation with the same selections
          // would write.
          fieldSelections: input.fieldSelections,
        })

        if (err) {
          throw new TRPCError({
            code:
              err instanceof MergeValidationError
                ? 'BAD_REQUEST'
                : 'INTERNAL_SERVER_ERROR',
            message: err.message || 'Failed to preview speaker merge',
            cause: err,
          })
        }

        return preview!
      }),

    // Merge a duplicate ("loser") speaker into the canonical ("survivor") one.
    // Repoints every inbound reference, unions identity fields, then deletes the
    // loser — all in one atomic Sanity transaction.
    merge: adminProcedure
      .input(SpeakerMergeSchema)
      .mutation(async ({ input, ctx }) => {
        // OWNERSHIP (#730, #742): both ids are client input and the merge
        // repoints references then DELETES the loser. BOTH sides need EXCLUSIVE
        // standing, exactly as `delete` and `updateEmail` do:
        //
        //  - the LOSER is deleted, and deleting a person another tenant also
        //    owns is a cross-tenant destructive write;
        //  - the SURVIVOR has its display `email` rewritten, and that field is a
        //    LOGIN MATCH KEY (`findSpeakersByEmails` in `@/lib/speaker/sanity`).
        //    Ordinary standing accrues to any tenant a person merely signed into,
        //    so it would read as "may administer" == "may become": create a
        //    throwaway speaker holding an attacker-controlled address (exclusive
        //    to this org, so it passes trivially), merge it into an organizer of
        //    another tenant who once spoke here, take the loser's email, then
        //    sign in with that address and have `linkProviderToSpeaker` attach
        //    your provider to their document. The guard is UNCONDITIONAL, not
        //    keyed on `fieldSelections.email`: the recommendation can resolve to
        //    the loser with no operator action at all (`has-linked-account`).
        await requireSpeakerInCurrentOrg(input.survivorId, {
          requireExclusive: true,
        })
        await requireSpeakerInCurrentOrg(input.loserId, {
          requireExclusive: true,
        })
        // The merge writes a recovery snapshot of the deleted speaker into the
        // SURVIVOR's own `mergedWith[]`. No tenant attribution is needed for it:
        // the speaker document is already org-scoped, already erased by the
        // GDPR sweep, and already carries the merge's retention.
        const { preview, committed, err } = await mergeSpeakers({
          survivorId: input.survivorId,
          loserId: input.loserId,
          actor: { _id: ctx.speaker._id, name: ctx.speaker.name },
          dryRun: false,
          // Per-field choices. Zod has already rejected any unknown field name,
          // and each value is a SIDE, never content — `mergeSpeakers` re-reads
          // both speaker documents and takes the field from the named one.
          fieldSelections: input.fieldSelections,
        })

        if (err) {
          throw new TRPCError({
            code:
              err instanceof MergeValidationError
                ? 'BAD_REQUEST'
                : 'INTERNAL_SERVER_ERROR',
            message: err.message || 'Failed to merge speakers',
            cause: err,
          })
        }

        return { success: committed, preview: preview! }
      }),

    // Update speaker email
    updateEmail: adminProcedure
      .input(
        IdParamSchema.extend({
          email: z.string().email('Valid email is required'),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#742): `input.id` is client input and
          // `updateProfileEmail` patches it directly — but the ORDINARY
          // standing that guards the rest of this router is NOT enough here,
          // because this endpoint writes a LOGIN MATCH KEY.
          //
          // The display `email` is one of the two keys `findSpeakersByEmails`
          // resolves a sign-in against (`src/lib/speaker/sanity.ts`), and this
          // endpoint deliberately does not make the organizer prove they own
          // the address. So "may administer" would otherwise mean "may become":
          // point a speaker's display email at an address you control, sign in
          // with it (OAuth or the email link), and the login path links your
          // provider account into their document.
          //
          // Ordinary standing is membership OR participation — and BOTH accrue
          // to any tenant the person merely signs into or submits to
          // (`ensureSpeakerOrgMembership` stamps the current org on every
          // login). That made this a CROSS-TENANT escalation: an organizer of A
          // could take over the account of anyone who had ever touched A,
          // including an organizer of B, inheriting their `organizerOrgIds`.
          //
          // `requireExclusive` is therefore the right standing, exactly as for
          // `delete` and `merge`: this org may rewrite the identity of a person
          // who is theirs ALONE, never of one another tenant also holds. Its
          // reference-graph arm is stricter than a single-field patch strictly
          // needs, but it errs closed with an actionable message and keeps this
          // guard identical to its destructive siblings.
          //
          // Post-C1, `updateProfileEmail` no longer writes `knownEmails`, so an
          // admin edit still cannot inject an address into the VERIFIED
          // match-set. Whether the display `email` should be a match key at all
          // is tracked separately — see #807.
          await requireSpeakerInCurrentOrg(input.id, { requireExclusive: true })
          const { error } = await updateProfileEmail(input.email, input.id)

          if (error) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update email',
              cause: error,
            })
          }

          // Echo back the value that was actually STORED (#684), not the raw
          // casing, so the UI never renders an address that differs from the doc.
          return { success: true, email: canonicalEmail(input.email) }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update email',
            cause: error,
          })
        }
      }),

    /**
     * The ticket addresses an organizer has granted on one speaker, with their
     * provenance. Read straight from the document, so the modal shows what the
     * match-set actually contains rather than what the last call returned.
     */
    ticketEmails: adminProcedure
      .input(IdParamSchema)
      .query(async ({ input }) => {
        await requireSpeakerInCurrentOrg(input.id)
        const state = await getSpeakerTicketGrantState(input.id)
        return { grants: state?.grants ?? [] }
      }),

    /**
     * GRANT A TICKET ADDRESS AS AN IDENTITY.
     *
     * A speaker who bought their ticket under an address we do not hold reads
     * "Not claimed" forever. This adds that address to `knownEmails`, which is
     * the whole fix: the existing join finds the ticket, workshop eligibility
     * matches, and the person can also SIGN IN with it.
     *
     * THAT LAST PART IS THE WHOLE RISK, so read the four controls before
     * changing anything here.
     *
     * 1. THE ADDRESS MUST BE ATTESTED BY A TICKET FOR THIS EVENT. The organizer
     *    does not supply an address; they pick one out of the provider's own
     *    ticket list, and the server re-resolves it against that list before
     *    writing. So this cannot mint an identity for an arbitrary address an
     *    organizer happens to control — only for one that somebody registered a
     *    ticket under, where the attestation is that the ticket was delivered
     *    there. `registeredEmail` and `ticketId` come off the provider record,
     *    never off the request.
     * 2. NFKC. `normalizeEmail` folds compatibility codepoints and is the MATCH
     *    key; `canonicalEmail` does not fold and is the recipient form. An
     *    address whose two forms differ is REFUSED, exactly as email sign-in
     *    refuses it (`@/lib/auth/email-link/request`), because otherwise the
     *    address we store as an identity is not the mailbox the ticket went to.
     * 3. A CROSS-SPEAKER COLLISION IS REFUSED, GLOBALLY. If any speaker
     *    document already carries the address as its display `email` or in its
     *    `knownEmails`, granting it here would merge two people's sign-in
     *    identities — worse than the unclaimed ticket this exists to fix.
     *    `findSpeakerByEmailForOrganizerCreate` is the probe, and it discloses
     *    one bit plus a name only for a person this organizer can already see.
     * 4. THE GRANT IS RECORDED. `ticketEmailGrants` keeps who added it, when,
     *    and off which ticket, so a wrong grant can be traced and revoked.
     *
     * STANDING: `requireExclusive`, the same as `updateEmail` and for the same
     * reason (`@/server/tenancy`) — this writes a LOGIN MATCH KEY, and ordinary
     * standing accrues to any tenant a person has ever signed into. It is the
     * stricter choice and it does narrow the feature: a speaker who also
     * belongs to another organization cannot be linked this way.
     */
    addTicketEmail: adminProcedure
      .input(IdParamSchema.extend({ email: z.string().trim().min(3) }))
      .mutation(async ({ input, ctx }) => {
        await requireSpeakerInCurrentOrg(input.id, { requireExclusive: true })

        const email = normalizeEmail(input.email)
        // (2) The stored identity must be the mailbox the ticket reached.
        if (!email || email !== canonicalEmail(input.email)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'That address cannot be used as a sign-in identity: its normalized form differs from the address itself.',
          })
        }

        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference?._id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Conference not found',
          })
        }

        // (1) Re-resolved against the provider's list — the same 30s-memoized
        // read the search used, so this costs no extra round-trip. FAILS
        // CLOSED: an unreadable ticket list attests nothing.
        const candidates = await fetchEventTicketCandidates(conference)
        const ticket = candidates?.find(
          (candidate) => candidate.email === email,
        )
        if (!ticket) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'No ticket for this event was registered with that address, so it cannot be linked.',
          })
        }

        const state = await getSpeakerTicketGrantState(input.id)
        if (!state) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Speaker not found',
          })
        }
        // Already theirs — by the match-set OR by the display address, which
        // `findSpeakersByEmails` resolves a sign-in against too. Idempotent,
        // and it keeps the global probe below from reporting the speaker as a
        // collision with themselves.
        if (
          state.knownEmails.includes(email) ||
          normalizeEmail(state.email) === email
        ) {
          return { grants: state.grants }
        }

        // (3) GLOBAL, because identity is global — a document at another tenant
        // is exactly the one this must not collide with. Throws on a failed
        // read rather than returning "no match", so the write cannot proceed on
        // an unproven probe.
        const existing = await findSpeakerByEmailForOrganizerCreate(
          email,
          await requireCurrentOrgId(),
        )
        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: existing.name
              ? `${existing.name} already signs in with ${email}. Linking it here would merge two people's accounts.`
              : `Another account already signs in with ${email}. Linking it here would merge two people's accounts.`,
          })
        }

        // (4) The identity and its provenance are written TOGETHER, in one
        // patch: a grant with no match-set entry grants nothing, and a
        // match-set entry with no grant is the untraceable case this design
        // exists to avoid.
        const grant = {
          _key: generateKey('ticket-grant'),
          email,
          registeredEmail: ticket.registeredEmail,
          ticketId: ticket.ticketId,
          addedBy: ctx.speaker?._id,
          addedByName: ctx.speaker?.name,
          addedAt: new Date().toISOString(),
        }
        // APPEND, NOT SET. The probe above and this write are separate
        // round-trips, so writing back the arrays THIS request read would let
        // two organizers working at once silently drop each other's grant — and
        // a dropped grant is an address left in `knownEmails` with no trail, the
        // one state this design exists to prevent. Appending touches only the
        // two entries it adds.
        await clientWrite
          .patch(input.id)
          .setIfMissing({ knownEmails: [], ticketEmailGrants: [] })
          .append('knownEmails', [email])
          .append('ticketEmailGrants', [grant])
          .commit()
        return { grants: [...state.grants, grant] }
      }),

    /**
     * REVOKE a granted ticket address: out of `ticketEmailGrants` AND out of
     * `knownEmails`, so signing in with it stops working.
     *
     * ONLY A GRANTED ADDRESS CAN BE REMOVED. Without that check this endpoint
     * would be a way to strip a LOGIN-VERIFIED address out of somebody's
     * match-set — locking a person out of their own account through an endpoint
     * whose stated job is undoing an organizer's own mistake.
     *
     * ORDINARY STANDING, unlike the grant. Exclusivity is the right bar for
     * HANDING OUT an identity; requiring it to take one back would mean a grant
     * became permanent the moment the speaker signed into a second tenant —
     * revocation must never be the harder half. This only ever removes an
     * address THIS feature added, so a wider caller set cannot use it to reach
     * anything a login proved.
     */
    removeTicketEmail: adminProcedure
      .input(IdParamSchema.extend({ email: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await requireSpeakerInCurrentOrg(input.id)
        const email = normalizeEmail(input.email)
        const state = await getSpeakerTicketGrantState(input.id)
        if (!state) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Speaker not found',
          })
        }
        if (
          !state.grants.some((grant) => normalizeEmail(grant.email) === email)
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'That address was not granted from a ticket, so it cannot be removed here.',
          })
        }
        // THE DISPLAY ADDRESS IS A LOGIN KEY TOO (`findSpeakersByEmails` matches
        // `email` as well as `knownEmails`). If the granted address has since
        // become the display one, dropping it from the match-set would report a
        // revocation that did not happen. Refuse and say which field is left,
        // rather than silently half-revoking.
        if (normalizeEmail(state.email) === email) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'This address is now the speaker’s display email, which also signs them in. Change the display email first, then remove the link.',
          })
        }

        // UNSET BY PREDICATE, not a rewritten array: the read above and this
        // write are separate round-trips, so replacing both arrays wholesale
        // would let one organizer's removal restore an address another had just
        // revoked. These selectors touch only the matching entries.
        //
        // The address goes into the selector as a literal, so it is restricted
        // to characters that cannot terminate the string or the bracket. Every
        // address this feature stores passes the NFKC check and comes off a
        // provider ticket, so the fallback is for pathological provider data
        // rather than for anything an organizer can type: it rewrites the
        // arrays instead, which is correct but can lose a concurrent edit.
        const patch = clientWrite.patch(input.id)
        await (
          /^[a-z0-9!#$%&'*+/=?^_`{|}~.@-]+$/.test(email)
            ? patch.unset([
                `knownEmails[@ == "${email}"]`,
                `ticketEmailGrants[email == "${email}"]`,
              ])
            : patch.set({
                knownEmails: state.knownEmails.filter((held) => held !== email),
                ticketEmailGrants: state.grants.filter(
                  (grant) => normalizeEmail(grant.email) !== email,
                ),
              })
        ).commit()
        return {
          grants: state.grants.filter(
            (grant) => normalizeEmail(grant.email) !== email,
          ),
        }
      }),

    sendEmail: adminProcedure
      .input(
        z.object({
          proposalId: z.string().min(1),
          speakerIds: z.array(z.string()).min(1),
          subject: z.string().min(1),
          message: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const senderName = ctx.speaker.name || 'Conference Organizer'

        const result = await sendMultiSpeakerEmail({
          ...input,
          senderName,
        })

        if (result.error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: result.error.error,
          })
        }

        return result.data!
      }),

    broadcastEmail: adminProcedure
      .input(
        z.object({
          subject: z.string().min(1),
          message: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const { conference, error: conferenceError } =
          await getConferenceForCurrentDomain()

        if (conferenceError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }

        let messagePortableText: PortableTextBlock[]
        try {
          const parsed = JSON.parse(input.message)
          if (!isValidPortableText(parsed)) {
            throw new Error('Invalid PortableText format')
          }
          messagePortableText = parsed
        } catch {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid message format. Expected PortableText JSON.',
          })
        }

        const response = await sendBroadcastEmail({
          conference,
          subject: input.subject,
          messagePortableText,
          audienceType: 'speakers',
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: errorData.error || 'Failed to send broadcast email',
          })
        }

        return await response.json()
      }),

    syncAudience: adminProcedure.mutation(async () => {
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (conferenceError || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }

      const conferenceId = await resolveConferenceId()
      const { speakers, err } = await getSpeakers(conferenceId)

      if (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch speakers',
        })
      }

      const eligibleSpeakers = speakers.filter(
        (speaker: Speaker & { proposals: ProposalExisting[] }) =>
          speaker.email &&
          speaker.proposals?.some(
            (proposal: ProposalExisting) => proposal.status === 'confirmed',
          ),
      )

      const { syncedCount, error } = await syncConferenceAudience(
        conference,
        eligibleSpeakers,
      )

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to sync audience',
        })
      }

      const { audienceId } = await getOrCreateConferenceAudience(conference)

      return {
        success: true,
        audienceId,
        syncedCount,
        message: `Successfully synced ${syncedCount} speakers with the conference audience`,
      }
    }),

    /**
     * What the bulk sweep WOULD do, without doing it.
     *
     * A dry run of the same sweep rather than a separate counting query: the
     * numbers an organizer confirms are produced by the code that sends, so
     * they cannot drift from it. A second implementation counting markers by
     * hand would be free to disagree with the handler's dedupe, its provider
     * guards and its per-run email de-duplication — and a preview that can
     * disagree with the send is worse than no preview.
     */
    ticketInvitationPreview: adminProcedure.query(async () => {
      const { conference, proposals } = await ticketSweepContext()
      const totals = await runTicketSweep(conference, proposals, {
        dryRun: true,
      })

      return {
        conferenceTitle: conference.title,
        /** Speakers who would be emailed now. */
        toSend: totals.sent,
        /**
         * Speakers the sweep will skip: they already carry an invitation
         * marker, or they already hold a speaker ticket.
         */
        alreadyInvited: totals.alreadyInvited,
        sweptProposals: proposals.length,
        /**
         * Issuance cannot run at all — no ticketing binding, no credentials, no
         * invitation-gated speaker ticket type, or the provider could not be
         * read. `toSend: 0` alone would say "nobody is waiting", which during an
         * outage is the one answer that must never be given.
         */
        blocked: totals.blocked,
        /**
         * Which of those it is, when the organizer can fix it themselves.
         * Carried rather than inferred from `hasRegistrationLink`, so the modal
         * names the actual cause instead of guessing at it.
         */
        blockedReason: totals.blockedReason,
        /**
         * Whether the conference has a usable speaker registration link. Same
         * validation the handler applies. Without one the sweep refuses
         * outright — an email with no call to action, pointing at a provider
         * invitation, is what produced the incident this guard exists for. The
         * link itself never leaves the server.
         */
        hasRegistrationLink: hasUsableRegistrationLink(conference),
      }
    }),

    /**
     * Whether the row action can be offered at all, without asking the ticket
     * provider anything.
     *
     * Separate from `ticketInvitationPreview` on purpose: the preview dry-runs
     * the sweep and reads the provider, so it only runs while the confirmation
     * modal is open. The speaker table needs the same answer on mount, for
     * every row, and this is the cheap half of it.
     */
    ticketInvitationConfig: adminProcedure.query(async () => {
      const { conference, error } = await getConferenceForCurrentDomain({
        includeSpeakerRegistrationLink: true,
      })
      // A FAILED READ IS NOT "NO LINK". The read returns a normalized empty
      // conference alongside its error, which would answer `false` and tell
      // every row the organizer has not configured a link. Refuse instead: the
      // client leaves the rows as they are when this query has no answer.
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }
      return { hasRegistrationLink: hasUsableRegistrationLink(conference) }
    }),

    sendTicketInvitations: adminProcedure.mutation(async () => {
      const { conference, proposals } = await ticketSweepContext()
      const totals = await runTicketSweep(conference, proposals, {})

      return {
        // A run that could not reach ticketing for part of the programme is not
        // a success, however many invitations went out before that.
        success: !totals.blocked,
        ...totals,
        sweptProposals: proposals.length,
        message: ticketResultMessage(totals),
      }
    }),

    /**
     * One speaker, from the row action on `/admin/speakers`. Same issuance
     * path as the sweep — `handleSpeakerTicket` — restricted to this speaker
     * and allowed to re-send over an existing marker, which is the whole point
     * of "Send again" on an invited-but-unclaimed row.
     */
    sendTicketInvitation: adminProcedure
      .input(z.object({ speakerId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        // `speakerId` is client input, so ownership is settled BEFORE anything
        // is read — the house guard, same as every other admin mutation here.
        // The proposal lookup below is conference-scoped and would refuse a
        // foreign speaker anyway; this makes the refusal uniform and keeps the
        // decision out of the data path.
        await requireSpeakerInCurrentOrg(input.speakerId)

        const { conference, proposals } = await ticketSweepContext()

        // One invitation per person, not per talk: a speaker with two confirmed
        // talks is invited once, through the first of them.
        const proposal = proposals.find((p) =>
          (p.speakers ?? []).some(
            (speaker) =>
              typeof speaker === 'object' &&
              '_id' in speaker &&
              speaker._id === input.speakerId,
          ),
        )

        if (!proposal) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No confirmed talk for this speaker at this conference',
          })
        }

        const totals = await issueSpeakerTickets(conference, proposal, {
          speakerIds: [input.speakerId],
          resend: true,
          // Markers from the speaker's other confirmed talks. Without them a
          // duplicate speaker document whose address was invited under another
          // id on another talk reads as "Not invited" — the very row this
          // action exists for — and the same person is mailed twice.
          knownMarkers: proposals
            .filter((other) => other._id !== proposal._id)
            .flatMap((other) => other.issuedSpeakerTickets ?? []),
        })

        if (totals.sent === 0) {
          throw new TRPCError({
            code: totals.blocked ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
            message:
              totals.blockedReason === 'no-registration-link'
                ? // The cause the organizer can act on, named. Nothing was sent
                  // and no provider invitation was created.
                  NO_REGISTRATION_LINK_MESSAGE
                : totals.blocked
                  ? 'Ticket invitations cannot be issued for this conference. Check the ticketing configuration and that an invitation-only speaker ticket type exists.'
                  : totals.failed > 0
                    ? // NOT "nothing was sent": the provider invitation may already
                      // have gone out and only our heads-up email failed. No marker
                      // was recorded, so a retry re-sends both — say so rather than
                      // let an organizer think the speaker heard nothing.
                      'Issuance did not complete. The provider may already have emailed the speaker, but our heads-up email failed and nothing was recorded; sending again will re-send both.'
                    : 'No invitation was sent. Check that the speaker has an email address.',
          })
        }

        return { success: true, ...totals, message: 'Invitation sent.' }
      }),
  }),
})
