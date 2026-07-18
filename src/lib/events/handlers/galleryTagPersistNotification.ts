import { GallerySpeakerTaggedEvent } from '@/lib/events/types'
import { createNotifications } from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'

/**
 * Persists an in-app notification for each speaker tagged in a gallery image,
 * mirroring the email side effect (`handleGalleryTagNotification`). The link
 * mirrors the email's `galleryUrl` (`buildGalleryImageUrl`) in app-relative
 * form.
 *
 * All fan-out goes through `createNotifications`, which never throws — a failed
 * notification write must not fail the tagging mutation that produced the event.
 *
 * NOTE: `metadata.taggedBy` is currently undefined (a survey TODO), so there is
 * usually no actor. We handle its absence gracefully: the notification is
 * emitted without an `actorId`, and the actor is only excluded from the
 * recipients when it is actually present.
 */
export async function handleGalleryTagPersistNotification(
  event: GallerySpeakerTaggedEvent,
): Promise<void> {
  const conferenceId = event.conference._id
  const actorId = event.metadata.taggedBy
  const link = `/#gallery?img=${event.image._id}`

  // De-duplicate by speaker id and skip the actor (if known — a speaker who
  // tags themselves does not need to be told about it).
  const seen = new Set<string>()
  const items: NotificationInput[] = []
  for (const speaker of event.speakers || []) {
    const id = speaker?._id
    if (!id || id === actorId || seen.has(id)) {
      continue
    }
    seen.add(id)
    items.push({
      recipientId: id,
      conferenceId,
      notificationType: 'gallery_tagged',
      title: 'You were tagged in a conference photo',
      actorId,
      link,
    })
  }

  await createNotifications(items)
}
