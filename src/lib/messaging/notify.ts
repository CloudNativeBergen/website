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
import {
  truncateToGraphemeBoundary,
  conversationEmailLinkPath,
  ORGANIZERS_LABEL,
} from './links'
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

/**
 * Absolute deep link for an EMAIL reply button (S8). Uses
 * {@link conversationEmailLinkPath} — the dedicated thread pages
 * (/admin/messages/<id>, /cfp/messages/<id>) rather than the HUB/PUSH proposal
 * `#messages` fragment, because a message email is often opened logged-out and
 * the auth redirect drops URL fragments. HUB/PUSH links keep using
 * `conversationLinkPath` (unchanged).
 */
function absoluteEmailLink(
  conversation: ConversationWithContext,
  isOrganizer: boolean,
  conference: Conference,
): string {
  const path = conversationEmailLinkPath(conversation, isOrganizer)
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
 * - EMAIL (individual recipients): to non-muted recipients whose EFFECTIVE email
 *   pref is ON. A per-conversation override 'on' always wins (explicit opt-in);
 *   otherwise the AUDIENCE-DEPENDENT default applies (S1):
 *     - SPEAKER recipient  → ON unless `messagingEmailDefault` is explicitly
 *       false (absent-means-on, unchanged);
 *     - ORGANIZER recipient → OFF unless `messagingEmailDefault` is explicitly
 *       true (organizers must OPT IN — no more per-message firehose to every
 *       organizer). Mute still dominates (filtered out above). Email reply links
 *       point at the dedicated thread pages (S8).
 * - EMAIL (org-contact copy): for SPEAKER-authored messages ONLY, ONE shared
 *   copy to the conference's `contactEmail` (fallback `cfpEmail`; skipped if
 *   neither) addressed to the org team, organizer-variant copy, admin reply
 *   link. MUTE-INDEPENDENT (like Slack — it's the shared org record), and
 *   independent of any individual organizer's opt-in.
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

    // FIRST-CONTACT detection (S9c): a SPEAKER recipient gets a warmer subject +
    // body ONLY when this is the thread's FIRST message AND an organizer authored
    // it (an organizer reaching out). Cheap count() — one message ⇒ the one we
    // just added ⇒ first. Only needed when an organizer authored (otherwise no
    // speaker recipient qualifies for the warmer variant, and the org-contact
    // copy keeps the standard form regardless).
    let isFirstContact = false
    if (authorIsOrganizer) {
      const messageCount = await clientReadUncached.fetch<number>(
        `count(*[_type == "message" && conversation._ref == $conversationId])`,
        { conversationId: conversation._id },
        { cache: 'no-store' },
      )
      isFirstContact = messageCount === 1
    }

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
        // DIRECT title variant (S10c): the collapse writer compares this to the
        // recipient id to pick "Direct message from ..." for the addressee.
        ...(conversation.subjectSpeakerId
          ? { subjectSpeakerId: conversation.subjectSpeakerId }
          : {}),
      }))
      await upsertMessageNotifications(items)

      // EMAIL (individual recipients): effective default is AUDIENCE-DEPENDENT
      // (S1b). A per-conversation 'on' override always wins (explicit opt-in);
      // otherwise a SPEAKER is on unless `messagingEmailDefault === false`
      // (absent-means-on) while an ORGANIZER is OFF unless
      // `messagingEmailDefault === true` (must opt in). Mute already excluded
      // above.
      const emailRecipients: MessageEmailRecipient[] = []
      for (const id of active) {
        const sp = speakers.get(id)
        if (!sp?.email) continue
        const recipientIsOrganizer = organizerSet.has(id)
        const override = prefs.get(id)?.emailOverride ?? 'default'
        const defaultOn = recipientIsOrganizer
          ? sp.messagingEmailDefault === true
          : sp.messagingEmailDefault !== false
        const wantsEmail =
          override === 'on' || (override === 'default' && defaultOn)
        if (!wantsEmail) continue
        emailRecipients.push({
          email: sp.email,
          name: sp.name ?? 'there',
          isOrganizer: recipientIsOrganizer,
          replyUrl: absoluteEmailLink(
            conversation,
            recipientIsOrganizer,
            conference,
          ),
          // Warmer first-contact copy for a speaker being reached out to (S9c).
          firstContact: isFirstContact && !recipientIsOrganizer,
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

    // ORG-CONTACT COPY (S1a) + SLACK: SPEAKER-authored messages only. Both are
    // MUTE-INDEPENDENT shared-org records, so they live OUTSIDE the recipient
    // loop above and are not gated by any individual's prefs.
    if (!authorIsOrganizer) {
      // ONE shared copy of the message to the org's contact inbox (prefer
      // `contactEmail`, fall back to `cfpEmail`; skip if neither is set),
      // organizer-variant copy with an admin reply link — the shared org record
      // replacing the old per-organizer firehose.
      const orgContactEmail = conference.contactEmail || conference.cfpEmail
      if (orgContactEmail) {
        await sendMessageEmails(
          [
            {
              email: orgContactEmail,
              name: ORGANIZERS_LABEL,
              isOrganizer: true,
              replyUrl: absoluteEmailLink(conversation, true, conference),
              // The org-contact copy keeps the STANDARD form (S9c).
              firstContact: false,
            },
          ],
          { authorName, subject: conversation.subject, excerpt, conference },
        )
      }

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
