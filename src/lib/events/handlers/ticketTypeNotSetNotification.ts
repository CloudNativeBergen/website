import { createHash } from 'node:crypto'
import type { WorkshopTicketTypeNotSetEvent } from '@/lib/events/types'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
import {
  NOTIFICATION_TITLE_MAX,
  createNotificationsOnce,
} from '@/lib/notification/sanity'
import type { OnceNotificationInput } from '@/lib/notification/types'
import { getConferenceOrganizerIds } from '@/lib/organizer-invite/sanity'
import { fitsDocumentId } from '@/lib/sanity/helpers'
import { typeKey } from '@/lib/tickets/classification'

const ID_PREFIX = 'notification.workshop-not-set.'
const DIGEST_LENGTH = 32

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
    .slice(0, DIGEST_LENGTH)
  return `${ID_PREFIX}${digest}.${organizerId}`
}

/**
 * Whether an organizer can hold a notice at all: whether the document id with
 * their id on the end is one Sanity accepts. Everything before the organizer
 * has a fixed length, so the answer does not depend on the conference or the
 * type. The speaker merge asks the same question of the same function
 * (`fitsDocumentId`) before it moves a notice to another account.
 */
const fitsADocumentId = (organizerId: string) =>
  fitsDocumentId(noticeId('', '', organizerId))

/**
 * A type name made safe to show inside the title's quotes.
 *
 * The name is the provider's free text. Shown as it arrives, a `”` in it would
 * close the title's quote and let the rest read as this system's own words,
 * and a bidi override, a NUL or a line break would be stored into the bell.
 * So control characters and line breaks become spaces, invisible formatting
 * characters (zero-width, bidi, BOM) are dropped, whitespace is collapsed, and
 * a curly double quote inside the name becomes a single one.
 *
 * FOR DISPLAY ONLY. The document id still uses {@link typeKey}: the rule
 * treats two names that differ by such a character as two types, each with its
 * own decision to make, so each gets its own notification.
 */
function displayName(typeName: string): string {
  return typeName
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/“/g, '‘')
    .replace(/”/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One notification per organizer for one not-set type. It stores the ticket
 * type's name and nothing about the buyer or the refused attendee. An
 * organizer whose id would not fit a document id is left out.
 */
export function ticketTypeNotSetNotifications(params: {
  conferenceId: string
  typeName: string
  organizerIds: readonly string[]
}): OnceNotificationInput[] {
  const { conferenceId, typeName, organizerIds } = params
  const name = displayName(typeName)
  // The name comes first: the bell cuts a title off at the end of its row, and
  // the name is the part an organizer cannot do without.
  const ending = '” needs a workshop decision'
  const room = NOTIFICATION_TITLE_MAX - ending.length - 1
  const title = name
    ? `“${
        name.length > room
          ? `${truncateToGraphemeBoundary(name, room - 1)}…`
          : name
      }${ending}`
    : 'A ticket type with no visible name needs a workshop decision'

  return [...new Set(organizerIds)]
    .filter((organizerId) => organizerId && fitsADocumentId(organizerId))
    .map((organizerId) => ({
      id: noticeId(conferenceId, typeName, organizerId),
      recipientId: organizerId,
      conferenceId,
      notificationType: 'workshop_ticket_type_not_set',
      title,
      message:
        'Choose whether this ticket type grants workshop access. Until then its holders can’t sign up.',
      // The "Workshop tickets" section of the page, where the decision is
      // made. The same value as `WORKSHOP_TICKETS_HREF` in
      // `@/components/admin/workshop/tickets`, which arrives with #1332.
      link: '/admin/workshops#workshop-tickets',
    }))
}

/**
 * Tells the organizers of a conference that ticket types have no workshop
 * decision (workshop tickets spec §8). There is no actor to exclude: the
 * buyer and the refused attendee are not organizers acting in the admin.
 *
 * RECIPIENTS are `organizers[]` of the conference the event names, read by its
 * server-resolved id. The read below is the one place they are chosen.
 *
 * ONCE PER TYPE: every document has an id derived from (conference, type,
 * organizer) and is written only if it does not exist, so this handler may run
 * for a type any number of times, on any instance, and each organizer still
 * holds one notification. It deliberately does not read first to find out.
 *
 * COST of one run, however many types the event names: one read (the
 * organizers) and one write (the transaction).
 *
 * A FAILURE is logged with the conference, the types and the source: a failed
 * read here, a failed write by the writer, which is handed the same context.
 * It goes no further.
 */
export async function handleTicketTypeNotSetNotification(
  event: WorkshopTicketTypeNotSetEvent,
): Promise<void> {
  const { conferenceId, typeNames } = event
  const context = { conferenceId, typeNames, source: event.metadata.source }
  try {
    const organizerIds = await getConferenceOrganizerIds(conferenceId)

    const tooLong = organizerIds.filter((id) => !fitsADocumentId(id))
    if (tooLong.length > 0) {
      console.error(
        'workshop.ticket-type.not-set: organizer ids too long for a document id, left out',
        { ...context, organizerIds: tooLong },
      )
    }

    await createNotificationsOnce(
      typeNames.flatMap((typeName) =>
        ticketTypeNotSetNotifications({ conferenceId, typeName, organizerIds }),
      ),
      context,
    )
  } catch (error) {
    console.error('workshop.ticket-type.not-set: failed', context, error)
  }
}
