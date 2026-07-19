import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { v4 as uuidv4 } from 'uuid'
import {
  router,
  protectedProcedure,
  adminProcedure,
  resolveConferenceId,
} from '@/server/trpc'
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
import { clientWrite } from '@/lib/sanity/client'
import { createReference, createReferenceWithKey } from '@/lib/sanity/helpers'
import {
  createNotifications,
  getOrganizerSpeakerIds,
  deleteMessageNotificationsFor,
} from '@/lib/notification/sanity'
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
import { ensureProposalConversation, addMessage } from '@/lib/messaging/sanity'
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
 * Helper function to delete an attachment and its associated file asset
 */
async function deleteAttachmentHelper(
  proposalId: string,
  attachmentKey: string,
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
  }>(`*[_type == "talk" && _id == $id][0]{ _id, attachments }`, {
    id: proposalId,
  })

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
      const { proposals, proposalsError } = await getProposals({
        speakerId: ctx.speaker._id,
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
  getById: protectedProcedure
    .input(IdParamSchema)
    .query(async ({ input, ctx }) => {
      try {
        const isOrganizer = ctx.speaker.isOrganizer === true
        const { proposal, proposalError } = await getProposal({
          id: input.id,
          speakerId: ctx.speaker._id,
          isOrganizer,
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

        const { isCfpOpen } = await import('@/lib/conference/state')
        if (!isCfpOpen(conference)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'The Call for Papers is currently closed. We&apos;d love to have you speak at our next conference! Please check back when the next CFP opens, or contact the organizers if you have any questions.',
          })
        }

        // When submitting, enforce strict validation
        if (input.status !== Status.draft) {
          const result = ProposalInputSchema.safeParse(input.data)
          if (!result.success) {
            const fieldErrors = result.error.issues.map((i) => i.message)
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Please fix the following before submitting: ${fieldErrors.join('. ')}`,
            })
          }
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
            const organizerIds = await getOrganizerSpeakerIds()
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
  update: protectedProcedure
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

        if (!ctx.speaker.isOrganizer && existing.conference) {
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
  removeCoSpeaker: protectedProcedure
    .input(RemoveCoSpeakerSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const isOrganizer = ctx.speaker.isOrganizer === true

        // getProposal scopes the query to the caller's speaker id unless
        // they are an organizer, so this doubles as the ownership check
        const { proposal, proposalError } = await getProposal({
          id: input.proposalId,
          speakerId: ctx.speaker._id,
          isOrganizer,
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

        if (!isOrganizer && input.speakerId === ctx.speaker._id) {
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
        if (!isOrganizer && input.speakerId === speakerIds[0]) {
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
  action: protectedProcedure
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
          isOrganizer: ctx.speaker.isOrganizer,
        })

        if (proposalError || !proposal || proposal._id !== id) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found or you do not have permission',
          })
        }

        // Validate action using state machine
        const { status, isValidAction } = actionStateMachine(
          proposal.status,
          action,
          ctx.speaker.isOrganizer,
        )

        if (!isValidAction) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid action ${action} for status ${proposal.status}`,
          })
        }

        // Block unsubmit after CFP closes — speakers should withdraw instead
        if (action === Action.unsubmit && !ctx.speaker.isOrganizer) {
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
        if (action === Action.withdraw && !ctx.speaker.isOrganizer) {
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

        // Enforce cap when submitting a draft (draft → submitted transition)
        if (
          proposal.status === Status.draft &&
          status === Status.submitted &&
          !ctx.speaker.isOrganizer
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
        // stays visible to organizers on the proposal itself.
        const { proposal: updatedProposal, err: updateErr } =
          await updateProposalStatus(
            id,
            status,
            action === Action.withdraw ? reason : undefined,
          )

        if (updateErr) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update proposal status',
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
              isOrganizer: ctx.speaker.isOrganizer,
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
          ctx.speaker.isOrganizer &&
          trimmedComment &&
          COMMENT_RELAY_ACTIONS.includes(action)
        ) {
          try {
            const conversationId = await ensureProposalConversation({
              conferenceId: conference._id,
              proposalId: id,
              proposalTitle: proposal.title ?? 'Proposal',
              createdById: ctx.speaker._id,
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
            includeReviews: true,
            includeSubmittedTalks: true,
            includePreviousAcceptedTalks: true,
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
    create: adminProcedure
      .input(ProposalAdminCreateSchema)
      .mutation(async ({ input }) => {
        try {
          const { speakers, ...proposalData } = input
          const conferenceId = await resolveConferenceId()

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
          const { speakers, ...proposalData } = input.data

          // If speakers are being updated, convert to references
          let updateData = proposalData
          if (speakers && speakers.length > 0) {
            const speakerRefs = speakers.map((id) => createReference(id))
            updateData = {
              ...proposalData,
              speakers: speakerRefs,
            } as typeof proposalData
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
      .mutation(async ({ input }) => {
        try {
          const { proposal } = await deleteAttachmentHelper(
            input.id,
            input.attachmentKey,
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
  uploadAttachment: protectedProcedure
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
          isOrganizer: ctx.speaker.isOrganizer === true,
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

  updateAttachments: protectedProcedure
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
          isOrganizer: ctx.speaker.isOrganizer === true,
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
  deleteAttachment: protectedProcedure
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
          isOrganizer: ctx.speaker.isOrganizer === true,
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

        // Speakers cannot delete recording attachments
        if (
          attachmentToCheck.attachmentType === 'recording' &&
          !ctx.speaker.isOrganizer
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
    send: protectedProcedure
      .input(InvitationCreateSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          // Verify user owns the proposal (or is organizer)
          const { proposal, proposalError } = await getProposal({
            id: input.proposalId,
            speakerId: ctx.speaker._id,
            isOrganizer: ctx.speaker.isOrganizer === true,
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

          const invitedEmail = input.invitedEmail.toLowerCase()

          // Reject self-invitations
          if (invitedEmail === ctx.speaker.email?.toLowerCase()) {
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
              (s) => s.email?.toLowerCase() === invitedEmail,
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
              (inv) => inv.invitedEmail?.toLowerCase() === invitedEmail,
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
    respond: protectedProcedure
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
          // expired write or learn whether the invitation has expired
          if (
            invitation.invitedEmail.toLowerCase() !==
            ctx.speaker.email.toLowerCase()
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

            const { proposal } = await getProposal({
              id: proposalId,
              speakerId: ctx.speaker._id,
              isOrganizer: true,
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
    list: protectedProcedure
      .input(IdParamSchema)
      .query(async ({ input, ctx }) => {
        try {
          // Verify ownership
          const { proposal, proposalError } = await getProposal({
            id: input.id,
            speakerId: ctx.speaker._id,
            isOrganizer: ctx.speaker.isOrganizer === true,
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
    cancel: protectedProcedure
      .input(InvitationCancelSchema)
      .mutation(async ({ input, ctx }) => {
        try {
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
            isOrganizer: ctx.speaker.isOrganizer === true,
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
