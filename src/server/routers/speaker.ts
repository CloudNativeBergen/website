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
  updateSpeaker,
  getOrganizers,
  getSpeakers,
  getDuplicateSpeakerCandidateRecords,
} from '@/lib/speaker/sanity'
import {
  findDuplicateSpeakerCandidates,
  type DuplicateCandidatesReport,
} from '@/lib/speaker/duplicates'
import { clientWrite } from '@/lib/sanity/client'
import {
  getOrganizationRefForCurrentConference,
  organizationReference,
} from '@/lib/organization/sanity'
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
import { generateUniqueSlug } from '@/lib/speaker/sanity'
import { canonicalEmail } from '@/lib/speaker/email'
import {
  requireCurrentOrgId,
  requireSpeakerInCurrentOrg,
  speakerExclusivityBlocks,
} from '@/server/tenancy'

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
    list: adminProcedure.query(async () => {
      try {
        const conferenceId = await resolveConferenceId()
        // Scope the admin list to the current org (#615). Best-effort: a null
        // orgId (unresolvable tenant / pre-backfill legacy conference) leaves the
        // list unscoped rather than empty.
        const orgId = await getOrganizationRefForCurrentConference()
        const { speakers, err } = await getSpeakers(
          conferenceId,
          [Status.submitted, Status.accepted, Status.confirmed],
          true,
          orgId,
        )

        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch speakers',
            cause: err,
          })
        }

        return speakers.map((speaker) => ({
          _id: speaker._id,
          name: speaker.name || '',
          title: speaker.title || '',
          email: speaker.email || '',
          image: speaker.image || null,
          slug: speaker.slug || null,
        }))
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
      const { speaker, err } = await getSpeaker(input.id)

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
          const slug = await generateUniqueSlug(input.name)

          // Seed the current conference's organization as the new person's first
          // membership (CaaS T1-1: speaker = global person, org-scoped
          // membership). FAIL CLOSED (#730): a speaker created with NO
          // membership is on no org's admin surface and the ownership guard on
          // update/delete would refuse them — refuse the create instead.
          const orgRef = organizationReference(await requireCurrentOrgId())!

          const speaker = await clientWrite.create({
            _type: 'speaker',
            name: input.name,
            // The display `email` is a login match key (`getOrCreateSpeaker`),
            // so an admin-created placeholder must be stored in the same
            // canonical form the login path writes (#684) — otherwise the
            // person it was created for signs in and gets a second, duplicate
            // speaker document. `canonicalEmail` (not `normalizeEmail`): this
            // field is also a real recipient address.
            email: canonicalEmail(input.email),
            slug: { _type: 'slug', current: slug },
            title: input.title,
            bio: input.bio,
            company: input.company,
            links: input.links || [],
            flags: input.flags || [],
            consent: input.consent,
            ...(input.image && {
              image: {
                _type: 'image',
                asset: {
                  _type: 'reference',
                  _ref: input.image,
                },
              },
            }),
            organizations: [{ ...orgRef, _key: orgRef._ref }],
          })

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
        await requireSpeakerInCurrentOrg(input.survivorId)
        await requireSpeakerInCurrentOrg(input.loserId, {
          requireExclusive: true,
        })
        const { preview, err } = await mergeSpeakers({
          survivorId: input.survivorId,
          loserId: input.loserId,
          actor: { _id: ctx.speaker._id, name: ctx.speaker.name },
          dryRun: true,
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
        // OWNERSHIP (#730): both ids are client input and the merge repoints
        // references then DELETES the loser. The loser must additionally be
        // exclusive to this org — deleting a person another tenant also owns is
        // a cross-tenant destructive write.
        await requireSpeakerInCurrentOrg(input.survivorId)
        await requireSpeakerInCurrentOrg(input.loserId, {
          requireExclusive: true,
        })
        const { preview, committed, err } = await mergeSpeakers({
          survivorId: input.survivorId,
          loserId: input.loserId,
          actor: { _id: ctx.speaker._id, name: ctx.speaker.name },
          dryRun: false,
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
  }),
})
