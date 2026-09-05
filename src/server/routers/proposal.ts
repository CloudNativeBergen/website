import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { v4 as uuidv4 } from 'uuid'
import {
  router,
  protectedProcedure,
  organizerProcedure,
  adminProcedure,
  resolveConferenceId,
  resolveOrganizationId,
} from '@/server/trpc'
import {
  requireDocumentInCurrentOrg,
  requireDocumentsInCurrentOrg,
  requireSpeakersInCurrentOrg,
} from '@/server/tenancy'
import type { InvitationStatus } from '@/lib/cospeaker/types'
import {
  ProposalInputSchema,
  ProposalAdminCreateSchema,
  ProposalUpdateSchema,
  ProposalAdminUpdateSchema,
  CreateProposalSchema,
  InvitationCreateSchema,
  InvitationResponseSchema,
  InvitationCancelSchema,
  RemoveCoSpeakerSchema,
  IdParamSchema,
  ProposalActionSchema,
  requireWithdrawalReason,
  AudienceFeedbackSchema,
  SubmitReviewSchema,
  ProposalFilterSchema,
} from '@/server/schemas/proposal'
import { AttachmentSchema } from '@/server/schemas/attachment'
import {
  getProposal,
  getProposals,
  createProposal,
  updateProposal,
  deleteProposal,
  ProposalDeletionBlockedError,
} from '@/lib/proposal/data/sanity'
import { Attachment } from '@/lib/attachment/types'
import {
  createCoSpeakerInvitation,
  sendInvitationEmail,
  sendResponseNotificationEmail,
} from '@/lib/cospeaker/server'
import { getInvitationByToken } from '@/lib/cospeaker/sanity'
import {
  getCoSpeakerLimit,
  isInvitationExpired,
} from '@/lib/cospeaker/constants'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  assertMayBecomeSubmitted,
  topicIdsOf,
} from '@/server/proposalSubmission'
import { clientWrite } from '@/lib/sanity/client'
import { createReference, createReferenceWithKey } from '@/lib/sanity/helpers'
import {
  createNotifications,
  deleteMessageNotificationsFor,
} from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import type { NotificationInput } from '@/lib/notification/types'
import type { ProposalInput, ProposalExisting } from '@/lib/proposal/types'
import { Action, Status, isInactiveProposal } from '@/lib/proposal/types'
import { actionStateMachine } from '@/lib/proposal'
import {
  countActiveProposals,
  extractSpeakerIds,
  extractSpeakersFromProposal,
} from '@/lib/proposal/utils'
import { filterProposals } from '@/lib/proposal/utils/filtering'
import { Speaker } from '@/lib/speaker/types'
import { normalizeEmail, canonicalEmail } from '@/lib/speaker/email'
import { eventBus } from '@/lib/events/bus'
import { ProposalStatusChangeEvent } from '@/lib/events/types'
import {
  updateProposalStatus,
  getProposalSanity,
  fetchNextUnreviewedProposal,
  searchProposals,
} from '@/lib/proposal/server'
import { createReview, updateReview } from '@/lib/review/sanity'
import { getFeaturedTalks } from '@/lib/featured/sanity'
import {
  ensureProposalConversation,
  addMessage,
  syncProposalConversationParticipants,
} from '@/lib/messaging/sanity'
import '@/lib/events/registry'

/**
 * The organizer-initiated decision actions whose `comment` is relayed to the
 * speaker (mirrors the email notification handler's action gate). Their comment
 * is ALSO posted into the proposal's message thread (messaging M4).
 */
const COMMENT_RELAY_ACTIONS: readonly Action[] = [
  Action.accept,
  Action.reject,
  Action.waitlist,
  Action.remind,
]

/**
 * REFERENCE INJECTION, `talk.topics[]` (#730/#731).
 *
 * `topics` is `z.array(ReferenceSchema)` — the CLIENT supplies `_ref` verbatim
 * and `updateProposal`/`createProposal` write it straight through a bare
 * `.patch().set()`. Sanity only checks that a strong reference RESOLVES, not its
 * type or its tenant, so without this any authenticated speaker (not merely an
 * organizer) could attach another tenant's `topic` to a talk and render that
 * tenant's taxonomy — title and brand colour — on this conference's public
 * programme. This is the same class the PR fixed one level up at
 * `conference.updateTopics`; the caller population here is strictly wider.
 *
 * GRANDFATHERING, exactly as `conference.updateTopics` does it: only ids that
 * are NEW to this talk are checked. An id already on the document was already
 * referenced, so re-sending it injects nothing — and a legacy org-less topic
 * (pre-migration-044) stays editable instead of making every save of an old
 * talk refuse. Removing such an id is always allowed; re-adding it is not.
 */
async function requireTopicsReferenceable(
  incoming: unknown,
  alreadyOnTalk: string[],
): Promise<void> {
  if (!Array.isArray(incoming)) return
  const existing = new Set(alreadyOnTalk)
  // Blank/malformed entries are NOT dropped: `topicIdsOf` returning fewer ids
  // than `incoming` has entries means something unparseable is about to be
  // written into a reference array, which is never legitimate input.
  const ids = topicIdsOf(incoming)
  if (ids.length !== incoming.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid topic reference',
    })
  }
  const added = ids.filter((id) => !existing.has(id))
  if (added.length === 0) return
  await requireDocumentsInCurrentOrg(added, 'topic')
}

/** The topic ids currently on a talk, for the grandfathering set above. */
async function talkTopicIds(talkId: string): Promise<string[]> {
  const refs = await clientWrite.fetch<(string | null)[] | null>(
    // groq-global: keyed by an id the caller has ALREADY been proved to own by
    // `requireDocumentInCurrentOrg`; it reads back that same document.
    `*[_type == "talk" && _id == $id][0].topics[]._ref`,
    { id: talkId },
  )
  return (refs ?? []).filter(
    (ref): ref is string => typeof ref === 'string' && ref.length > 0,
  )
}

/**
 * Helper function to delete an attachment and its associated file asset.
 * Exported ONLY for its tenancy refusal test — both procedures that use it
 * guard first, so the query-level refusal is unreachable through the router.
 */
export async function deleteAttachmentHelper(
  proposalId: string,
  attachmentKey: string,
  /**
   * The identity the read runs AS (S1, #863 pattern): the requester owns the
   * proposal or organizes the org of its conference. Both callers ALSO guard
   * before calling (admin path: `requireDocumentInCurrentOrg`; speaker path:
   * the owner-scoped `getProposal` read) — this predicate makes the helper safe
   * regardless of caller discipline, and a foreign id reads as nonexistent so
   * nothing is patched for it.
   */
  requester: { speakerId: string; orgIds: string[] },
) {
  // Get current proposal using GROQ query directly
  const proposal = await clientWrite.fetch<{
    _id: string
    attachments?: Array<{
      _key: string
      _type: 'fileAttachment' | 'urlAttachment'
      attachmentType?: string
      file?: { asset?: { _ref: string } }
    }>
  }>(
    // groq-global-scoped: owner ∨ organizer-org — `$speakerId in
    // speakers[]._ref || conference->organization._ref in $orgIds` (the #863 /
    // S7 shape); the owner arm is an identity field this rule's vocabulary
    // does not recognise.
    `*[_type == "talk" && _id == $id && ($speakerId in speakers[]._ref || conference->organization._ref in $orgIds)][0]{ _id, attachments }`,
    {
      id: proposalId,
      speakerId: requester.speakerId,
      orgIds: requester.orgIds,
    },
  )

  if (!proposal) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Proposal not found',
    })
  }

  // Find the attachment to delete
  const attachmentToDelete = proposal.attachments?.find(
    (a) => a._key === attachmentKey,
  )

  if (!attachmentToDelete) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Attachment not found',
    })
  }

  // Remove attachment from proposal first (must remove reference before deleting asset)
  const updatedAttachments =
    (proposal.attachments?.filter(
      (a) => a._key !== attachmentKey,
    ) as Attachment[]) || []

  const { proposal: updated, err } = await updateProposal(proposalId, {
    attachments: updatedAttachments,
  })

  if (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to delete attachment',
      cause: err,
    })
  }

  if (!updated) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Proposal not found',
    })
  }

  // Now delete the asset from Sanity (after reference is removed)
  if (
    attachmentToDelete._type === 'fileAttachment' &&
    attachmentToDelete.file?.asset?._ref
  ) {
    try {
      await clientWrite.delete(attachmentToDelete.file.asset._ref)
    } catch (deleteError) {
      console.error('Failed to delete file asset:', deleteError)
      // Don't fail the operation if asset deletion fails - reference is already removed
    }
  }

  return { proposal: updated, attachmentToDelete }
}

export const proposalRouter = router({
  // List current user&apos;s proposals
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      // ORG-SCOPE (S1, E4): the speaker's CFP list on a tenant domain shows
      // that org's editions (cross-conference within the org is intended;
      // cross-ORG is a leak). FAIL CLOSED: an unresolvable org lists nothing
      // rather than every tenant's proposals.
      const orgId = await resolveOrganizationId()
      if (!orgId) return []

      const { proposals, proposalsError } = await getProposals({
        speakerId: ctx.speaker._id,
        orgId,
        returnAll: false,
      })

      if (proposalsError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch proposals',
          cause: proposalsError,
        })
      }

      return proposals || []
    } catch (error) {
      if (error instanceof TRPCError) throw error

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch proposals',
        cause: error,
      })
    }
  }),

  // Get proposal by ID
  getById: organizerProcedure
    .input(IdParamSchema)
    .query(async ({ input, ctx }) => {
      try {
        const isOrganizer = ctx.isOrgOrganizer
        const { proposal, proposalError } = await getProposal({
          id: input.id,
          speakerId: ctx.speaker._id,
          isOrganizer,
          organizerOrgId: ctx.orgId,
          includeReviews: isOrganizer,
        })

        if (proposalError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch proposal',
            cause: proposalError,
          })
        }

        if (!proposal || !proposal._id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found',
          })
        }

        // Verify ownership if not organizer
        if (!isOrganizer) {
          const speakers = proposal.speakers || []
          const isSpeaker = speakers.some((s) => {
            if (typeof s === 'object' && '_id' in s) {
              return s._id === ctx.speaker._id
            }
            return false
          })

          if (!isSpeaker) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to view this proposal',
            })
          }
        }

        return proposal
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch proposal',
          cause: error,
        })
      }
    }),

  // Create proposal (as draft or submitted)
  create: protectedProcedure
    .input(CreateProposalSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const { conference, error: confError } =
          await getConferenceForCurrentDomain()

        if (confError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
          })
        }

        // ONE OF TWO ROUTES TO `submitted`, and every condition it must satisfy
        // — the CFP window, the submittable-formats gate and strict content
        // validation — lives in `assertMayBecomeSubmitted` so the other route
        // (`proposal.action`, below) cannot drift from it again. A new
        // submission rule belongs in the predicate, not here.
        //
        // Scoped to SUBMISSION: creating a DRAFT stays permitted with the CFP
        // closed and with no formats announced. A draft is explicitly the
        // incomplete-work path (it skips strict validation for the same
        // reason), and an API/CLI caller must be able to prepare one before the
        // window opens or before the organizers announce their formats.
        //
        // `contentSource: 'payload'` is what makes an unreadable topic entry a
        // refusal here rather than a silent drop — the caller sent it, so they
        // get told. `requireTopicsReferenceable` below refuses the same shape;
        // this fires first and with the same message.
        if (input.status !== Status.draft) {
          assertMayBecomeSubmitted({
            conference,
            content: input.data,
            contentSource: 'payload',
          })
        }

        const { proposals: existingProposals } = await getProposals({
          speakerId: ctx.speaker._id,
          conferenceId: conference._id,
          returnAll: false,
        })

        const proposalCount = countActiveProposals(existingProposals)

        if (proposalCount >= 3) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You have reached the maximum of 3 proposals per conference. Please unsubmit or withdraw an existing proposal from your proposals list if you need to submit a new one.',
          })
        }

        const initialStatus =
          input.status === Status.draft ? Status.draft : Status.submitted

        // REFERENCE INJECTION (#731): see `requireTopicsReferenceable`. Nothing
        // exists yet, so there is no grandfathered set — every topic must be
        // this org's.
        await requireTopicsReferenceable(input.data.topics, [])

        const { proposal, err } = await createProposal(
          {
            ...input.data,
            speakers: [createReference(ctx.speaker._id)],
          } as ProposalInput,
          ctx.speaker._id,
          conference._id,
          initialStatus,
        )

        if (err || !proposal) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create proposal',
            cause: err,
          })
        }

        // Notify organizers of a genuinely NEW submission (not a saved draft).
        // INTENTIONAL ASYMMETRY: this create path does not publish a
        // `proposal.status.changed` bus event, so the `persistNotification`
        // bus handler never fires here — we fan out directly instead. We do
        // NOT publish a bus event on purpose: that would also trigger the
        // Slack/email handlers and change existing create behaviour (out of
        // scope for the notification hub).
        if (initialStatus === Status.submitted) {
          // The whole notify block shares createNotifications' never-fail
          // contract: the proposal is already created at this point, so a
          // failure here (e.g. the organizer-id fetch) must not surface as a
          // create error to the submitting speaker.
          try {
            // TEAMS-2: proposal events route to the `cfp` team (all organizers
            // when it is not configured — the shared fallback contract).
            const organizerIds = await resolveRoutedOrganizerIds({
              conferenceId: conference._id,
              teamKey: 'cfp',
            })
            await createNotifications(
              organizerIds
                .filter((id) => id && id !== ctx.speaker._id)
                .map((id): NotificationInput => ({
                  recipientId: id,
                  conferenceId: conference._id,
                  notificationType: 'proposal_submitted',
                  title: `New proposal: "${proposal.title}"`,
                  actorId: ctx.speaker._id,
                  relatedProposalId: proposal._id,
                  link: `/admin/proposals/${proposal._id}`,
                })),
            )
          } catch (notifyError) {
            console.error(
              'Failed to notify organizers of new proposal:',
              notifyError,
            )
          }
        }

        return proposal
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create proposal',
          cause: error,
        })
      }
    }),

  // Update proposal
  update: organizerProcedure
    .input(IdParamSchema.extend({ data: ProposalUpdateSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { proposal: existing, proposalError } = await getProposal({
          id: input.id,
          speakerId: ctx.speaker._id,
          isOrganizer: false,
        })

        if (proposalError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch proposal',
            cause: proposalError,
          })
        }

        if (!existing || !existing._id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message:
              'Proposal not found or you do not have permission to edit it',
          })
        }

        if (!ctx.isOrgOrganizer && existing.conference) {
          const conferenceId =
            typeof existing.conference === 'object' &&
            '_id' in existing.conference
              ? existing.conference._id
              : typeof existing.conference === 'string'
                ? existing.conference
                : null

          if (conferenceId) {
            const { conference } = await getConferenceForCurrentDomain({})
            if (conference && conference._id === conferenceId) {
              const { isConferenceOver, isCfpOpen } =
                await import('@/lib/conference/state')
              if (isConferenceOver(conference)) {
                throw new TRPCError({
                  code: 'FORBIDDEN',
                  message:
                    'Cannot edit proposal after conference has ended. Contact organizers if you need to make changes.',
                })
              }
              if (!isCfpOpen(conference)) {
                throw new TRPCError({
                  code: 'FORBIDDEN',
                  message:
                    'The Call for Papers has closed and proposals can no longer be edited. If you need to make changes, please contact the organizers and we&apos;ll be happy to help.',
                })
              }
            }
          }
        }

        if (Object.keys(input.data).length === 0) {
          return existing
        }

        // Enforce strict validation for non-draft proposals. The existing
        // proposal has dereferenced speaker objects (not references) and
        // the update payload never contains speakers, so exclude them from
        // the merged document before validating.
        if (existing.status !== Status.draft) {
          const merged = { ...existing, ...input.data, speakers: undefined }
          const strict = ProposalInputSchema.safeParse(merged)
          if (!strict.success) {
            const fieldErrors = strict.error.issues.map((i) => i.message)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Please fix the following: ${fieldErrors.join('. ')}`,
            })
          }
        }

        // REFERENCE INJECTION (#731): `getProposal` above proved the TALK is the
        // caller's; it says nothing about the topic ids being written INTO it.
        // `existing.topics` is the dereferenced current set — the grandfathered
        // ids that may be re-sent unchecked.
        await requireTopicsReferenceable(
          input.data.topics,
          topicIdsOf(existing.topics),
        )

        const { proposal, err } = await updateProposal(input.id, input.data)

        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update proposal',
            cause: err,
          })
        }

        if (!proposal) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found',
          })
        }

        return proposal
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update proposal',
          cause: error,
        })
      }
    }),

  // Remove a co-speaker from a proposal. Speakers on the proposal can
  // remove other speakers (not themselves); organizers can remove anyone.
  removeCoSpeaker: organizerProcedure
    .input(RemoveCoSpeakerSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const isOrganizer = ctx.isOrgOrganizer

        // getProposal scopes the query to the caller's speaker id unless
        // they are an organizer, so this doubles as the ownership check
        const { proposal, proposalError } = await getProposal({
          id: input.proposalId,
          speakerId: ctx.speaker._id,
          isOrganizer,
          organizerOrgId: ctx.orgId,
        })

        if (proposalError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch proposal',
            cause: proposalError,
          })
        }

        if (!proposal || !proposal._id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message:
              'Proposal not found or you do not have permission to manage its speakers',
          })
        }

        // The owner arm of the read also admits the caller's OWN foreign-tenant
        // proposal; organizer privileges below (remove anyone, remove the
        // primary speaker) apply only when the proposal is in the REQUEST org.
        const isOrganizerForProposal =
          isOrganizer && !!ctx.orgId && proposal._organizationId === ctx.orgId

        if (!isOrganizerForProposal && input.speakerId === ctx.speaker._id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You cannot remove yourself from a proposal. Ask a co-speaker to remove you, or contact the organizers.',
          })
        }

        const speakerIds = extractSpeakerIds(proposal.speakers)

        if (!speakerIds.includes(input.speakerId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This person is not currently a speaker on this proposal.',
          })
        }

        // speakers[0] is the proposal's primary speaker (its author).
        // Only organizers may remove them.
        if (!isOrganizerForProposal && input.speakerId === speakerIds[0]) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'The primary speaker cannot be removed from the proposal. Contact the organizers if this is needed.',
          })
        }

        if (speakerIds.length <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Cannot remove the only speaker on this proposal. A proposal must always have at least one speaker.',
          })
        }

        // Find accepted invitations tied to this speaker so they can be
        // canceled together with the removal (otherwise the invitation
        // list would keep showing a stale "accepted" entry)
        const invitationIds = await clientWrite.fetch<string[]>(
          // groq-global-scoped: keyed by the proposal id the owner-∨-organizer
          // scoped `getProposal` read above just proved access to.
          `*[_type == "coSpeakerInvitation"
            && proposal._ref == $proposalId
            && status == "accepted"
            && acceptedSpeaker._ref == $speakerId]._id`,
          { proposalId: input.proposalId, speakerId: input.speakerId },
        )

        // Remove the speaker reference and cancel their accepted
        // invitation(s) in a single atomic transaction
        const transaction = clientWrite.transaction()

        transaction.patch(input.proposalId, (patch) =>
          patch.unset([`speakers[_ref=="${input.speakerId}"]`]),
        )

        for (const invitationId of invitationIds || []) {
          transaction.patch(invitationId, (patch) =>
            patch.set({ status: 'canceled' as InvitationStatus }),
          )
        }

        await transaction.commit()

        // The removed speaker loses access to the proposal's message thread;
        // delete their collapsed message notifications so they don't linger as
        // permanent phantom unread (the bell counts them, but their deep link
        // now 403/404s and they can never open the thread to clear it).
        // Never-fail: cleanup must not fail the (committed) removal.
        await deleteMessageNotificationsFor({
          proposalIds: [input.proposalId],
          speakerId: input.speakerId,
        })

        // SNAPSHOT SYNC (G2a): the read path now prefers the conversation's
        // participants[], so re-derive it from the proposal's REMAINING speakers
        // — otherwise the removed co-speaker would linger as a thread member (and
        // a stale snapshot could keep granting them access). Never-fail / no-op
        // when the proposal has no thread yet.
        await syncProposalConversationParticipants(
          input.proposalId,
          speakerIds.filter((id) => id !== input.speakerId),
        )

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to remove co-speaker',
          cause: error,
        })
      }
    }),

  // Execute proposal action (submit, withdraw, etc.)
  action: organizerProcedure
    .input(
      IdParamSchema.extend(ProposalActionSchema.shape).superRefine(
        requireWithdrawalReason,
      ),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, action, notify, comment, reason } = input

        // Get conference context
        const {
          conference,
          domain,
          error: confError,
        } = await getConferenceForCurrentDomain({})

        if (confError || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get current conference',
            cause: confError,
          })
        }

        // Get proposal and verify access
        const { proposal, proposalError } = await getProposalSanity({
          id,
          speakerId: ctx.speaker._id,
          isOrganizer: ctx.isOrgOrganizer,
          organizerOrgId: ctx.orgId,
        })

        if (proposalError || !proposal || proposal._id !== id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found or you do not have permission',
          })
        }

        // WHICH ARM ADMITTED US? The owner-∨-organizer read also matches the
        // caller's OWN proposal at a FOREIGN tenant (owner arm), and being an
        // organizer of the request org says nothing about that document. Grant
        // organizer transitions (accept/reject/confirm/…) only when the
        // proposal actually belongs to the REQUEST org; otherwise the caller
        // acts as the owner they are (withdraw etc. stay available).
        const isOrganizerForProposal =
          ctx.isOrgOrganizer &&
          !!ctx.orgId &&
          proposal._organizationId === ctx.orgId

        // Validate action using state machine
        const { status, isValidAction } = actionStateMachine(
          proposal.status,
          action,
          isOrganizerForProposal,
        )

        if (!isValidAction) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid action ${action} for status ${proposal.status}`,
          })
        }

        // Block unsubmit after CFP closes — speakers should withdraw instead
        if (action === Action.unsubmit && !isOrganizerForProposal) {
          const { isCfpOpen } = await import('@/lib/conference/state')
          if (!isCfpOpen(conference)) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'The Call for Papers has closed. You can no longer move proposals back to draft. Use withdraw instead if you want to remove your proposal.',
            })
          }
        }

        // Block speaker self-withdrawal within the pre-conference cutoff window.
        // Organizers keep the ability to act on behalf of speakers this close
        // to the event; only self-service withdrawal is closed (#251).
        if (action === Action.withdraw && !isOrganizerForProposal) {
          const { isWithdrawalCutoffActive } =
            await import('@/lib/conference/state')
          if (isWithdrawalCutoffActive(conference)) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'Withdrawals are closed within 14 days of the event — please contact the organizers.',
            })
          }
        }

        // THE OTHER ROUTE TO `submitted`. `proposal.create` is not the only way
        // a proposal reaches that status — this action performs the
        // draft → submitted transition, and it is the path `ProposalForm` uses
        // for an existing draft. Both routes now ask the SAME predicate, which
        // is the point: three separate audits found three separate conditions
        // that `create` enforced and this route did not (#824, #833, #837),
        // because each was written twice.
        //
        // The content being promoted is already stored, so the DOCUMENT is what
        // the predicate parses — in READ shape, which it folds back itself.
        // `contentSource: 'stored'` is what tells it these topics are
        // pre-existing data (a `topics[]->` projection yields `null` for a
        // since-deleted topic), so an unreadable entry is logged and tolerated
        // rather than stranding the speaker; at least one READABLE topic is
        // still required. Applies to organizers too, deliberately: an
        // invalid or out-of-window
        // submission is wrong whoever promotes it. (The 3-proposal cap below is
        // the opposite call — a per-speaker fairness rule organizers override.)
        if (proposal.status === Status.draft && status === Status.submitted) {
          assertMayBecomeSubmitted({
            conference,
            content: proposal,
            contentSource: 'stored',
          })
        }

        // Enforce cap when submitting a draft (draft → submitted transition)
        if (
          proposal.status === Status.draft &&
          status === Status.submitted &&
          !isOrganizerForProposal
        ) {
          const { proposals: existingProposals } = await getProposals({
            speakerId: ctx.speaker._id,
            conferenceId: conference._id,
            returnAll: false,
          })

          if (countActiveProposals(existingProposals) >= 3) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'You have reached the maximum of 3 proposals per conference. Please unsubmit or withdraw an existing proposal from your proposals list if you need to submit a new one.',
            })
          }
        }

        // Handle deletion separately
        if (status === Status.deleted) {
          const { err: deleteError } = await deleteProposal(id)
          if (deleteError) {
            if (deleteError instanceof ProposalDeletionBlockedError) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: deleteError.message,
              })
            }
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to delete proposal',
              cause: deleteError,
            })
          }
          return { proposalStatus: Status.deleted }
        }

        // Update proposal status, persisting the withdrawal reason (#212) so it
        // stays visible to organizers on the proposal itself. For confirm we
        // gate the write on the exact revision we validated against, so two
        // near-simultaneous confirms (double-click / client retry) can't both
        // promote accepted→confirmed and fire the speaker-ticket handler twice
        // (duplicate coupon + email). The loser's patch fails the revision
        // check and never publishes.
        const { proposal: updatedProposal, err: updateErr } =
          await updateProposalStatus(
            id,
            status,
            action === Action.withdraw ? reason : undefined,
            action === Action.confirm ? proposal._rev : undefined,
          )

        if (updateErr) {
          // A failed ifRevisionID patch is a Sanity ClientError with
          // statusCode 409 — key on that (reliable) rather than the message
          // text, which isn't guaranteed to contain any specific token. Keep a
          // message match only as a defensive fallback.
          const conflictStatus =
            (updateErr as { statusCode?: number }).statusCode === 409
          const isConcurrentConflict =
            action === Action.confirm &&
            (conflictStatus ||
              /revision|conflict|mismatch|409/i.test(
                updateErr.message ?? String(updateErr),
              ))

          throw new TRPCError({
            code: isConcurrentConflict ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR',
            message: isConcurrentConflict
              ? 'This proposal was just updated. Refresh and try again.'
              : 'Failed to update proposal status',
            cause: updateErr,
          })
        }

        // Publish status change event for notifications
        const statusChangeEvent: ProposalStatusChangeEvent = {
          eventType: 'proposal.status.changed',
          timestamp: new Date(),
          proposal: updatedProposal,
          previousStatus: proposal.status,
          newStatus: status,
          action,
          conference,
          speakers: proposal.speakers as Speaker[],
          metadata: {
            triggeredBy: {
              speakerId: ctx.speaker._id,
              isOrganizer: isOrganizerForProposal,
            },
            shouldNotify: notify,
            comment,
            reason: action === Action.withdraw ? reason : undefined,
            domain,
          },
        }

        eventBus.publish(statusChangeEvent).catch((error) => {
          console.error('Failed to publish status change event:', error)
        })

        // Messaging M4/S2: an organizer decision comment also lands in the
        // proposal's message thread, so the speaker keeps it with the rest of
        // the conversation. We add the message (thread content + lastMessageAt
        // bump) but DELIBERATELY SKIP the message fan-out (notifyNewMessage) —
        // the DECISION STATUS RAIL is the single delivery for a decision: the
        // `proposal_status_changed` hub notification and the decision email
        // (published on `eventBus` above) ALREADY carry this same comment. Firing
        // notifyNewMessage too would double-notify the speaker (a second hub
        // item + a second email) for one organizer action. The message still
        // appears in the thread on next open; it just doesn't generate its own
        // notification. Guarded never-fail: the status change is already
        // committed, so a messaging failure must not fail the action.
        const trimmedComment = comment?.trim()
        if (
          isOrganizerForProposal &&
          trimmedComment &&
          COMMENT_RELAY_ACTIONS.includes(action)
        ) {
          try {
            const conversationId = await ensureProposalConversation({
              conferenceId: conference._id,
              proposalId: id,
              proposalTitle: proposal.title ?? 'Proposal',
              createdById: ctx.speaker._id,
              // Party model (G1): the proposal's current speakers seed the
              // dual-written participants[] (see ensureProposalConversation).
              proposalSpeakerIds: extractSpeakerIds(proposal.speakers),
            })
            await addMessage({
              conversationId,
              authorId: ctx.speaker._id,
              body: trimmedComment,
            })
          } catch (error) {
            console.error(
              'Failed to mirror decision comment into the proposal thread:',
              error,
            )
          }
        }

        return { proposalStatus: updatedProposal.status }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to execute proposal action',
          cause: error,
        })
      }
    }),

  // Admin operations
  admin: router({
    // List all proposals (admin)
    list: adminProcedure
      .input(ProposalFilterSchema)
      .query(async ({ input, ctx }) => {
        try {
          const conferenceId = await resolveConferenceId()

          const { proposals, proposalsError } = await getProposals({
            conferenceId,
            returnAll: true,
            includeReviews: true,
            includePreviousAcceptedTalks: true,
          })

          if (proposalsError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch proposals',
              cause: proposalsError,
            })
          }

          return filterProposals(proposals || [], input, ctx.speaker._id)
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch proposals',
            cause: error,
          })
        }
      }),

    // Get proposal by ID (admin)
    getById: adminProcedure
      .input(IdParamSchema)
      .query(async ({ input, ctx }) => {
        try {
          const { proposal, proposalError } = await getProposal({
            id: input.id,
            speakerId: ctx.speaker._id,
            isOrganizer: true,
            organizerOrgId: ctx.orgId,
            includeReviews: true,
            includeSubmittedTalks: true,
            includePreviousAcceptedTalks: true,
            // The messaging workspace's read-only proposal pane shows the
            // schedule slot. ADDITIVE — every existing consumer of this query
            // gains a field and reads none fewer.
            includeSchedule: true,
          })

          if (proposalError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to fetch proposal',
              cause: proposalError,
            })
          }

          // ADMIN SURFACE, ORG ARM ONLY: the owner arm of the read admits the
          // caller's OWN proposal at a FOREIGN tenant (dual-role organizer ∧
          // speaker), and this endpoint exists to serve organizer data. A
          // proposal outside the REQUEST org answers NOT_FOUND exactly like a
          // nonexistent id — the pre-S1 behavior.
          if (
            !proposal ||
            !proposal._id ||
            proposal._organizationId !== ctx.orgId
          ) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found',
            })
          }

          return proposal
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch proposal',
            cause: error,
          })
        }
      }),

    // Create proposal (admin)
    //
    // A THIRD way a document reaches `submitted` (`createProposal` defaults to
    // that status), and deliberately NOT behind `assertMayBecomeSubmitted`:
    // this is how organizers enter an invited or keynote talk on a speaker's
    // behalf, which has to work after the CFP window closes. Its content
    // condition is enforced at the boundary instead — `ProposalAdminCreateSchema`
    // is the STRICT schema, not the partial draft one. Keep it that way: if
    // this ever becomes reachable by a speaker, route it through the predicate.
    create: adminProcedure
      .input(ProposalAdminCreateSchema)
      .mutation(async ({ input }) => {
        try {
          const { speakers, ...proposalData } = input
          const conferenceId = await resolveConferenceId()

          // REFERENCE INJECTION (#730): `speakers[]` is raw client input and a
          // reference is just `{_ref: id}` — Sanity checks that it RESOLVES, not
          // that it is a speaker or ours. Writing a foreign id here also
          // manufactures the participation that `requireSpeakerInCurrentOrg`
          // treats as ownership, so this guard is what keeps that arm honest.
          await requireSpeakersInCurrentOrg(speakers)

          // REFERENCE INJECTION (#731): same for `topics[]`, which is also raw
          // client-supplied references. Nothing exists yet — no grandfathering.
          await requireTopicsReferenceable(proposalData.topics, [])

          // Convert speaker IDs to references
          const speakerRefs = speakers.map((id) => createReference(id))

          const { proposal, err } = await createProposal(
            {
              ...proposalData,
              speakers: speakerRefs,
            } as ProposalInput,
            speakers[0], // Use first speaker ID
            conferenceId,
          )

          if (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to create proposal',
              cause: err,
            })
          }

          if (!proposal) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Proposal was not created',
            })
          }

          return proposal
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create proposal',
            cause: error,
          })
        }
      }),

    // Update proposal (admin)
    update: adminProcedure
      .input(IdParamSchema.extend({ data: ProposalAdminUpdateSchema }))
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): `input.id` is client input and `updateProposal` is
          // a bare patch. The speaker-facing `proposal.update` above is gated by
          // the org-scoped `getProposal`; this admin sibling was not gated at
          // all, so it could rewrite any document in the shared dataset.
          await requireDocumentInCurrentOrg(input.id, 'talk')
          const { speakers, ...proposalData } = input.data

          // If speakers are being updated, convert to references
          let updateData = proposalData
          if (speakers && speakers.length > 0) {
            // REFERENCE INJECTION (#730): the guard above proves the TALK is
            // ours; it says nothing about the ids being written INTO it. Left
            // unchecked this attached any person in the shared dataset to an own
            // talk — which then satisfied the participation arm of
            // `requireSpeakerInCurrentOrg` and handed the caller write access to
            // that person's profile, email and GDPR consent, and the ability to
            // merge them away.
            await requireSpeakersInCurrentOrg(speakers)
            const speakerRefs = speakers.map((id) => createReference(id))
            updateData = {
              ...proposalData,
              speakers: speakerRefs,
            } as typeof proposalData
          }

          // REFERENCE INJECTION (#731): `topics[]` is client-supplied references
          // too. Read the talk's CURRENT topics as the grandfathered set so an
          // ordinary save of a legacy talk carrying an org-less topic still
          // works, while a newly added foreign id is refused.
          if (proposalData.topics !== undefined) {
            await requireTopicsReferenceable(
              proposalData.topics,
              await talkTopicIds(input.id),
            )
          }

          const { proposal, err } = await updateProposal(input.id, updateData)

          if (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update proposal',
              cause: err,
            })
          }

          if (!proposal) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found',
            })
          }

          // SNAPSHOT SYNC (G2a): an admin speaker swap also changes who is on the
          // proposal, so keep any existing thread's participants[] in step with
          // the new set — the read path prefers participants[], and G2a must not
          // introduce a new divergence for organizer-side speaker edits. Only
          // when speakers were part of this update. Never-fail / no-op without a
          // thread.
          if (speakers && speakers.length > 0) {
            await syncProposalConversationParticipants(input.id, speakers)
          }

          return proposal
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update proposal',
            cause: error,
          })
        }
      }),

    // Delete proposal (admin)
    delete: adminProcedure.input(IdParamSchema).mutation(async ({ input }) => {
      try {
        // OWNERSHIP (#730): unguarded, this deleted any proposal in the dataset.
        await requireDocumentInCurrentOrg(input.id, 'talk')
        const { err } = await deleteProposal(input.id)

        if (err) {
          if (err instanceof ProposalDeletionBlockedError) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: err.message,
            })
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete proposal',
            cause: err,
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete proposal',
          cause: error,
        })
      }
    }),

    updateAudienceFeedback: adminProcedure
      .input(
        IdParamSchema.extend({
          feedback: AudienceFeedbackSchema,
        }),
      )
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): the `_type` check below was already here, but the
          // TENANT was not checked — any tenant's talk could be given audience
          // feedback.
          await requireDocumentInCurrentOrg(input.id, 'talk')
          const existing = await clientWrite.getDocument(input.id)

          if (!existing || existing._type !== 'talk') {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found',
            })
          }

          const result = await clientWrite
            .patch(input.id)
            .set({
              audienceFeedback: {
                ...input.feedback,
                lastUpdatedAt: new Date().toISOString(),
              },
            })
            .commit()

          if (!result) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found',
            })
          }

          return result
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update audience feedback',
            cause: error,
          })
        }
      }),

    // Update attachments (admin)
    updateAttachments: adminProcedure
      .input(
        IdParamSchema.extend({
          attachments: z.array(AttachmentSchema),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          // OWNERSHIP (#730): `input.id` is client input, `updateProposal` a
          // bare patch.
          await requireDocumentInCurrentOrg(input.id, 'talk')
          const { proposal, err } = await updateProposal(input.id, {
            attachments: input.attachments,
          })

          if (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update attachments',
              cause: err,
            })
          }

          if (!proposal) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found',
            })
          }

          return proposal
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update attachments',
            cause: error,
          })
        }
      }),

    // Delete attachment (admin)
    deleteAttachment: adminProcedure
      .input(
        IdParamSchema.extend({
          attachmentKey: z.string(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        try {
          // OWNERSHIP (#730): the guard proves the talk belongs to the request
          // org BEFORE the helper runs; the helper's own owner-∨-organizer
          // predicate is the independent second control.
          const orgId = await requireDocumentInCurrentOrg(input.id, 'talk')
          const { proposal } = await deleteAttachmentHelper(
            input.id,
            input.attachmentKey,
            { speakerId: ctx.speaker._id, orgIds: [orgId] },
          )
          return proposal
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete attachment',
            cause: error,
          })
        }
      }),

    // Submit or update a review (admin)
    submitReview: adminProcedure
      .input(SubmitReviewSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const { proposal, proposalError } = await getProposal({
            id: input.id,
            speakerId: ctx.speaker._id,
            isOrganizer: true,
            organizerOrgId: ctx.orgId,
            includeReviews: true,
          })

          if (proposalError || !proposal || !proposal._id) {
            throw new TRPCError({
              code: proposalError ? 'INTERNAL_SERVER_ERROR' : 'NOT_FOUND',
              message: proposalError
                ? 'Failed to fetch proposal'
                : 'Proposal not found',
              cause: proposalError,
            })
          }

          // ORG ARM ONLY: the owner arm of the read admits the caller's OWN
          // proposal at a FOREIGN tenant, and this write would land a review in
          // THAT tenant's conference. Reviews may only be submitted on
          // proposals of the REQUEST org; anything else is NOT_FOUND exactly
          // like a nonexistent id — the pre-S1 behavior.
          if (proposal._organizationId !== ctx.orgId) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found',
            })
          }

          const existingReview = proposal.reviews?.find(
            (r) => 'email' in r.reviewer && r.reviewer._id === ctx.speaker._id,
          )

          const conferenceId =
            '_id' in proposal.conference
              ? proposal.conference._id
              : (proposal.conference as { _ref: string })._ref

          const reviewData = { comment: input.comment, score: input.score }

          const { review, reviewError } = existingReview
            ? await updateReview(
                existingReview._id,
                ctx.speaker._id,
                reviewData,
              )
            : await createReview(
                proposal._id,
                ctx.speaker._id,
                conferenceId,
                reviewData,
              )

          if (reviewError || !review) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to ${existingReview ? 'update' : 'create'} review`,
              cause: reviewError,
            })
          }

          return review
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to submit review',
            cause: error,
          })
        }
      }),

    nextUnreviewed: adminProcedure
      .input(
        z.object({
          currentProposalId: z.string().optional(),
        }),
      )
      .query(async ({ input, ctx }) => {
        const conferenceId = await resolveConferenceId()
        const reviewerId = ctx.speaker._id

        const { nextProposal, error } = await fetchNextUnreviewedProposal({
          conferenceId,
          reviewerId,
          currentProposalId: input.currentProposalId,
        })

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch next unreviewed proposal',
            cause: error,
          })
        }

        return { nextProposal }
      }),

    search: adminProcedure
      .input(
        z.object({
          query: z.string().min(1, 'Search query is required'),
        }),
      )
      .query(async ({ input }) => {
        const conferenceId = await resolveConferenceId()

        const { proposals, proposalsError } = await searchProposals({
          query: input.query,
          conferenceId,
          includeReviews: true,
          includePreviousAcceptedTalks: true,
        })

        if (proposalsError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to search proposals',
            cause: proposalsError,
          })
        }

        return proposals
      }),

    searchTalks: adminProcedure
      .input(
        z.object({
          query: z.string().min(1, 'Search query is required'),
          status: z
            .enum(['confirmed', 'accepted'])
            .optional()
            .default('confirmed'),
        }),
      )
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

          const { proposals, proposalsError } = await getProposals({
            conferenceId: conference._id,
            returnAll: true,
          })
          if (proposalsError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to get proposals',
              cause: proposalsError,
            })
          }

          const { talks: featuredTalks, error: featuredError } =
            await getFeaturedTalks(conference._id)
          if (featuredError) {
            console.warn(
              'Could not get featured talks for exclusion:',
              featuredError,
            )
          }

          const featuredTalkIds = featuredTalks?.map((talk) => talk._id) || []

          const filteredProposals = proposals.filter(
            (proposal: ProposalExisting) => {
              const targetStatus =
                input.status === 'confirmed'
                  ? Status.confirmed
                  : Status.accepted
              if (proposal.status !== targetStatus) {
                return false
              }

              if (featuredTalkIds.includes(proposal._id)) {
                return false
              }

              const searchTerm = input.query.toLowerCase()
              const titleMatch = proposal.title
                ?.toLowerCase()
                .includes(searchTerm)
              const descriptionMatch = proposal.description
                ?.toString()
                .toLowerCase()
                .includes(searchTerm)
              return titleMatch || descriptionMatch
            },
          )

          return filteredProposals
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to search talks',
            cause: error,
          })
        }
      }),
  }),

  // Speaker attachment operations
  uploadAttachment: organizerProcedure
    .input(
      IdParamSchema.extend({
        blobUrl: z.string().url(),
        filename: z.string(),
        attachmentType: z.enum(['slides', 'recording', 'resource']),
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { proposal, proposalError } = await getProposal({
          id: input.id,
          speakerId: ctx.speaker._id,
          isOrganizer: ctx.isOrgOrganizer,
          organizerOrgId: ctx.orgId,
        })

        if (proposalError || !proposal) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found or access denied',
          })
        }

        const { transferBlobToSanity } = await import('@/lib/attachment/blob')
        const { asset, error } = await transferBlobToSanity(
          input.blobUrl,
          input.filename,
        )

        if (error || !asset) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to transfer file to permanent storage',
            cause: error,
          })
        }

        // Check if this file is already attached (gracefully handle duplicates)
        const isDuplicate = proposal.attachments?.some(
          (a) =>
            a._type === 'fileAttachment' && a.file?.asset?._ref === asset._id,
        )

        if (isDuplicate) {
          // File already attached - return existing proposal without error
          return { proposal, asset }
        }

        const newAttachment: Attachment = {
          _type: 'fileAttachment',
          _key: uuidv4(),
          file: {
            _type: 'file',
            asset: {
              _ref: asset._id,
              _type: 'reference',
            },
          },
          attachmentType: input.attachmentType,
          title: input.title,
          description: input.description,
          filename: input.filename,
          uploadedAt: new Date().toISOString(),
        }

        const updatedAttachments = [
          ...(proposal.attachments || []),
          newAttachment,
        ]

        const { proposal: updated, err } = await updateProposal(input.id, {
          attachments: updatedAttachments,
        })

        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update attachments',
            cause: err,
          })
        }

        if (!updated) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found',
          })
        }

        return { proposal: updated, asset }
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upload attachment',
          cause: error,
        })
      }
    }),

  updateAttachments: organizerProcedure
    .input(
      IdParamSchema.extend({
        attachments: z.array(AttachmentSchema),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify ownership
        const { proposal, proposalError } = await getProposal({
          id: input.id,
          speakerId: ctx.speaker._id,
          isOrganizer: ctx.isOrgOrganizer,
          organizerOrgId: ctx.orgId,
        })

        if (proposalError || !proposal) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found or access denied',
          })
        }

        const { proposal: updated, err } = await updateProposal(input.id, {
          attachments: input.attachments,
        })

        if (err) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update attachments',
            cause: err,
          })
        }

        if (!updated) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found',
          })
        }

        return updated
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update attachments',
          cause: error,
        })
      }
    }),

  // Delete attachment (speaker)
  deleteAttachment: organizerProcedure
    .input(
      IdParamSchema.extend({
        attachmentKey: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify ownership
        const { proposal, proposalError } = await getProposal({
          id: input.id,
          speakerId: ctx.speaker._id,
          isOrganizer: ctx.isOrgOrganizer,
          organizerOrgId: ctx.orgId,
        })

        if (proposalError || !proposal) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found or access denied',
          })
        }

        // Find the attachment to check permissions
        const attachmentToCheck = proposal.attachments?.find(
          (a) => a._key === input.attachmentKey,
        )

        if (!attachmentToCheck) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Attachment not found',
          })
        }

        // Organizer privileges apply only to a proposal of the REQUEST org —
        // the owner arm of the read above also admits the caller's OWN
        // foreign-tenant proposal, over which the org-organizer bit grants
        // nothing.
        const isOrganizerForProposal =
          ctx.isOrgOrganizer &&
          !!ctx.orgId &&
          proposal._organizationId === ctx.orgId

        // Speakers cannot delete recording attachments
        if (
          attachmentToCheck.attachmentType === 'recording' &&
          !isOrganizerForProposal
        ) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot delete recording attachments',
          })
        }

        // Use helper to perform deletion
        const { proposal: updated } = await deleteAttachmentHelper(
          input.id,
          input.attachmentKey,
          {
            speakerId: ctx.speaker._id,
            orgIds: isOrganizerForProposal && ctx.orgId ? [ctx.orgId] : [],
          },
        )

        return updated
      } catch (error) {
        if (error instanceof TRPCError) throw error

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete attachment',
          cause: error,
        })
      }
    }),

  // Co-speaker invitation operations
  invitation: router({
    // Send invitation
    send: organizerProcedure
      .input(InvitationCreateSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          // Verify user owns the proposal (or is organizer)
          const { proposal, proposalError } = await getProposal({
            id: input.proposalId,
            speakerId: ctx.speaker._id,
            isOrganizer: ctx.isOrgOrganizer,
            organizerOrgId: ctx.orgId,
          })

          if (proposalError || !proposal || !proposal._id) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found or you do not have permission',
            })
          }

          // Reject invitations on proposals that are no longer active
          if (isInactiveProposal(proposal.status)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Cannot invite co-speakers to a proposal that has been ${proposal.status}.`,
            })
          }

          // Identity match key — normalize both sides (#684) so casing and
          // whitespace can never smuggle a duplicate invitation past the guards
          // below (or, at acceptance time, lock the invitee out of their own
          // invitation).
          const invitedEmail = normalizeEmail(input.invitedEmail)

          // Reject self-invitations
          if (invitedEmail === normalizeEmail(ctx.speaker.email)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'You cannot invite yourself as a co-speaker.',
            })
          }

          // Reject if the invitee is already a speaker on the proposal
          // (dangling speaker refs dereference to null and are filtered out)
          const existingSpeakers = extractSpeakersFromProposal(proposal)
          if (
            existingSpeakers.some(
              (s) => normalizeEmail(s.email) === invitedEmail,
            )
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'This person is already a speaker on this proposal and does not need an invitation.',
            })
          }

          // Reject duplicate pending invitations for the same email
          const pendingInvitations = (
            proposal.coSpeakerInvitations || []
          ).filter((inv) => inv.status === 'pending')
          if (
            pendingInvitations.some(
              (inv) => normalizeEmail(inv.invitedEmail) === invitedEmail,
            )
          ) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'A pending invitation already exists for this email address. Cancel it before sending a new one.',
            })
          }

          // Enforce the co-speaker limit for the proposal format,
          // counting both current co-speakers and pending invitations
          const coSpeakerLimit = getCoSpeakerLimit(proposal.format)
          const speakerCount = extractSpeakerIds(proposal.speakers).length
          const currentCoSpeakers =
            Math.max(speakerCount - 1, 0) + pendingInvitations.length
          if (currentCoSpeakers >= coSpeakerLimit) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                coSpeakerLimit === 0
                  ? 'This talk format does not allow co-speakers.'
                  : `This talk format allows at most ${coSpeakerLimit} co-speaker${coSpeakerLimit === 1 ? '' : 's'}, and that limit is already reached by current speakers and pending invitations.`,
            })
          }

          // Create invitation
          const conferenceId =
            '_id' in proposal.conference
              ? proposal.conference._id
              : (proposal.conference as { _ref: string })._ref

          const invitation = await createCoSpeakerInvitation({
            invitedByEmail: ctx.speaker.email,
            invitedByName: ctx.speaker.name,
            // Pass the address AS TYPED — `createCoSpeakerInvitation` applies the
            // recipient-safe `canonicalEmail` (trim + lowercase, no NFKC). The
            // fully-normalized `invitedEmail` above is a comparison key only and
            // must never become the mailbox an invitation token is sent to.
            invitedEmail: input.invitedEmail,
            invitedName: input.invitedName,
            proposalId: input.proposalId,
            proposalTitle: proposal.title,
            invitedBySpeakerId: ctx.speaker._id,
            conferenceId,
          })

          if (!invitation) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to create invitation',
            })
          }

          // Send invitation email
          const emailSent = await sendInvitationEmail(invitation)

          if (!emailSent) {
            // Attempt to clean up the orphaned invitation since email failed
            try {
              const { clientWrite } = await import('@/lib/sanity/client')
              await clientWrite.delete(invitation._id)
            } catch (cleanupError) {
              console.error(
                'Failed to cleanup orphaned invitation:',
                cleanupError,
              )
            }

            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message:
                'Failed to send invitation email. Please check that the email address is correct and try again.',
            })
          }

          // Never expose the invitation bearer token to the inviter's
          // browser; the invitee receives it via the emailed link.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { token: _token, ...safeInvitation } = invitation
          return safeInvitation
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to send invitation',
            cause: error,
          })
        }
      }),

    // Respond to invitation
    respond: organizerProcedure
      .input(InvitationResponseSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const invitation = await getInvitationByToken(input.token)

          if (!invitation) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Invitation not found or has expired',
            })
          }

          if (invitation.status !== 'pending') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invitation has already been responded to',
            })
          }

          // Verify ownership before revealing or mutating expiry state:
          // a non-invitee holding a leaked token must not trigger the
          // expired write or learn whether the invitation has expired.
          // Normalized on both sides (#684) so the invitee is not locked out of
          // their own invitation by provider casing; an empty address on either
          // side fails CLOSED rather than matching another empty one.
          //
          // Deliberately `canonicalEmail` (trim + lowercase), NOT the
          // NFKC-folding `normalizeEmail` used by the creation guards above.
          // The direction of failure differs:
          //   - the guards above REJECT (self-invite, duplicate, already a
          //     speaker), so a WIDER key rejects more and fails CLOSED;
          //   - this check GRANTS, so a wider key would accept more and fail
          //     OPEN.
          // NFKC rewrites the local part (`oﬀice@ex.com` -> `office@ex.com`),
          // and nothing guarantees the folded address reaches the same mailbox
          // (see `canonicalEmail`'s own docs). The token was delivered to the
          // literal `invitedEmail`, which is STORED canonically — so folding
          // here would let a holder whose address merely folds to the same
          // value claim an invitation that was never delivered to them. Keep
          // the claim set no wider than the delivery set.
          const invitationEmail = canonicalEmail(invitation.invitedEmail)
          const responderEmail = canonicalEmail(ctx.speaker.email)
          if (
            !invitationEmail ||
            !responderEmail ||
            invitationEmail !== responderEmail
          ) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'This invitation was sent to a different email address. Please sign in with the invited email address to accept.',
            })
          }

          // Enforce expiry server-side
          if (isInvitationExpired(invitation)) {
            try {
              await clientWrite
                .patch(invitation._id)
                .set({ status: 'expired' as InvitationStatus })
                .commit()
            } catch (expireError) {
              console.error(
                'Failed to mark invitation as expired:',
                expireError,
              )
            }

            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'This invitation has expired and can no longer be accepted or declined.',
            })
          }

          const status = input.accept ? 'accepted' : 'declined'

          // The invitation query dereferences the proposal, so a resolvable
          // proposal always carries an _id (dangling refs come back null)
          const proposalId =
            typeof invitation.proposal === 'object' &&
            invitation.proposal !== null &&
            '_id' in invitation.proposal
              ? invitation.proposal._id
              : undefined

          if (input.accept) {
            if (!proposalId) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'The proposal for this invitation no longer exists, so the invitation cannot be accepted.',
              })
            }

            // The invitee is not yet a speaker on the proposal, so bypass the
            // owner filter (isOrganizer branch) — but STILL org-scope the read to
            // the current tenant (B1): the read is constrained to the REQUEST
            // org (`ctx.orgId`), so a proposal id from another tenant does not
            // resolve regardless of which domain the request arrives on.
            const { proposal } = await getProposal({
              id: proposalId,
              speakerId: ctx.speaker._id,
              isOrganizer: true,
              organizerOrgId: ctx.orgId,
            })

            if (!proposal || !proposal._id) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message:
                  'The proposal for this invitation no longer exists, so the invitation cannot be accepted.',
              })
            }

            if (isInactiveProposal(proposal.status)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `This invitation can no longer be accepted because the proposal has been ${proposal.status}.`,
              })
            }

            const speakerIds = extractSpeakerIds(proposal.speakers)

            // Add the speaker to the proposal and mark the invitation
            // accepted in a single atomic transaction so a failed append
            // can never leave an accepted invitation without a speaker
            const transaction = clientWrite.transaction()

            if (!speakerIds.includes(ctx.speaker._id)) {
              transaction.patch(proposalId, (patch) =>
                patch
                  .setIfMissing({ speakers: [] })
                  .append('speakers', [
                    createReferenceWithKey(ctx.speaker._id),
                  ]),
              )
            }

            transaction.patch(invitation._id, (patch) =>
              patch.set({
                status: 'accepted' as InvitationStatus,
                respondedAt: new Date().toISOString(),
                acceptedSpeaker: createReference(ctx.speaker._id),
              }),
            )

            await transaction.commit()

            // SNAPSHOT SYNC (G2a): keep the proposal thread's participants[] in
            // step with the newly-accepted co-speaker so the flipped read path
            // grants them thread access (and fans messages out to them). The new
            // speaker set mirrors the append above. Never-fail / no-op without a
            // thread.
            await syncProposalConversationParticipants(
              proposalId,
              speakerIds.includes(ctx.speaker._id)
                ? speakerIds
                : [...speakerIds, ctx.speaker._id],
            )
          } else {
            // Mark declined (including the optional reason) in one patch
            await clientWrite
              .patch(invitation._id)
              .set({
                status: 'declined' as InvitationStatus,
                respondedAt: new Date().toISOString(),
                ...(input.declineReason
                  ? { declineReason: input.declineReason }
                  : {}),
              })
              .commit()
          }

          // Notify the inviter of the response; fire-and-forget so email
          // retries never delay the response and failures never fail the
          // mutation
          sendResponseNotificationEmail({
            invitation,
            respondentName: ctx.speaker.name || ctx.speaker.email,
            respondentEmail: ctx.speaker.email,
            accepted: input.accept,
            declineReason: input.declineReason,
          }).catch((emailError) => {
            console.error(
              'Failed to send co-speaker response notification email:',
              emailError,
            )
          })

          // Persist an in-app notification for the inviter (and bridge it to
          // web push, gated by their `coSpeakerInvites` preference) via the
          // hub. Shares createNotifications' never-fail contract: the response
          // is already committed above, so a notification failure must not fail
          // the mutation. Best-effort resolution of the inviter/conference ids;
          // if either is unresolvable we simply skip the in-app notification
          // (the email above still reaches the inviter).
          const inviterId =
            typeof invitation.invitedBy === 'object' &&
            invitation.invitedBy !== null &&
            '_id' in invitation.invitedBy
              ? invitation.invitedBy._id
              : undefined
          // The invitation projection carries no conference ref (neither does
          // its nested proposal), so resolve it from the current domain — the
          // respond endpoint is always hit on the conference's own domain.
          let notifyConferenceId: string | undefined
          try {
            const { conference: currentConference } =
              await getConferenceForCurrentDomain()
            notifyConferenceId = currentConference?._id
          } catch {
            notifyConferenceId = undefined
          }
          if (inviterId && notifyConferenceId) {
            const respondentName = ctx.speaker.name || ctx.speaker.email
            const proposalTitle =
              typeof invitation.proposal === 'object' &&
              invitation.proposal !== null &&
              'title' in invitation.proposal
                ? invitation.proposal.title
                : undefined
            await createNotifications([
              {
                recipientId: inviterId,
                conferenceId: notifyConferenceId,
                notificationType: 'cospeaker_response',
                title: proposalTitle
                  ? `${respondentName} ${input.accept ? 'accepted' : 'declined'} your co-speaker invitation for "${proposalTitle}"`
                  : `${respondentName} ${input.accept ? 'accepted' : 'declined'} your co-speaker invitation`,
                actorId: ctx.speaker._id,
                relatedProposalId: proposalId,
                link: proposalId ? `/cfp/proposal/${proposalId}` : '/cfp/list',
              },
            ])
          }

          return { success: true, status }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to respond to invitation',
            cause: error,
          })
        }
      }),

    // List invitations for a proposal
    list: organizerProcedure
      .input(IdParamSchema)
      .query(async ({ input, ctx }) => {
        try {
          // Verify ownership
          const { proposal, proposalError } = await getProposal({
            id: input.id,
            speakerId: ctx.speaker._id,
            isOrganizer: ctx.isOrgOrganizer,
            organizerOrgId: ctx.orgId,
          })

          if (proposalError || !proposal || !proposal._id) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found or you do not have permission',
            })
          }

          return proposal.coSpeakerInvitations || []
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch invitations',
            cause: error,
          })
        }
      }),

    // Cancel invitation
    cancel: organizerProcedure
      .input(InvitationCancelSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          // CONSTRAIN THE TYPE BEFORE THE PATCH (#746). `getDocument` fetches
          // ANY document by id and the authorisation below runs on whatever
          // `proposal` ref it happens to carry — but `review` and
          // `conversation` carry one too, so without this an organizer could
          // flip `status` on a review or a conversation of a proposal they can
          // already see. Intra-tenant, one enum field, but it is exactly the
          // shape this guard's `_type` equality exists to prevent: a client id
          // reaching a patch unproven. The org half is redundant with
          // `getProposal`'s scoping below and deliberately kept — the guard is
          // the invariant, not the shortest path to it.
          await requireDocumentInCurrentOrg(
            input.invitationId,
            'coSpeakerInvitation',
          )

          // Fetch invitation to verify ownership
          const invitation = await clientWrite.getDocument(input.invitationId)

          if (!invitation) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Invitation not found',
            })
          }

          // Verify user owns the proposal (or is organizer)
          const proposalRef = invitation.proposal as
            { _ref: string } | undefined
          if (!proposalRef?._ref) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid invitation',
            })
          }

          const { proposal, proposalError } = await getProposal({
            id: proposalRef._ref,
            speakerId: ctx.speaker._id,
            isOrganizer: ctx.isOrgOrganizer,
            organizerOrgId: ctx.orgId,
          })

          if (proposalError || !proposal || !proposal._id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to cancel this invitation',
            })
          }

          // Update invitation status
          await clientWrite
            .patch(input.invitationId)
            .set({ status: 'canceled' as InvitationStatus })
            .commit()

          return { success: true }
        } catch (error) {
          if (error instanceof TRPCError) throw error

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to cancel invitation',
            cause: error,
          })
        }
      }),
  }),
})
