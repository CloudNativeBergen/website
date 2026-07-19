import { z } from 'zod'

/**
 * Zod schemas for the public, token-authed `sponsorMessages` router (messaging
 * G2b). NO schema carries a conversation id — the portal TOKEN is the sole thread
 * selector (the maintainer-locked one-thread-per-sponsor UI), so a portal client
 * can never address another sponsor's thread.
 */

/** Read a sponsor thread by its portal token. */
export const SponsorMessagesListSchema = z.object({
  token: z.string().min(1).max(200),
})

/**
 * Send a sponsor-authored message. `authorName` is validated in the router to be
 * one of the sponsor's contact-person names (STRICT match — see the router), so
 * the loose bound here is only a length guard.
 */
export const SponsorMessagesSendSchema = z.object({
  token: z.string().min(1).max(200),
  // Trim BEFORE the non-empty check so a whitespace-only body can never fan out
  // empty content; interior whitespace is preserved and the 5000-char cap holds
  // (mirrors SendMessageSchema).
  body: z.string().trim().min(1).max(5000),
  authorName: z.string().trim().min(1).max(100),
})
