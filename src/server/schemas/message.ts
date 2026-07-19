import { z } from 'zod'

/**
 * Zod schemas for the `message` tRPC router (messaging M1).
 *
 * NOTE: no schema carries a conferenceId or a speaker id — the conference is
 * resolved from the domain and the actor is always `ctx.speaker._id`, never
 * client input (multi-tenant isolation rule).
 */

/**
 * Keyset cursor. Historically a bare ISO datetime (the `lastMessageAt` /
 * `createdAt` of the last item seen). To totally-order rows that share an exact
 * timestamp it now ALSO accepts the compound form `<iso>~<_id>` — the datetime
 * plus the last row's document id. Both forms are accepted so an old inflight
 * client sending a plain datetime keeps working. Anything else is rejected.
 *
 * A Sanity `_id` never contains `~`, and an ISO datetime never does either, so
 * the FIRST `~` unambiguously splits the two parts.
 */
const CURSOR_MAX = 260

export function parseMessageCursor(cursor: string | undefined): {
  before?: string
  beforeId?: string
} {
  if (!cursor) return {}
  const idx = cursor.indexOf('~')
  if (idx === -1) return { before: cursor }
  return { before: cursor.slice(0, idx), beforeId: cursor.slice(idx + 1) }
}

const isoDateTime = z.string().datetime()

const cursor = z
  .string()
  .max(CURSOR_MAX)
  .refine((v) => {
    const idx = v.indexOf('~')
    const iso = idx === -1 ? v : v.slice(0, idx)
    const id = idx === -1 ? undefined : v.slice(idx + 1)
    // The datetime part must always be a valid ISO datetime; when a compound
    // cursor carries an id, that id must be non-empty.
    if (!isoDateTime.safeParse(iso).success) return false
    if (id !== undefined && id.length === 0) return false
    return true
  }, 'Invalid cursor')
  .optional()

export const ListConversationsSchema = z.object({
  cursor,
  // Inbox view. ORGANIZERS may use any; the router rejects the organizer-only
  // views (`needs-reply` | `mine` | `resolved`) for a non-organizer. Defaults to
  // `active` in the data layer when omitted.
  view: z
    .enum(['active', 'needs-reply', 'mine', 'resolved', 'archived', 'all'])
    .optional(),
})

export const GetConversationSchema = z.object({
  id: z.string().min(1).max(200),
})

export const ListMessagesSchema = z.object({
  conversationId: z.string().min(1).max(200),
  cursor,
})

/**
 * Send a message. Exactly one of three entry points:
 * - an existing `conversationId`, OR
 * - a `proposalId` (auto-creates/looks up the proposal thread), OR
 * - a `subject` with no proposalId (starts a general thread).
 * The router enforces the precedence; the body cap mirrors the schema (≤5000).
 *
 * `recipientSpeakerId` is the speaker an ORGANIZER-initiated general thread is
 * about/with. It is ONLY honored for an organizer (the router rejects it with
 * FORBIDDEN when a non-organizer supplies it) and is REQUIRED when an organizer
 * starts a general thread. Speaker-started threads must not supply it.
 */
export const SendMessageSchema = z.object({
  conversationId: z.string().min(1).max(200).optional(),
  proposalId: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(200).optional(),
  recipientSpeakerId: z.string().min(1).max(200).optional(),
  // Trim BEFORE the non-empty check so a whitespace-only body (' ', '\n\n')
  // can never fan out empty content; interior whitespace is preserved and the
  // 5000-char cap still applies (batch A / A6).
  body: z.string().trim().min(1).max(5000),
})

export const SetPreferenceSchema = z
  .object({
    conversationId: z.string().min(1).max(200),
    muted: z.boolean().optional(),
    emailOverride: z.enum(['default', 'on', 'off']).optional(),
    // Per-user archive for this participant (the speaker/all-participant archive
    // rides this existing procedure). true archives, false un-archives.
    archived: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.muted !== undefined ||
      v.emailOverride !== undefined ||
      v.archived !== undefined,
    {
      message: 'Provide at least one of muted, emailOverride, or archived',
    },
  )

/** Organizer-only: set a conversation's ticketing status. */
export const SetStatusSchema = z.object({
  conversationId: z.string().min(1).max(200),
  status: z.enum(['open', 'resolved']),
})

/**
 * Organizer-only: (re)assign or unassign the responsible organizer. `null`
 * unassigns; a non-null id must resolve to an organizer (validated in the
 * router against the organizer id set).
 */
export const SetAssigneeSchema = z.object({
  conversationId: z.string().min(1).max(200),
  assigneeId: z.string().min(1).max(200).nullable(),
})

/** Organizer-only: set/unset the GLOBAL organizer archive for a conversation. */
export const SetArchivedSchema = z.object({
  conversationId: z.string().min(1).max(200),
  archived: z.boolean(),
})

/**
 * Unread message counts keyed by proposal id (speaker-journey badges, V2b). The
 * caller supplies the proposal ids currently on screen; the router only ever
 * reads the caller's OWN notifications, so arbitrary ids leak nothing. The set is
 * capped to keep the underlying `link in $links` bounded.
 */
export const UnreadByProposalIdsSchema = z.object({
  proposalIds: z.array(z.string().min(1).max(200)).max(200),
})
