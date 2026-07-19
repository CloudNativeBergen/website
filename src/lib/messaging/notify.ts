import 'server-only'
import {
  upsertMessageNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import { clientReadUncached } from '@/lib/sanity/client'
import {
  notifyNewSpeakerMessage,
  notifySponsorMessage as notifySponsorMessageSlack,
} from '@/lib/slack/notify'
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
import { sendSponsorMessageEmails } from './sponsorEmail'
import { createSponsorActivity } from '@/lib/sponsor-crm/activity'
import { buildPortalUrl } from '@/lib/sponsor-crm/registration'
import type { SponsorFanoutContext } from './sponsor'
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
    // ACCESS vs ROUTING split (TEAMS-2). `organizerSet` is the FULL organizer
    // set and is used ONLY to CLASSIFY identities — whether the author is an
    // organizer, whether a recipient is an organizer (audience-dependent email
    // default + link variant), whether any recipient is a speaker. That is an
    // access/participant question and MUST stay the whole organizer set.
    const organizerIds = await getOrganizerSpeakerIds()
    const organizerSet = new Set(organizerIds)
    const authorIsOrganizer = organizerSet.has(authorId)
    // ROUTING: the `organizers` group party is expanded for NOTIFICATION
    // RECIPIENTS through the `cfp` team (proposal + general speaker threads) —
    // all organizers when it is not configured. Speaker participants are
    // `speaker` parties and are unaffected by this; only WHICH organizers get
    // the fan-out narrows. Every routed id is a real organizer, so the
    // classification above still resolves it correctly.
    const routedOrganizerIds = await resolveRoutedOrganizerIds({
      conferenceId: conversation.conferenceId,
      teamKey: 'cfp',
    })
    const recipientIds = resolveRecipients(
      conversation,
      authorId,
      routedOrganizerIds,
    )
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
    // just added ⇒ first. Only the warmer SPEAKER-recipient variant consumes it,
    // so skip the read entirely unless an organizer authored AND at least one
    // recipient is a non-organizer (speaker) — on an organizer→organizer-only
    // fan-out nothing could ever read `isFirstContact` (V1-r3a).
    let isFirstContact = false
    const hasSpeakerRecipient = recipientIds.some((id) => !organizerSet.has(id))
    if (authorIsOrganizer && hasSpeakerRecipient) {
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

/**
 * Fan a new SPONSOR-thread message out (messaging G2b). A sibling of
 * {@link notifyNewMessage} — the sponsor thread's channel matrix differs enough
 * (no speaker emails, sponsor-side emails via `sponsorEmail`, Slack on the SALES
 * channel, a sponsorActivity row) that it is its own orchestrator rather than a
 * branch inside the speaker fan-out — but it REUSES the same primitives
 * (`upsertMessageNotifications`, bounded-concurrency email, `createSponsorActivity`).
 *
 * Direction is decided by `authorOrganizerId`:
 *
 * SPONSOR-authored (`authorOrganizerId` undefined):
 * - HUB (+push): one collapsed `message_received` per organizer, title
 *   "New message from <authorName> (Sponsor) — <subject>", admin deep link.
 * - SLACK: the SALES channel ("💬 New sponsor message").
 * - sponsorActivity: a `message` row (system-authored).
 * - NO speaker emails, NO contact emails.
 *
 * ORGANIZER-authored (`authorOrganizerId` set):
 * - EMAIL: every contact person, from the conference `sponsorEmail`, deep-linked
 *   to the sponsor PORTAL (`#messages`) — the sponsor's only messaging surface.
 * - HUB (+push): the OTHER organizers (the author is excluded, mirroring the
 *   actor-exclusion of the speaker fan-out).
 * - sponsorActivity: a `message` row attributed to the acting organizer.
 * - NO Slack.
 *
 * PREFERENCES: `conversationPreference` (mute / email override) applies to the
 * ORGANIZER participants exactly as in {@link notifyNewMessage}. SPONSORS have no
 * preference documents (no speaker id to key one on) — they always receive the
 * email; documented here as the deliberate asymmetry.
 *
 * HUB-ROUTING (TEAMS-2): organizer hub notifications route to the `sponsors`
 * team (via {@link resolveRoutedOrganizerIds}), falling back to ALL organizers
 * when that team is not configured — see the recipient resolution below.
 *
 * NEVER-FAIL: every channel is wrapped so a failure can't fail the (already
 * committed) message write, identical to {@link notifyNewMessage}.
 */
export async function notifySponsorMessage({
  conversation,
  message,
  sfc,
  authorOrganizerId,
}: {
  conversation: ConversationWithContext
  message: Message
  sfc: SponsorFanoutContext
  /** The acting organizer id for an ORG-authored message; undefined ⇒ sponsor. */
  authorOrganizerId?: string
}): Promise<void> {
  try {
    const conference = sfc.conference
    if (!conference) return
    const excerpt = messageExcerpt(message.body)
    const subject = conversation.subject
    const adminLink = conversationLinkPath(conversation, true)

    // TEAMS-2: sponsor-thread message fan-out routes to the `sponsors` team
    // (all organizers when it is not configured — the shared fallback). This is
    // a PURE recipient set here (author exclusion is applied below via
    // `authorOrganizerId`), so unlike the speaker fan-out there is no
    // classification use to keep on the full organizer set.
    const organizerIds = await resolveRoutedOrganizerIds({
      conferenceId: conversation.conferenceId,
      teamKey: 'sponsors',
    })

    if (authorOrganizerId === undefined) {
      // ---- SPONSOR-authored ------------------------------------------------
      const authorName = message.authorName ?? sfc.sponsorName
      // HUB (+push) to ALL organizers. Sponsor authors have no speaker id, so
      // there is no actor to exclude and no `actorId` on the input. The
      // "(Sponsor)" suffix on the author name yields the required title
      // "New message from <authorName> (Sponsor) — <subject>".
      const items: MessageNotificationInput[] = organizerIds.map((id) => ({
        recipientId: id,
        conversationId: conversation._id,
        conferenceId: conversation.conferenceId,
        authorName: `${authorName} (Sponsor)`,
        subject,
        message: excerpt,
        link: adminLink,
      }))
      await upsertMessageNotifications(items)

      // SLACK: sales channel.
      await notifySponsorMessageSlack(
        {
          authorName,
          sponsorName: sfc.sponsorName,
          excerpt,
          adminPath: adminLink,
        },
        conference,
      )

      // sponsorActivity: a `message` row (system-authored — no organizer acted).
      await createSponsorActivity(
        sfc.sfcId,
        'message',
        `Sponsor message from ${authorName}: ${excerpt}`,
        'system',
      )
      return
    }

    // ---- ORGANIZER-authored ------------------------------------------------
    // Resolve the acting organizer's display name for the hub title + activity.
    const authorRow = await clientReadUncached.fetch<{ name?: string } | null>(
      `*[_type == "speaker" && _id == $id][0]{ name }`,
      { id: authorOrganizerId },
      { cache: 'no-store' },
    )
    const authorName = authorRow?.name ?? 'Organizer'

    // EMAIL every contact person from the `sponsorEmail` from-address, linking to
    // the sponsor portal (`#messages`). Sponsors have no preferences → all get it.
    if (sfc.contactPersons.length > 0 && sfc.registrationToken) {
      const domain = conference.domains?.[0]
      const portalUrl = domain
        ? `${buildPortalUrl(`https://${domain}`, sfc.registrationToken)}#messages`
        : `${buildPortalUrl('', sfc.registrationToken)}#messages`
      await sendSponsorMessageEmails(
        sfc.contactPersons.map((c) => ({ email: c.email, name: c.name })),
        { authorName, subject, excerpt, portalUrl, conference },
      )
    }

    // HUB (+push) to the OTHER organizers (exclude the author — actor exclusion),
    // respecting each recipient's mute preference.
    const otherOrganizerIds = organizerIds.filter(
      (id) => id !== authorOrganizerId,
    )
    if (otherOrganizerIds.length > 0) {
      const prefs = await getConversationPreferencesFor(
        conversation._id,
        otherOrganizerIds,
      )
      const active = otherOrganizerIds.filter((id) => !prefs.get(id)?.muted)
      const items: MessageNotificationInput[] = active.map((id) => ({
        recipientId: id,
        conversationId: conversation._id,
        conferenceId: conversation.conferenceId,
        authorName,
        subject,
        message: excerpt,
        link: adminLink,
        actorId: authorOrganizerId,
      }))
      await upsertMessageNotifications(items)
    }

    // sponsorActivity attributed to the acting organizer.
    await createSponsorActivity(
      sfc.sfcId,
      'message',
      `Reply from ${authorName}: ${excerpt}`,
      authorOrganizerId,
    )
  } catch (error) {
    console.error('Failed to fan out sponsor-message notifications:', error)
  }
}
