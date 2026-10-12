import { createHash } from 'node:crypto'
import type { WorkshopTicketTypeNotSetEvent } from '@/lib/events/types'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
import {
  NOTIFICATION_TITLE_MAX,
  createNotificationsOnce,
} from '@/lib/notification/sanity'
import type { OnceNotificationInput } from '@/lib/notification/types'
import { getConferenceOrganizerIds } from '@/lib/organizer-invite/sanity'
import { typeKey } from '@/lib/tickets/classification'

/**
 * The document id of one organizer's notification for one type:
 * `notification.workshop-not-set.<hash>.<organizerId>`.
 *
 * The conference and the type are hashed because a type name is free text from
 * the ticketing provider and a Sanity id allows only `[A-Za-z0-9._-]`. The type
 * goes in by {@link typeKey}, the comparison the rule itself uses, so two
 * spellings the rule treats as one type are one notification.
 *
 * THE ORGANIZER IS THE LAST SEGMENT, IN THE CLEAR, because a speaker merge
 * finds the documents keyed by the account it removes by that suffix and moves
 * them to the account it keeps (`DETERMINISTIC_ID_PREFIXES` in
 * `@/lib/speaker/merge`). Hashed in, the merged organizer would be notified a
 * second time. 63 characters before it leave 65 for the id, of Sanity's 128.
 */
function noticeId(
  conferenceId: string,
  typeName: string,
  organizerId: string,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([conferenceId, typeKey(typeName)]))
    .digest('hex')
    .slice(0, 32)
  return `notification.workshop-not-set.${digest}.${organizerId}`
}

/**
 * One notification per organizer for one not-set type. It stores the ticket
 * type's name and nothing about the buyer or the refused attendee.
 */
export function ticketTypeNotSetNotifications(params: {
  conferenceId: string
  typeName: string
  organizerIds: readonly string[]
}): OnceNotificationInput[] {
  const { conferenceId, organizerIds } = params
  const typeName = params.typeName.trim()
  // The name comes first: the bell cuts a title off at the end of its row, and
  // the name is the part an organizer cannot do without.
  const ending = '” needs a workshop decision'
  const room = NOTIFICATION_TITLE_MAX - ending.length - 1
  const title = `“${
    typeName.length > room
      ? `${truncateToGraphemeBoundary(typeName, room - 1)}…`
      : typeName
  }${ending}`

  return [...new Set(organizerIds)].filter(Boolean).map((organizerId) => ({
    id: noticeId(conferenceId, typeName, organizerId),
    recipientId: organizerId,
    conferenceId,
    notificationType: 'workshop_ticket_type_not_set',
    title,
    message:
      'Choose whether this ticket type grants workshop access. Until then its holders can’t sign up.',
    link: '/admin/workshops',
  }))
}

/**
 * Tells the organizers of a conference that a ticket type has no workshop
 * decision (workshop tickets spec §8). There is no actor to exclude: the
 * buyer and the refused attendee are not organizers acting in the admin.
 *
 * RECIPIENTS are `organizers[]` of the conference the event names, read by its
 * server-resolved id. This line is the one place they are chosen.
 *
 * ONCE PER TYPE: every document has an id derived from (conference, type,
 * organizer) and is written only if it does not exist, so this handler may run
 * for a type any number of times, on any instance, and each organizer still
 * holds one notification. It deliberately does not read first to find out.
 *
 * COST of one run: one read (the organizers) and one write (the transaction).
 */
export async function handleTicketTypeNotSetNotification(
  event: WorkshopTicketTypeNotSetEvent,
): Promise<void> {
  const { conferenceId, typeName } = event
  const organizerIds = await getConferenceOrganizerIds(conferenceId)
  await createNotificationsOnce(
    ticketTypeNotSetNotifications({ conferenceId, typeName, organizerIds }),
  )
}
