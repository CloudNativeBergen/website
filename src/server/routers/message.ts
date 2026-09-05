import { TRPCError } from '@trpc/server'
import {
  router,
  protectedProcedure,
  organizerProcedure,
  resolveConferenceId,
} from '@/server/trpc'
import { isOrganizerForOrg } from '@/lib/authz/organizer'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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
  getConversationWithPreference,
  getConversationParticipants,
  listMessages,
  addMessage,
  ensureProposalConversation,
  ensureSponsorConversation,
  createGeneralConversation,
  getProposalForConversation,
  setConversationPreference,
  setConversationStatus,
  setConversationAssignee,
  claimConversationIfUnassigned,
  setConversationArchived,
  getConversationViewCounts,
  getUnreadCountsByProposalIds,
  canAccessConversation,
} from '@/lib/messaging/sanity'
import {
  getSponsorFanoutContext,
  type SponsorFanoutContext,
} from '@/lib/messaging/sponsor'
import { speakerHasStandingInConference } from '@/lib/messaging/standing'
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
  ConversationPreference,
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

// E9 (go-live gate): the recipient standing check now lives in
// `@/lib/messaging/standing` and is ORG-SCOPED — an organizer of another
// TENANT's edition no longer counts as standing here (the pre-#614 "organizer of
// any edition = global access" premise no longer holds). Same-org cross-edition
// organizers and talk-holders still qualify. Extracted to its own module so this
// fix merges cleanly with the parallel messaging-authz work that owns this
// router's gates. See `speakerHasStandingInConference` there for the full
// rationale and the legacy (org-less conference) bridge.

/**
 * PER-REQUEST conversation cache for the two READ procedures.
 *
 * The workspace's client uses `httpBatchLink`, so one poll tick delivers
 * `getConversation` and `listMessages` in a SINGLE HTTP request — one
 * `createTRPCContext`, one `ctx.req` object — and each of them independently
 * re-read the same conversation document. Keying on `ctx.req` (never on the
 * session, never on a client-supplied value) makes the second one free while
 * keeping the cache strictly inside one request: a `WeakMap` entry dies with the
 * request object, so nothing is shared between requests, users or tenants.
 *
 * AUTHORIZATION IS NOT CACHED. Only the DOCUMENT is. Every procedure still runs
 * `canAccessConversation(conversation, ctx.speaker)` on the result, so a cache
 * hit decides nothing about access — and the key includes the caller's speaker id
 * anyway, so one caller's load can never be handed to another.
 *
 * READS ONLY, deliberately. MUTATIONS (`send`, `setPreference`, and
 * {@link loadManageableConversation}) keep calling `getConversationById` directly,
 * so a write path can never act on a document that was read earlier in the same
 * request. (`httpBatchLink` sends queries and mutations as separate HTTP requests
 * regardless, so they never share a `ctx.req` in the first place — this is the
 * belt to that braces.) A REJECTED load is evicted rather than memoized.
 */
const conversationsByRequest = new WeakMap<
  object,
  Map<
    string,
    Promise<{
      conversation: ConversationWithContext | null
      preference: ConversationPreference
    }>
  >
>()

function loadConversationForRead(
  ctx: { req?: unknown; speaker: AccessSpeaker },
  id: string,
): Promise<{
  conversation: ConversationWithContext | null
  preference: ConversationPreference
}> {
  const speakerId = ctx.speaker._id
  const requestKey =
    typeof ctx.req === 'object' && ctx.req !== null ? ctx.req : null
  if (!requestKey) return getConversationWithPreference(id, speakerId)
  let byKey = conversationsByRequest.get(requestKey)
  if (!byKey) {
    byKey = new Map()
    conversationsByRequest.set(requestKey, byKey)
  }
  const cacheKey = `${speakerId}::${id}`
  const hit = byKey.get(cacheKey)
  if (hit) return hit
  const pending = getConversationWithPreference(id, speakerId)
  byKey.set(cacheKey, pending)
  pending.catch(() => byKey.delete(cacheKey))
  return pending
}

/**
 * Load a conversation for an ORGANIZER-ONLY management mutation (status /
 * assignee / archive). Collapses absent, non-organizer, and inaccessible into a
 * single NOT_FOUND — no existence oracle, and the ticketing capability itself is
 * not revealed to a non-organizer participant (A3 semantics).
 *
 * ORG-SCOPED (B2, #642): the organizer gate keys on {@link isOrganizerForOrg}
 * against the CONVERSATION'S OWN org (`conferenceOrgId`), not the deprecated
 * global `speaker.isOrganizer` — so a cross-tenant organizer gets NOT_FOUND. This
 * already implies `canAccessConversation` (which uses the same org-scoped check),
 * but both are asserted per the design.
 */
async function loadManageableConversation(
  conversationId: string,
  speaker: AccessSpeaker,
): Promise<ConversationWithContext> {
  const conversation = await getConversationById(conversationId)
  if (
    !conversation ||
    !isOrganizerForOrg(speaker, conversation.conferenceOrgId ?? null) ||
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
  listConversations: organizerProcedure
    .input(ListConversationsSchema)
    .query(async ({ ctx, input }) => {
      const conferenceId = await resolveConferenceId()
      // ORG-SCOPED (B2, #642): only an organizer OF THIS domain's org gets the
      // all-conversations inbox; a cross-tenant organizer sees only their own.
      const isOrganizer = ctx.isOrgOrganizer
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
        // The authz waist ALREADY resolved the request's org from the domain
        // conference; passing it stops the organizer-id read resolving the same
        // conference a second time. `null` (unresolvable) keeps the fail-closed
        // empty organizer set — see `organizerIdsForRequest`.
        orgId: ctx.orgId,
      })
    }),

  /**
   * Conversation COUNTS per inbox tab for the caller's audience (S7). Organizers
   * get every tab ({ active, needsReply, mine, resolved, archived }); speakers
   * get { active, archived }. ONE bounded GROQ round trip over this conference's
   * conversation set, reusing the same predicates the list views apply — meant to
   * accompany the first inbox page, not to be polled hot.
   */
  viewCounts: organizerProcedure.query(async ({ ctx }) => {
    const conferenceId = await resolveConferenceId()
    return getConversationViewCounts({
      speakerId: ctx.speaker._id,
      isOrganizer: ctx.isOrgOrganizer,
      conferenceId,
      // Resolved by the waist for this request — see `listConversations`.
      orgId: ctx.orgId,
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

  /**
   * A single conversation + participants + the caller's own preference.
   *
   * TWO round trips, not three: the conversation and the caller's preference
   * arrive in one object projection ({@link getConversationWithPreference}), and
   * the participant roster is the second — on the CDN, since it is only display
   * names and avatars.
   */
  getConversation: protectedProcedure
    .input(GetConversationSchema)
    .query(async ({ ctx, input }) => {
      const { conversation, preference } = await loadConversationForRead(
        ctx,
        input.id,
      )
      // Return NOT_FOUND for both "absent" and "access denied" so that, with
      // deterministic proposal-thread ids, the response never reveals whether a
      // thread the caller can't see exists (batch A / A3).
      if (!conversation || !canAccessConversation(conversation, ctx.speaker)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Conversation not found',
        })
      }
      const participants = await getConversationParticipants(conversation)
      return { conversation, participants, preference }
    }),

  /** A conversation's messages, newest first, keyset-paginated. Authz-checked. */
  listMessages: protectedProcedure
    .input(ListMessagesSchema)
    .query(async ({ ctx, input }) => {
      // Shares the per-request conversation load with `getConversation`, which
      // the client batches into the SAME HTTP request; the access check below is
      // still this procedure's own and runs on every call.
      const { conversation } = await loadConversationForRead(
        ctx,
        input.conversationId,
      )
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
   * An ORGANIZER send also CLAIMS an unowned thread (B1b) — see the
   * claim-on-reply block below — and reports it back as `claimed` so the client
   * can say so out loud.
   *
   * `recipientSpeakerId` targets the subject speaker of an ORGANIZER-initiated
   * general thread: it is FORBIDDEN for a non-organizer, and REQUIRED (and must
   * resolve to a real speaker) when an organizer starts a general thread.
   */
  send: organizerProcedure
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
      // ORG-SCOPED (B2, #642): organizer capabilities (naming a subject speaker,
      // opening any proposal thread, not reopening on reply) require organizer
      // standing IN THIS domain's org, not the deprecated global flag.
      const isOrganizer = ctx.isOrgOrganizer

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
        // TENANT-SCOPED read (#616): the conference predicate lives IN the
        // query, so a foreign proposal id already comes back null here; the
        // compare below stays as the second, independent control.
        const proposal = await getProposalForConversation(
          input.proposalId,
          conferenceId,
        )
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

      // CLAIM-ON-REPLY (B1b): an ORGANIZER who engages with a thread nobody owns
      // takes ownership of it. Assignment used to be reachable only through the
      // explicit Assign menu, so in practice threads got answered and stayed
      // unowned — which is precisely the state the stale nudge then fans out to
      // everybody, and the state in which two organizers answer the same person
      // twice. The three no-claim cases are: a NON-organizer author (a speaker
      // can never become an assignee), a thread that ALREADY has an assignee
      // (never steal — `claimConversationIfUnassigned` enforces this atomically,
      // the projection here is only a cheap pre-filter), and a lost race.
      //
      // Deliberately NOT inside `runAfterResponse`: the client is told whether
      // it claimed, so the write has to have happened before we return. It also
      // must never turn a delivered message into a failed send — the message is
      // already committed above, so a claim failure is logged and reported as
      // "did not claim", exactly like the never-fail notification contract.
      let claimed = false
      if (isOrganizer && !conversation.assignedTo) {
        try {
          claimed = await claimConversationIfUnassigned(
            conversation._id,
            actorId,
          )
        } catch (error) {
          console.error(
            `message.send: claim-on-reply failed for conversation ${conversation._id}:`,
            error,
          )
        }
      }

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

      // `claimed` is the ONLY signal the UI has that ownership just moved: the
      // assignee badge re-renders from an invalidated query, which is silent, so
      // the composer surfaces an ephemeral toast off this flag instead.
      return { conversationId: conversation._id, message, claimed }
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
  ensureSponsorThread: organizerProcedure
    .input(z.object({ sponsorForConferenceId: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      // ORG-SCOPED (B2, #642): sponsor threads are organizer-only, gated on
      // organizer standing IN THIS domain's org (not the deprecated global flag).
      if (!ctx.isOrgOrganizer) {
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
