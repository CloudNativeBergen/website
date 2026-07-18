import { z } from 'zod'

/**
 * Zod schemas for the `message` tRPC router (messaging M1).
 *
 * NOTE: no schema carries a conferenceId or a speaker id — the conference is
 * resolved from the domain and the actor is always `ctx.speaker._id`, never
 * client input (multi-tenant isolation rule).
 */

/** Cursor pages use the `lastMessageAt` / `createdAt` of the last item seen. */
const cursor = z.string().datetime().optional()

export const ListConversationsSchema = z.object({
  cursor,
})

export const GetConversationSchema = z.object({
  id: z.string().min(1).max(200),
})

export const ListMessagesSchema = z.object({
  conversationId: z.string().min(1).max(200),
  cursor,
})

/**
 * Send a message. Exactly one of two entry points:
 * - an existing `conversationId`, OR
 * - a `proposalId` (auto-creates/looks up the proposal thread), OR
 * - a `subject` with no proposalId (starts a general thread).
 * The router enforces the precedence; the body cap mirrors the schema (≤5000).
 */
export const SendMessageSchema = z.object({
  conversationId: z.string().min(1).max(200).optional(),
  proposalId: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000),
})

export const SetPreferenceSchema = z
  .object({
    conversationId: z.string().min(1).max(200),
    muted: z.boolean().optional(),
    emailOverride: z.enum(['default', 'on', 'off']).optional(),
  })
  .refine((v) => v.muted !== undefined || v.emailOverride !== undefined, {
    message: 'Provide at least one of muted or emailOverride',
  })
