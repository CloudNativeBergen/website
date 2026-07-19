import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc'
import { runAfterResponse } from '@/server/runAfterResponse'
import {
  SponsorMessagesListSchema,
  SponsorMessagesSendSchema,
} from '../schemas/sponsorMessages'
import {
  validateSponsorMessagingToken,
  getSponsorFanoutContext,
} from '@/lib/messaging/sponsor'
import {
  sponsorConversationId,
  ensureSponsorConversation,
  getConversationById,
  listMessages,
  addMessage,
} from '@/lib/messaging/sanity'
import { notifySponsorMessage } from '@/lib/messaging/notify'

/**
 * Per-token sliding-window rate limiter (messaging G2b). The public portal
 * procedures have NO session to throttle on, so the TOKEN is the key. Two
 * limiters: token validation (cheap GROQ, generous) and sends (fan out to Slack
 * + N contact emails + hub, so tight). Module-memory, so PER-INSTANCE on
 * serverless — a burst spread across instances sees a higher effective ceiling,
 * acceptable here for the same reason as `message.send`'s limiter (the email and
 * Slack providers rate-limit further downstream). The map is size-capped so it
 * can never grow without bound.
 */
const VALIDATE_WINDOW_MS = 60_000
const VALIDATE_MAX_IN_WINDOW = 30
const SEND_WINDOW_MS = 60_000
const SEND_MAX_IN_WINDOW = 5
const MAX_RATE_ENTRIES = 10_000

function makeLimiter(windowMs: number, maxInWindow: number) {
  const recent = new Map<string, number[]>()
  return function claim(token: string): boolean {
    const now = Date.now()
    const cutoff = now - windowMs
    const hits = (recent.get(token) ?? []).filter((t) => t > cutoff)
    recent.delete(token)
    if (hits.length >= maxInWindow) {
      recent.set(token, hits)
      return false
    }
    hits.push(now)
    if (recent.size >= MAX_RATE_ENTRIES) {
      const oldest = recent.keys().next().value
      if (oldest !== undefined) recent.delete(oldest)
    }
    recent.set(token, hits)
    return true
  }
}

const claimValidateSlot = makeLimiter(
  VALIDATE_WINDOW_MS,
  VALIDATE_MAX_IN_WINDOW,
)
const claimSendSlot = makeLimiter(SEND_WINDOW_MS, SEND_MAX_IN_WINDOW)

const TOO_MANY = new TRPCError({
  code: 'TOO_MANY_REQUESTS',
  message: 'Too many requests. Please wait a moment and try again.',
})
// A single NOT_FOUND for an absent/invalid token — no enumeration oracle.
const NOT_FOUND = new TRPCError({
  code: 'NOT_FOUND',
  message: 'This link is invalid or has expired.',
})

/**
 * Public sponsor↔organizer messaging (messaging G2b). The sponsor side is
 * authed ONLY by the portal token (never a session): every procedure validates
 * the token, resolves the sponsorForConference (the thread selector), and never
 * accepts a conversation id from the client — the token IS the thread.
 */
export const sponsorMessagesRouter = router({
  /**
   * The sponsor thread for a token: its messages (bounded, newest first — the
   * portal reverses for display) plus the contact-person names that populate the
   * author-name picker. Returns an empty thread when no message has been posted
   * yet (the thread is created lazily on the first send).
   */
  list: publicProcedure
    .input(SponsorMessagesListSchema)
    .query(async ({ input }) => {
      if (!claimValidateSlot(input.token)) throw TOO_MANY
      const ctx = await validateSponsorMessagingToken(input.token)
      if (!ctx) throw NOT_FOUND

      const conversationId = sponsorConversationId(ctx.sfcId)
      // Read messages only if the thread exists yet (no lazy create on a read).
      const existing = await getConversationById(conversationId)
      const messages = existing ? await listMessages({ conversationId }) : []

      return {
        sponsorName: ctx.sponsorName,
        subject: existing?.subject ?? ctx.sponsorName,
        // Author-picker options (names only — the portal never needs emails).
        contactNames: ctx.contactPersons.map((c) => c.name),
        messages: messages.map((m) => ({
          _id: m._id,
          body: m.body,
          createdAt: m.createdAt,
          // Sponsor authors carry a snapshot name; organizer authors resolve to
          // the collective 'Organizers' label (the portal never names an
          // individual organizer).
          authorName: m.authorName ?? null,
          fromSponsor: Boolean(m.authorSponsorId),
        })),
      }
    }),

  /**
   * Post a sponsor-authored message. Validates the token + rate limit, requires
   * `authorName` to STRICTLY match one of the sponsor's contact-person names
   * (chosen over free-text so a portal sender can only attribute a message to a
   * real, organizer-visible contact — no spoofed identities on the thread), then
   * ensures the single sponsor thread exists and appends the message. NO
   * conversation id is accepted — the token selects the thread.
   */
  send: publicProcedure
    .input(SponsorMessagesSendSchema)
    .mutation(async ({ input }) => {
      if (!claimSendSlot(input.token)) throw TOO_MANY
      const ctx = await validateSponsorMessagingToken(input.token)
      if (!ctx) throw NOT_FOUND

      // STRICT author-name match: the sender must pick a real contact person.
      const match = ctx.contactPersons.find((c) => c.name === input.authorName)
      if (!match) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Select your name from the contact list before sending.',
        })
      }

      const conversationId = await ensureSponsorConversation({
        conferenceId: ctx.conferenceId,
        sponsorForConferenceId: ctx.sfcId,
        sponsorName: ctx.sponsorName,
      })

      const message = await addMessage({
        conversationId,
        sponsorAuthor: {
          sponsorForConferenceId: ctx.sfcId,
          authorName: match.name,
        },
        body: input.body,
      })

      // Detach the (never-fail) fan-out from the response path (mirrors
      // message.send): the message is already committed and returned below.
      const conversation = await getConversationById(conversationId)
      if (conversation) {
        const fanoutCtx = await getSponsorFanoutContext(ctx.sfcId)
        if (fanoutCtx) {
          runAfterResponse(() =>
            notifySponsorMessage({
              conversation,
              message,
              sfc: fanoutCtx,
              // undefined ⇒ sponsor-authored direction.
            }),
          )
        }
      }

      return {
        message: {
          _id: message._id,
          body: message.body,
          createdAt: message.createdAt,
          authorName: match.name,
          fromSponsor: true,
        },
      }
    }),
})
