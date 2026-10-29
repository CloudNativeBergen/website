import { createHash } from 'node:crypto'
import type {
  WorkshopCapacityThreshold,
  WorkshopCapacityThresholdEvent,
} from '@/lib/events/types'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
import {
  NOTIFICATION_TITLE_MAX,
  createNotificationsOnce,
} from '@/lib/notification/sanity'
import type { OnceNotificationInput } from '@/lib/notification/types'
import { getConferenceOrganizerIds } from '@/lib/organizer-invite/sanity'
import { fitsDocumentId } from '@/lib/sanity/helpers'
import { displayName } from '@/lib/text/display'

const ID_PREFIX = 'notification.workshop-capacity.'
const DIGEST_LENGTH = 32

/**
 * `notification.workshop-capacity.<hash>.<organizerId>`, the same shape as the
 * not-set notice's (`./ticketTypeNotSetNotification`): the conference, the
 * workshop and the threshold hashed, THE ORGANIZER LAST AND IN THE CLEAR for
 * the speaker merge (`DETERMINISTIC_ID_PREFIXES` in `@/lib/speaker/merge`).
 */
function noticeId(
  conferenceId: string,
  workshopId: string,
  threshold: WorkshopCapacityThreshold,
  organizerId: string,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([conferenceId, workshopId, threshold]))
    .digest('hex')
    .slice(0, DIGEST_LENGTH)
  return `${ID_PREFIX}${digest}.${organizerId}`
}

const fitsADocumentId = (organizerId: string) =>
  fitsDocumentId(noticeId('', '', 'waitlist', organizerId))

const ENDINGS: Record<WorkshopCapacityThreshold, string> = {
  'eighty-percent': '” is 80% full',
  waitlist: '” has a waitlist',
}

/**
 * One notification per organizer for one workshop and threshold. Seat counts
 * and the workshop's title only, nothing about who signed up.
 */
export function workshopCapacityNotifications(params: {
  event: Pick<
    WorkshopCapacityThresholdEvent,
    | 'conferenceId'
    | 'workshopId'
    | 'workshopTitle'
    | 'threshold'
    | 'seatsTaken'
    | 'capacity'
  >
  organizerIds: readonly string[]
}): OnceNotificationInput[] {
  const { event, organizerIds } = params
  const { conferenceId, workshopId, threshold } = event
  const name = displayName(event.workshopTitle) || 'A workshop'
  const ending = ENDINGS[threshold]
  const room = NOTIFICATION_TITLE_MAX - ending.length - 1
  const title = `“${
    name.length > room ? `${truncateToGraphemeBoundary(name, room - 1)}…` : name
  }${ending}`

  return [...new Set(organizerIds)]
    .filter((organizerId) => organizerId && fitsADocumentId(organizerId))
    .map((organizerId) => ({
      id: noticeId(conferenceId, workshopId, threshold, organizerId),
      recipientId: organizerId,
      conferenceId,
      notificationType: 'workshop_capacity',
      title,
      message: `${event.seatsTaken} of ${event.capacity} seats taken.`,
      link: '/admin/workshops',
    }))
}

/**
 * Tells the organizers of a conference that a workshop crossed a threshold.
 * Once per workshop, threshold and organizer, ever: the document id is written
 * only if it does not exist, so a workshop that drops below and crosses again
 * notifies no one twice. A failure is logged and goes no further.
 */
export async function handleWorkshopCapacityNotification(
  event: WorkshopCapacityThresholdEvent,
): Promise<void> {
  const { conferenceId, workshopId, threshold } = event
  const context = { conferenceId, workshopId, threshold }
  try {
    const organizerIds = await getConferenceOrganizerIds(conferenceId)
    await createNotificationsOnce(
      workshopCapacityNotifications({ event, organizerIds }),
      context,
    )
  } catch (error) {
    console.error('workshop.capacity.threshold: failed', context, error)
  }
}
