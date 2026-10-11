import type { WorkshopTicketTypeNotSetEvent } from '@/lib/events/types'
import { createNotificationsOnce } from '@/lib/notification/sanity'
import { getConferenceOrganizerIds } from '@/lib/organizer-invite/sanity'
import {
  retryNotSetNoticeLater,
  ticketTypeNotSetNotifications,
} from '@/lib/workshop/not-set-notice'

/**
 * Tells the organizers of a conference that a ticket type has no workshop
 * decision (workshop tickets spec §8). There is no actor to exclude: the
 * buyer and the refused attendee are not organizers acting in the admin.
 *
 * RECIPIENTS are `organizers[]` of the conference the event names, read by its
 * server-resolved id. Not the organization-wide set most organizer
 * notifications use: which ticket types include workshops is this edition's
 * setting, and an organizer of another edition has no decision to make.
 *
 * ONCE PER TYPE: every document has an id derived from (conference, type,
 * organizer) and is written with `createIfNotExists`, so this handler may run
 * for a type any number of times, on any instance, and each organizer still
 * holds one notification. It deliberately does not read first to find out.
 * An organizer added after the first write gets theirs the next time a fresh
 * process meets the type.
 *
 * COST of one run: one read (the organizers) and one write (the transaction),
 * plus the push bridge's two reads when it created a document and web push is
 * configured.
 *
 * NEVER-FAIL: never throws. A run that wrote nothing it could confirm tells
 * the memo to let this process try again later.
 */
export async function handleTicketTypeNotSetNotification(
  event: WorkshopTicketTypeNotSetEvent,
): Promise<void> {
  const { conferenceId, typeName } = event
  try {
    const organizerIds = await getConferenceOrganizerIds(conferenceId)
    const { committed } = await createNotificationsOnce(
      ticketTypeNotSetNotifications({ conferenceId, typeName, organizerIds }),
    )
    // No organizers is not a success worth remembering: the set was unreadable
    // or the conference is malformed, and a later attempt may find them.
    if (!committed || organizerIds.length === 0) {
      retryNotSetNoticeLater(conferenceId, typeName)
    }
  } catch (error) {
    console.error(
      `workshop.ticket-type.not-set: notification failed (conference=${conferenceId}, source=${event.metadata.source})`,
      error,
    )
    retryNotSetNoticeLater(conferenceId, typeName)
  }
}
