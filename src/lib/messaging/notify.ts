import 'server-only'
import {
  upsertMessageNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { notifyNewSpeakerMessage } from '@/lib/slack/notify'
import type { MessageNotificationInput } from '@/lib/notification/types'
import type { Conference } from '@/lib/conference/types'
import {
  resolveRecipients,
  getConversationPreferencesFor,
  conversationLinkPath,
} from './sanity'
import { truncateToGraphemeBoundary } from './links'
import { sendMessageEmails, type MessageEmailRecipient } from './email'
import type { ConversationWithContext, Message } from './types'

/** How many characters of the message body ride into the notification/email. */
const EXCERPT_LENGTH = 140

/** A single-line excerpt of a message body, capped and ellipsised. */
export function messageExcerpt(body: string, max = EXCERPT_LENGTH): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  // Grapheme-safe cut so an emoji straddling the cap can't leave a lone
  // surrogate (�) at the boundary of the notification/email excerpt.
  return flat.length > max
    ? `${truncateToGraphemeBoundary(flat, max).trimEnd()}…`
    : flat
}

function absoluteLink(
  conversation: ConversationWithContext,
  isOrganizer: boolean,
  conference: Conference,
): string {
  const path = conversationLinkPath(conversation, isOrganizer)
  const domain = conference.domains?.[0]
  return domain ? `https://${domain}${path}` : path
}

interface SpeakerRow {
  _id: string
  name?: string
  email?: string
  messagingEmailDefault?: boolean
}

/**
 * Fan a newly-added message out across every channel. Called AFTER a successful
 * `addMessage`, and wrapped in the never-fail contract: any failure here is
 * caught and logged — it must never fail the (already committed) message write.
 *
 * Channels:
 * - HUB: ONE collapsed `message_received` notification per (non-muted
 *   recipient, conversation) — every new message re-surfaces it via
 *   `upsertMessageNotifications` (M5) with a PER-RECIPIENT link (organizers →
 *   /admin, speakers → /cfp). Web push rides along inside the upsert
 *   (category `messages`).
 * - EMAIL: to non-muted recipients whose effective email pref is ON: override
 *   'on', or 'default' + speaker-level default. The speaker-level default is
 *   ENABLED unless `messagingEmailDefault` is explicitly false (M4).
 * - SLACK: only when the author is NOT an organizer (speaker-authored).
 */
export async function notifyNewMessage({
  conversation,
  message,
  authorId,
  conference,
}: {
  conversation: ConversationWithContext
  message: Message
  authorId: string
  conference: Conference
}): Promise<void> {
  try {
    const organizerIds = await getOrganizerSpeakerIds()
    const organizerSet = new Set(organizerIds)
    const authorIsOrganizer = organizerSet.has(authorId)
    const recipientIds = resolveRecipients(conversation, authorId, organizerIds)
    const excerpt = messageExcerpt(message.body)

    // One read for every speaker we need to name / email (author + recipients).
    const speakerIds = Array.from(new Set([authorId, ...recipientIds]))
    const speakerRows = await clientReadUncached.fetch<SpeakerRow[]>(
      `*[_type == "speaker" && _id in $ids]{ _id, name, email, messagingEmailDefault }`,
      { ids: speakerIds },
      { cache: 'no-store' },
    )
    const speakers = new Map<string, SpeakerRow>(
      (speakerRows ?? []).map((s) => [s._id, s]),
    )
    const authorName = speakers.get(authorId)?.name ?? 'Someone'

    if (recipientIds.length > 0) {
      const prefs = await getConversationPreferencesFor(
        conversation._id,
        recipientIds,
      )
      // Muted participants get NO notifications on any channel.
      const active = recipientIds.filter((id) => !prefs.get(id)?.muted)

      // HUB (+ push): the per-conversation collapse upsert derives the title
      // from the accumulated unread count; we pass the raw ingredients and the
      // per-recipient audience link.
      const items: MessageNotificationInput[] = active.map((id) => ({
        recipientId: id,
        conversationId: conversation._id,
        conferenceId: conversation.conferenceId,
        authorName,
        subject: conversation.subject,
        message: excerpt,
        link: conversationLinkPath(conversation, organizerSet.has(id)),
        actorId: authorId,
        ...(conversation.proposalId
          ? { relatedProposalId: conversation.proposalId }
          : {}),
      }))
      await upsertMessageNotifications(items)

      // EMAIL: on unless the recipient opted out (speaker default or override).
      const emailRecipients: MessageEmailRecipient[] = []
      for (const id of active) {
        const sp = speakers.get(id)
        if (!sp?.email) continue
        const override = prefs.get(id)?.emailOverride ?? 'default'
        // ABSENT-MEANS-ENABLED (M4): only an explicit `false` on the speaker
        // doc disables the default-path email; 'off'/mute still win above.
        const wantsEmail =
          override === 'on' ||
          (override === 'default' && sp.messagingEmailDefault !== false)
        if (!wantsEmail) continue
        emailRecipients.push({
          email: sp.email,
          name: sp.name ?? 'there',
          replyUrl: absoluteLink(
            conversation,
            organizerSet.has(id),
            conference,
          ),
        })
      }
      if (emailRecipients.length > 0) {
        await sendMessageEmails(emailRecipients, {
          authorName,
          subject: conversation.subject,
          excerpt,
          conference,
        })
      }
    }

    // SLACK: speaker-authored messages only.
    if (!authorIsOrganizer) {
      await notifyNewSpeakerMessage(
        {
          authorName,
          subject: conversation.subject,
          excerpt,
          adminPath: conversationLinkPath(conversation, true),
        },
        conference,
      )
    }
  } catch (error) {
    console.error('Failed to fan out new-message notifications:', error)
  }
}
