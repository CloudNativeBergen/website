import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, resolveConferenceId } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { runAfterResponse } from '@/server/runAfterResponse'
import {
  ListConversationsSchema,
  GetConversationSchema,
  ListMessagesSchema,
  SendMessageSchema,
  SetPreferenceSchema,
  parseMessageCursor,
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
} from '@/lib/messaging/sanity'
import { notifyNewMessage } from '@/lib/messaging/notify'
import type { ConversationWithContext } from '@/lib/messaging/types'

/**
 * Per-speaker sliding-window throttle for `message.send` (batch A / A2). Sending
 * fans out to Slack (one post) and to N organizer emails, so an unthrottled
 * loop amplifies. Allow a burst of {@link SEND_MAX_IN_WINDOW} sends per
 * {@link SEND_WINDOW_MS}, then reject with TOO_MANY_REQUESTS.
 *
 * Lives in module memory, so on serverless it is PER-INSTANCE only — a burst
 * spread across instances sees a higher effective ceiling. That's acceptable:
 * this caps accidental/abusive hammering on a single instance while the email
 * and Slack providers rate-limit further downstream (same caveat as push.ts's
 * claimTestCooldown). The map is size-capped so it can never grow without bound.
 */
const SEND_WINDOW_MS = 60_000
const SEND_MAX_IN_WINDOW = 10
const MAX_RATE_ENTRIES = 10_000
const recentSendsBySpeaker = new Map<string, number[]>()

/**
 * Record a send for `speakerId` and report whether it is allowed right now.
 * Returns false when the speaker already made {@link SEND_MAX_IN_WINDOW} sends
 * within the trailing {@link SEND_WINDOW_MS}; otherwise stamps now and allows.
 */
function claimSendSlot(speakerId: string): boolean {
  const now = Date.now()
  const cutoff = now - SEND_WINDOW_MS
  const recent = (recentSendsBySpeaker.get(speakerId) ?? []).filter(
    (t) => t > cutoff,
  )
  // Re-insert at the tail so the just-active speaker is the most-recent entry
  // (eviction below always targets the genuinely oldest key).
  recentSendsBySpeaker.delete(speakerId)
  if (recent.length >= SEND_MAX_IN_WINDOW) {
    recentSendsBySpeaker.set(speakerId, recent)
    return false
  }
  recent.push(now)
  if (recentSendsBySpeaker.size >= MAX_RATE_ENTRIES) {
    const oldest = recentSendsBySpeaker.keys().next().value
    if (oldest !== undefined) recentSendsBySpeaker.delete(oldest)
  }
  recentSendsBySpeaker.set(speakerId, recent)
  return true
}

/**
 * Does `speakerId` have standing in `conferenceId` — a proposal (talk) in that
 * conference OR the organizer flag? This MUST match the population the admin
 * speaker picker offers (`speaker.admin.search` = confirmed/accepted speakers ∪
 * organizers): a stricter server check rejects recipients the UI legitimately
 * suggests — the prod bug where an autocompleted organizer (no talk this
 * edition) failed with "Speaker not found". Cross-conference targeting stays
 * blocked: a talk-less non-organizer from another edition has no standing here.
 */
async function speakerHasStandingInConference(
  speakerId: string,
  conferenceId: string,
): Promise<boolean> {
  const id = await clientReadUncached.fetch<string | null>(
    `*[_type == "speaker" && _id == $speakerId && (isOrganizer == true || count(*[_type == "talk" && conference._ref == $conferenceId && ^._id in speakers[]._ref]) > 0)][0]._id`,
    { speakerId, conferenceId },
    { cache: 'no-store' },
  )
  return Boolean(id)
}

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
      // The cursor is EITHER a plain ISO datetime (legacy) or `<iso>~<_id>`
      // (compound keyset); split it so exact-timestamp ties page correctly.
      const { before, beforeId } = parseMessageCursor(input.cursor)
      return listConversationsForSpeaker({
        speakerId: ctx.speaker._id,
        isOrganizer: ctx.speaker.isOrganizer === true,
        conferenceId,
        before,
        beforeId,
      })
    }),

  /** A single conversation + participants + the caller's own preference. */
  getConversation: protectedProcedure
    .input(GetConversationSchema)
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.id)
      // Return NOT_FOUND for both "absent" and "access denied" so that, with
      // deterministic proposal-thread ids, the response never reveals whether a
      // thread the caller can't see exists (batch A / A3).
      if (!conversation || !canAccessConversation(conversation, ctx.speaker)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        })
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
      // NOT_FOUND for absent OR inaccessible — no existence oracle (A3).
      if (!conversation || !canAccessConversation(conversation, ctx.speaker)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        })
      }
      // Plain ISO (legacy) or `<iso>~<_id>` (compound keyset) — split so
      // messages sharing an exact `createdAt` page without skips/dupes.
      const { before, beforeId } = parseMessageCursor(input.cursor)
      return listMessages({
        conversationId: conversation._id,
        before,
        beforeId,
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
        // Collapse absent / wrong-conference / inaccessible into a single
        // NOT_FOUND: no existence oracle (A3), and a conversation from another
        // conference must never be posted to on this domain — that would stamp
        // the message with wrong-domain email/Slack links (batch A / A4).
        if (
          !existing ||
          existing.conferenceId !== conferenceId ||
          !canAccessConversation(existing, ctx.speaker)
        ) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conversation not found',
          })
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
          // The recipient must have standing in THIS conference (a proposal in
          // it), not merely exist in some conference (batch A / A5).
          if (
            !(await speakerHasStandingInConference(
              input.recipientSpeakerId,
              conferenceId,
            ))
          ) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message:
                'recipientSpeakerId does not resolve to a speaker in this conference',
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

      // Throttle only genuine sends (after authz/validation), since only a
      // committed message triggers the Slack + N-email amplification (A2).
      if (!claimSendSlot(actorId)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message:
            'You are sending messages too quickly. Please wait a moment and try again.',
        })
      }

      const message = await addMessage({
        conversationId: conversation._id,
        authorId: actorId,
        body: input.body,
      })

      // Detach the fan-out from the response path (A8): the message is already
      // committed and returned below; the (never-fail) Slack/email/hub fan-out
      // runs AFTER the response so a large recipient set can't hang the Send
      // button. `runAfterResponse` uses Next's `after()` in a request scope and
      // falls back to a self-catching detachment elsewhere.
      runAfterResponse(() =>
        notifyNewMessage({
          conversation,
          message,
          authorId: actorId,
          conference,
        }),
      )

      return { conversationId: conversation._id, message }
    }),

  /** Set the caller's mute / email preference for a conversation. Authz-checked. */
  setPreference: protectedProcedure
    .input(SetPreferenceSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId)
      // NOT_FOUND for absent OR inaccessible — no existence oracle (A3).
      if (!conversation || !canAccessConversation(conversation, ctx.speaker)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        })
      }
      return setConversationPreference({
        conversationId: conversation._id,
        speakerId: ctx.speaker._id,
        muted: input.muted,
        emailOverride: input.emailOverride,
      })
    }),
})
