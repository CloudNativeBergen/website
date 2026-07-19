import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, resolveConferenceId } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  ListConversationsSchema,
  GetConversationSchema,
  ListMessagesSchema,
  SendMessageSchema,
  SetPreferenceSchema,
} from '@/server/schemas/message'
import {
  listConversationsForSpeaker,
  getConversationById,
  getConversationParticipants,
  getConversationPreference,
  listMessages,
  addMessage,
  ensureProposalConversation,
  createGeneralConversation,
  getProposalForConversation,
  setConversationPreference,
  canAccessConversation,
  speakerExists,
} from '@/lib/messaging/sanity'
import { notifyNewMessage } from '@/lib/messaging/notify'
import type { ConversationWithContext } from '@/lib/messaging/types'

/**
 * Speaker↔organizer messaging (M1). Every procedure derives the actor from
 * `ctx.speaker` and the conference from the domain; a client can never target
 * another user or another conference. Read/write access to a conversation is
 * gated by `canAccessConversation` (organizer, proposal-speaker, or creator).
 */
export const messageRouter = router({
  /** The caller's conversation inbox (organizers see all; speakers see theirs). */
  listConversations: protectedProcedure
    .input(ListConversationsSchema)
    .query(async ({ ctx, input }) => {
      const conferenceId = await resolveConferenceId()
      return listConversationsForSpeaker({
        speakerId: ctx.speaker._id,
        isOrganizer: ctx.speaker.isOrganizer === true,
        conferenceId,
        before: input.cursor,
      })
    }),

  /** A single conversation + participants + the caller's own preference. */
  getConversation: protectedProcedure
    .input(GetConversationSchema)
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.id)
      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        })
      }
      if (!canAccessConversation(conversation, ctx.speaker)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' })
      }
      const [participants, preference] = await Promise.all([
        getConversationParticipants(conversation),
        getConversationPreference(conversation._id, ctx.speaker._id),
      ])
      return { conversation, participants, preference }
    }),

  /** A conversation's messages, newest first, keyset-paginated. Authz-checked. */
  listMessages: protectedProcedure
    .input(ListMessagesSchema)
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId)
      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        })
      }
      if (!canAccessConversation(conversation, ctx.speaker)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' })
      }
      return listMessages({
        conversationId: conversation._id,
        before: input.cursor,
      })
    }),

  /**
   * Send a message, creating the conversation when needed:
   * - `conversationId` → post to an existing thread (authz-checked);
   * - `proposalId`     → look up / create the proposal thread (race-safe id);
   * - `subject` only   → start a general thread.
   * Then adds the message and fires the (never-fail) fan-out.
   *
   * `recipientSpeakerId` targets the subject speaker of an ORGANIZER-initiated
   * general thread: it is FORBIDDEN for a non-organizer, and REQUIRED (and must
   * resolve to a real speaker) when an organizer starts a general thread.
   */
  send: protectedProcedure
    .input(SendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference?._id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Could not resolve conference from domain',
        })
      }
      const conferenceId = conference._id
      const actorId = ctx.speaker._id
      const isOrganizer = ctx.speaker.isOrganizer === true

      // `recipientSpeakerId` is an organizer-only capability: a non-organizer
      // must never be able to name the subject speaker of a thread.
      if (input.recipientSpeakerId !== undefined && !isOrganizer) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'recipientSpeakerId may only be set by an organizer',
        })
      }

      let conversation: ConversationWithContext

      if (input.conversationId) {
        const existing = await getConversationById(input.conversationId)
        if (!existing) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conversation not found',
          })
        }
        if (!canAccessConversation(existing, ctx.speaker)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' })
        }
        conversation = existing
      } else if (input.proposalId) {
        const proposal = await getProposalForConversation(input.proposalId)
        if (!proposal || proposal.conferenceId !== conferenceId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Proposal not found',
          })
        }
        // Only an organizer or a speaker ON the proposal may open its thread.
        if (!isOrganizer && !proposal.speakerIds.includes(actorId)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' })
        }
        const id = await ensureProposalConversation({
          conferenceId,
          proposalId: input.proposalId,
          proposalTitle: proposal.title ?? 'Proposal',
          createdById: actorId,
        })
        const created = await getConversationById(id)
        if (!created) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to load conversation',
          })
        }
        conversation = created
      } else if (input.subject) {
        // An organizer-initiated general thread MUST target a real speaker; a
        // speaker-initiated one is about themselves and takes no recipient.
        let subjectSpeakerId: string | undefined
        if (isOrganizer) {
          if (!input.recipientSpeakerId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'recipientSpeakerId is required when an organizer starts a general conversation',
            })
          }
          if (!(await speakerExists(input.recipientSpeakerId))) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'recipientSpeakerId does not resolve to a speaker',
            })
          }
          subjectSpeakerId = input.recipientSpeakerId
        }
        const id = await createGeneralConversation({
          conferenceId,
          createdById: actorId,
          subject: input.subject,
          subjectSpeakerId,
        })
        const created = await getConversationById(id)
        if (!created) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to load conversation',
          })
        }
        conversation = created
      } else {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Provide a conversationId, a proposalId, or a subject to start a conversation',
        })
      }

      const message = await addMessage({
        conversationId: conversation._id,
        authorId: actorId,
        body: input.body,
      })

      // Fan-out is fire-and-forget within the request: it never throws, and a
      // failure must not fail the (committed) message write.
      await notifyNewMessage({
        conversation,
        message,
        authorId: actorId,
        conference,
      })

      return { conversationId: conversation._id, message }
    }),

  /** Set the caller's mute / email preference for a conversation. Authz-checked. */
  setPreference: protectedProcedure
    .input(SetPreferenceSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId)
      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        })
      }
      if (!canAccessConversation(conversation, ctx.speaker)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' })
      }
      return setConversationPreference({
        conversationId: conversation._id,
        speakerId: ctx.speaker._id,
        muted: input.muted,
        emailOverride: input.emailOverride,
      })
    }),
})
