import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, adminProcedure } from '@/server/trpc'
import type { InvitationStatus } from '@/lib/cospeaker/types'
import {
  ProposalInputSchema,
  ProposalAdminCreateSchema,
  ProposalUpdateSchema,
  ProposalAdminUpdateSchema,
  InvitationCreateSchema,
  InvitationResponseSchema,
  InvitationCancelSchema,
  IdParamSchema,
  ProposalActionSchema,
} from '@/server/schemas/proposal'
import {
  getProposal,
  getProposals,
  createProposal,
  updateProposal,
  deleteProposal,
} from '@/lib/proposal/data/sanity'
import {
  createCoSpeakerInvitation,
  updateInvitationStatus,
  sendInvitationEmail,
} from '@/lib/cospeaker/server'
import { getInvitationByToken } from '@/lib/cospeaker/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { clientWrite } from '@/lib/sanity/client'
import { createReference } from '@/lib/sanity/helpers'
import type { ProposalInput } from '@/lib/proposal/types'
import { Status } from '@/lib/proposal/types'
import { actionStateMachine } from '@/lib/proposal'
import { Speaker } from '@/lib/speaker/types'
import { eventBus } from '@/lib/events/bus'
import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { updateProposalStatus, getProposalSanity } from '@/lib/proposal/server'
import '@/lib/events/registry'

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
        const isOrganizer = ctx.speaker.is_organizer === true
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

  // Create proposal
  create: protectedProcedure
    .input(ProposalInputSchema)
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

        // Create proposal with current speaker as the speaker
        const { proposal, err } = await createProposal(
          {
            ...input,
            speakers: [createReference(ctx.speaker._id)],
          } as ProposalInput,
          ctx.speaker._id,
          conference._id,
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

  // Update proposal
  update: protectedProcedure
    .input(IdParamSchema.extend({ data: ProposalUpdateSchema }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Verify ownership
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

        // Check if conference is over (only if not organizer)
        if (!ctx.speaker.is_organizer && existing.conference) {
          const conferenceId =
            typeof existing.conference === 'object' &&
            '_id' in existing.conference
              ? existing.conference._id
              : typeof existing.conference === 'string'
                ? existing.conference
                : null

          if (conferenceId) {
            const { conference } = await getConferenceForCurrentDomain({
              revalidate: 0,
            })
            if (conference && conference._id === conferenceId) {
              const { isConferenceOver } = await import(
                '@/lib/conference/state'
              )
              if (isConferenceOver(conference)) {
                throw new TRPCError({
                  code: 'FORBIDDEN',
                  message:
                    'Cannot edit proposal after conference has ended. Contact organizers if you need to make changes.',
                })
              }
            }
          }
        }

        // Update proposal (only if there's data to update)
        if (Object.keys(input.data).length === 0) {
          return existing
        }

        const { proposal, err } = await updateProposal(
          input.id,
          input.data as ProposalInput,
        )

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

  // Execute proposal action (submit, withdraw, etc.)
  action: protectedProcedure
    .input(IdParamSchema.extend(ProposalActionSchema.shape))
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, action, notify, comment } = input

        // Get conference context
        const {
          conference,
          domain,
          error: confError,
        } = await getConferenceForCurrentDomain({ revalidate: 0 })

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
          isOrganizer: ctx.speaker.is_organizer,
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
          ctx.speaker.is_organizer,
        )

        if (!isValidAction) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid action ${action} for status ${proposal.status}`,
          })
        }

        // Handle deletion separately
        if (status === Status.deleted) {
          const { err: deleteError } = await deleteProposal(id)
          if (deleteError) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to delete proposal',
              cause: deleteError,
            })
          }
          return { proposalStatus: Status.deleted }
        }

        // Update proposal status
        const { proposal: updatedProposal, err: updateErr } =
          await updateProposalStatus(id, status)

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
              isOrganizer: ctx.speaker.is_organizer,
            },
            shouldNotify: notify,
            comment,
            domain,
          },
        }

        eventBus.publish(statusChangeEvent).catch((error) => {
          console.error('Failed to publish status change event:', error)
        })

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
    list: adminProcedure.query(async () => {
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

        const { proposals, proposalsError } = await getProposals({
          conferenceId: conference._id,
          returnAll: true,
          includeReviews: true,
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
          const { speakers, conferenceId, ...proposalData } = input

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

          const { proposal, err } = await updateProposal(
            input.id,
            updateData as ProposalInput,
          )

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

    // Update video URL (admin)
    updateVideo: adminProcedure
      .input(
        IdParamSchema.extend({
          videoUrl: z.string().url().nullable(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const { proposal, err } = await updateProposal(input.id, {
            video: input.videoUrl,
          } as ProposalInput)

          if (err) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to update video URL',
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
            message: 'Failed to update video URL',
            cause: error,
          })
        }
      }),
  }),

  // Co-speaker invitation operations
  invitation: router({
    // Send invitation
    send: protectedProcedure
      .input(InvitationCreateSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          // Verify user owns the proposal
          const { proposal, proposalError } = await getProposal({
            id: input.proposalId,
            speakerId: ctx.speaker._id,
            isOrganizer: false,
          })

          if (proposalError || !proposal || !proposal._id) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Proposal not found or you do not have permission',
            })
          }

          // Create invitation
          const invitation = await createCoSpeakerInvitation({
            invitedByEmail: ctx.speaker.email,
            invitedByName: ctx.speaker.name,
            invitedEmail: input.invitedEmail,
            invitedName: input.invitedName,
            proposalId: input.proposalId,
            proposalTitle: proposal.title,
            invitedBySpeakerId: ctx.speaker._id,
          })

          if (!invitation) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to create invitation',
            })
          }

          // Send invitation email
          await sendInvitationEmail(invitation)

          return invitation
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

          // Update invitation status
          const status = input.accept ? 'accepted' : 'declined'
          await updateInvitationStatus(
            invitation._id,
            status,
            input.accept ? ctx.speaker._id : undefined,
          )

          // If accepted, add speaker to proposal
          if (
            input.accept &&
            typeof invitation.proposal === 'object' &&
            '_ref' in invitation.proposal
          ) {
            const proposalId = invitation.proposal._ref

            const { proposal } = await getProposal({
              id: proposalId,
              speakerId: ctx.speaker._id,
              isOrganizer: true,
            })

            if (proposal) {
              const currentSpeakers = proposal.speakers || []
              const speakerIds = currentSpeakers
                .filter((s) => typeof s === 'object' && '_id' in s)
                .map((s) => (s as { _id: string })._id)

              if (!speakerIds.includes(ctx.speaker._id)) {
                await clientWrite
                  .patch(proposalId)
                  .setIfMissing({ speakers: [] })
                  .append('speakers', [createReference(ctx.speaker._id)])
                  .commit()
              }
            }
          }

          // If declined, save decline reason
          if (!input.accept && input.declineReason) {
            await clientWrite
              .patch(invitation._id)
              .set({ declineReason: input.declineReason })
              .commit()
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
            isOrganizer: ctx.speaker.is_organizer === true,
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

          // Verify user owns the proposal
          const proposalRef = invitation.proposal as
            | { _ref: string }
            | undefined
          if (!proposalRef?._ref) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid invitation',
            })
          }

          const { proposal, proposalError } = await getProposal({
            id: proposalRef._ref,
            speakerId: ctx.speaker._id,
            isOrganizer: false,
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
