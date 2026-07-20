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
  SetStatusSchema,
  SetAssigneeSchema,
  SetArchivedSchema,
  UnreadByProposalIdsSchema,
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
  ensureSponsorConversation,
  createGeneralConversation,
  getProposalForConversation,
  setConversationPreference,
  setConversationStatus,
  setConversationAssignee,
  setConversationArchived,
  getConversationViewCounts,
  getUnreadCountsByProposalIds,
  canAccessConversation,
} from '@/lib/messaging/sanity'
import {
  getSponsorFanoutContext,
  type SponsorFanoutContext,
} from '@/lib/messaging/sponsor'
import { z } from 'zod'
import {
  getOrganizerSpeakerIds,
  createNotifications,
} from '@/lib/notification/sanity'
import {
  conversationLinkPath,
  truncateToGraphemeBoundary,
} from '@/lib/messaging/links'
import { notifyNewMessage, notifySponsorMessage } from '@/lib/messaging/notify'
import { getViewerTeamLens } from '@/lib/teams'
import { SPEAKER_ALLOWED_VIEWS } from '@/lib/messaging/types'
import type {
  AccessSpeaker,
  ConversationWithContext,
} from '@/lib/messaging/types'

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
 * conference OR organizer status? This MUST match the population the admin
 * speaker picker offers (`speaker.admin.search` = confirmed/accepted speakers ∪
 * organizers): a stricter server check rejects recipients the UI legitimately
 * suggests. THE ORGANIZER CLAUSE USES THE CANONICAL DEFINITION — membership in
 * a conference's `organizers[]` array, the same rule the session and the picker
 * derive from. (The speaker schema has NO stored `isOrganizer` field: a prior
 * version tested `isOrganizer == true`, which matches nothing in production and
 * kept rejecting picker-offered organizers with "Speaker not found".)
 * Cross-conference targeting stays blocked: a talk-less non-organizer from
 * another edition has no standing here.
 *
 * ANY-CONFERENCE ORGANIZER MATCH IS INTENTIONAL (QR-M6, verified not a leak):
 * the organizer clause matches an organizer of ANY edition on purpose because
 * `isOrganizer` is GLOBAL in this app — it is derived as `_id in
 * *[_type == "conference"].organizers[]._ref` (see `lib/speaker/sanity.ts`), and
 * `canAccessConversation` short-circuits `if (speaker.isOrganizer) return true`.
 * So a global organizer can ALREADY read/write every thread; naming them the
 * subjectSpeaker of a new general thread grants no access they lack. Scoping this
 * clause to `$conferenceId` would instead REJECT a legitimate organizer the admin
 * picker offers. Not a cross-tenant leak; do not narrow it.
 */
async function speakerHasStandingInConference(
  speakerId: string,
  conferenceId: string,
): Promise<boolean> {
  const id = await clientReadUncached.fetch<string | null>(
    `*[_type == "speaker" && _id == $speakerId && (_id in *[_type == "conference"].organizers[]._ref || count(*[_type == "talk" && conference._ref == $conferenceId && ^._id in speakers[]._ref]) > 0)][0]._id`,
    { speakerId, conferenceId },
    { cache: 'no-store' },
  )
  return Boolean(id)
}

/**
 * Load a conversation for an ORGANIZER-ONLY management mutation (status /
 * assignee / archive). Collapses absent, non-organizer, and inaccessible into a
 * single NOT_FOUND — no existence oracle, and the ticketing capability itself is
 * not revealed to a non-organizer participant (A3 semantics). `isOrganizer`
 * already implies `canAccessConversation`, but both are asserted per the design.
 */
async function loadManageableConversation(
  conversationId: string,
  speaker: AccessSpeaker,
): Promise<ConversationWithContext> {
  const conversation = await getConversationById(conversationId)
  if (
    !conversation ||
    speaker.isOrganizer !== true ||
    !canAccessConversation(conversation, speaker)
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Conversation not found',
    })
  }
  return conversation
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
      const isOrganizer = ctx.speaker.isOrganizer === true
      const view = input.view ?? 'active'
      // A non-organizer may only use the speaker-appropriate views; the
      // organizer-only views (needs-reply / mine / resolved) carry organizer
      // semantics, so reject them for a speaker rather than silently coercing.
      if (!isOrganizer && !SPEAKER_ALLOWED_VIEWS.includes(view)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `View '${view}' is not available`,
        })
      }
      // The cursor is EITHER a plain ISO datetime (legacy) or `<iso>~<_id>`
      // (compound keyset); split it so exact-timestamp ties page correctly.
      const { before, beforeId } = parseMessageCursor(input.cursor)
      return listConversationsForSpeaker({
        speakerId: ctx.speaker._id,
        isOrganizer,
        conferenceId,
        before,
        beforeId,
        view,
      })
    }),

  /**
   * Conversation COUNTS per inbox tab for the caller's audience (S7). Organizers
   * get every tab ({ active, needsReply, mine, resolved, archived }); speakers
   * get { active, archived }. ONE bounded GROQ round trip over this conference's
   * conversation set, reusing the same predicates the list views apply — meant to
   * accompany the first inbox page, not to be polled hot.
   */
  viewCounts: protectedProcedure.query(async ({ ctx }) => {
    const conferenceId = await resolveConferenceId()
    return getConversationViewCounts({
      speakerId: ctx.speaker._id,
      isOrganizer: ctx.speaker.isOrganizer === true,
      conferenceId,
    })
  }),

  /**
   * The caller's TEAM LENS (TEAMS-3): every configured team's key + title, plus
   * the keys of the teams the caller belongs to. Powers the inbox `My teams` tab
   * visibility (hidden when no team is configured) and the per-row team chips.
   * A soft lens — this is read-only convenience, never an access gate. One
   * per-instance-cached teams read; cache it on the client.
   */
  teamLens: protectedProcedure.query(async ({ ctx }) => {
    const conferenceId = await resolveConferenceId()
    return getViewerTeamLens(conferenceId, ctx.speaker._id)
  }),

  /**
   * Unread message counts keyed by proposal id, for the CALLER (speaker-journey
   * badges on proposal-list rows, V2b). ONE bounded GROQ over the caller's own
   * unread `message_received` notifications — reuses the same notification store
   * the inbox badges derive from, so no new polling. Reads only the caller's
   * notifications, so arbitrary proposal ids reveal nothing.
   */
  unreadByProposalIds: protectedProcedure
    .input(UnreadByProposalIdsSchema)
    .query(async ({ ctx, input }) => {
      const conferenceId = await resolveConferenceId()
      return getUnreadCountsByProposalIds({
        speakerId: ctx.speaker._id,
        conferenceId,
        proposalIds: input.proposalIds,
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
          // Party model (G1): the proposal's current speakers seed the
          // dual-written `participants[]` (see ensureProposalConversation).
          proposalSpeakerIds: proposal.speakerIds,
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

      // REOPEN-ON-REPLY (S3): a NON-organizer replying to a resolved thread
      // reopens it, atomically with the message write, so the follow-up
      // re-enters the organizer needs-reply queue. `conversation.status` is
      // coalesced ('open' when absent) by `getConversationById`. An organizer
      // reply to a resolved thread does NOT reopen it.
      const reopen = !isOrganizer && conversation.status === 'resolved'

      const message = await addMessage({
        conversationId: conversation._id,
        authorId: actorId,
        body: input.body,
        reopen,
      })

      // Detach the fan-out from the response path (A8): the message is already
      // committed and returned below; the (never-fail) Slack/email/hub fan-out
      // runs AFTER the response so a large recipient set can't hang the Send
      // button. `runAfterResponse` uses Next's `after()` in a request scope and
      // falls back to a self-catching detachment elsewhere.
      //
      // SPONSOR threads (G2b) route to the sponsor fan-out instead of the speaker
      // one: this actor is an ORGANIZER (only organizers can access a sponsor
      // thread via a session), so it is the organizer-authored direction —
      // email every contact person, hub the other organizers, NO Slack.
      if (conversation.conversationType === 'sponsor') {
        const sfcId = conversation.participants?.find(
          (p) => p.partyType === 'sponsor',
        )?.sponsorForConferenceId
        runAfterResponse(async () => {
          const sfc = sfcId ? await getSponsorFanoutContext(sfcId) : null
          if (!sfc) return
          await notifySponsorMessage({
            conversation,
            message,
            sfc,
            authorOrganizerId: actorId,
          })
        })
      } else {
        runAfterResponse(() =>
          notifyNewMessage({
            conversation,
            message,
            authorId: actorId,
            conference,
          }),
        )
      }

      return { conversationId: conversation._id, message }
    }),

  /**
   * Organizer-only: ensure the SINGLE sponsor↔organizer thread for a
   * `sponsorForConference` exists and return its id (messaging G2b). Lets an
   * organizer OPEN (and thereby start) the thread from the sponsor CRM before the
   * sponsor has posted anything — the thread is created with the acting organizer
   * as `createdBy` (org-initiated). Idempotent: a second call returns the same
   * deterministic id. The sfc MUST belong to the current-domain conference
   * (multi-tenant isolation).
   */
  ensureSponsorThread: protectedProcedure
    .input(z.object({ sponsorForConferenceId: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.speaker.isOrganizer !== true) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' })
      }
      const conferenceId = await resolveConferenceId()
      const sfc: SponsorFanoutContext | null = await getSponsorFanoutContext(
        input.sponsorForConferenceId,
      )
      // Collapse absent + wrong-conference into NOT_FOUND (no cross-tenant probe).
      if (!sfc || !sfc.conference || sfc.conference._id !== conferenceId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sponsor not found' })
      }
      const conversationId = await ensureSponsorConversation({
        conferenceId,
        sponsorForConferenceId: input.sponsorForConferenceId,
        sponsorName: sfc.sponsorName,
        createdById: ctx.speaker._id,
      })
      return { conversationId }
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
        // Per-user archive (all participants, speakers included) rides this
        // existing procedure.
        archived: input.archived,
      })
    }),

  /**
   * Organizer-only: set a conversation's ticketing status ('open' | 'resolved').
   * A resolved thread drops out of the organizer `active`/`needs-reply` views.
   */
  setStatus: protectedProcedure
    .input(SetStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await loadManageableConversation(
        input.conversationId,
        ctx.speaker,
      )
      await setConversationStatus(conversation._id, input.status)
      return { conversationId: conversation._id, status: input.status }
    }),

  /**
   * Organizer-only: (re)assign or unassign the responsible organizer. A non-null
   * assignee MUST be an organizer (validated against the organizer id set);
   * `null` unassigns.
   */
  setAssignee: protectedProcedure
    .input(SetAssigneeSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await loadManageableConversation(
        input.conversationId,
        ctx.speaker,
      )
      if (input.assigneeId !== null) {
        const organizerIds = await getOrganizerSpeakerIds()
        if (!organizerIds.includes(input.assigneeId)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Assignee must be an organizer',
          })
        }
      }
      await setConversationAssignee(conversation._id, input.assigneeId)

      // ASSIGN NOTIFY (S4): tell the NEW assignee they own this thread — but not
      // when unassigning (null) or self-assigning (an organizer picking up their
      // own thread doesn't need a notification about their own action).
      // `createNotifications` is never-fail, so a failed notify can't fail the
      // (already committed) assignment. The link is the ADMIN thread (assignees
      // are always organizers). The push category maps to `messages` (S4).
      if (input.assigneeId !== null && input.assigneeId !== ctx.speaker._id) {
        await createNotifications([
          {
            recipientId: input.assigneeId,
            conferenceId: conversation.conferenceId,
            notificationType: 'conversation_assigned',
            title: truncateToGraphemeBoundary(
              `Assigned to you: ${conversation.subject}`,
              200,
            ),
            link: conversationLinkPath(conversation, true),
            actorId: ctx.speaker._id,
            ...(conversation.proposalId
              ? { relatedProposalId: conversation.proposalId }
              : {}),
          },
        ])
      }
      return { conversationId: conversation._id, assigneeId: input.assigneeId }
    }),

  /**
   * Organizer-only: set/unset the GLOBAL organizer archive. Archiving hides the
   * thread from organizer views until a NEW message auto-resurfaces it (timestamp
   * semantics); speakers keep seeing it (their archive is per-user via
   * setPreference).
   */
  setArchived: protectedProcedure
    .input(SetArchivedSchema)
    .mutation(async ({ ctx, input }) => {
      const conversation = await loadManageableConversation(
        input.conversationId,
        ctx.speaker,
      )
      // Record WHO archived (S6) for the "Archived by X" audit line.
      await setConversationArchived(
        conversation._id,
        input.archived,
        ctx.speaker._id,
      )
      return { conversationId: conversation._id, archived: input.archived }
    }),
})
