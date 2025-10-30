import { eventBus } from '@/lib/events/bus'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeaker } from '@/lib/speaker/sanity'
import { logger } from '@/lib/logger'
import type { Speaker } from '@/lib/speaker/types'
import type { GallerySpeakerTaggedEvent } from '@/lib/events/types'
import type { GalleryImageWithSpeakers } from './types'

/**
 * Publish gallery.speaker.tagged event for specified speaker IDs
 *
 * This helper extracts the common event publication logic used in both
 * createGalleryImage and updateGalleryImage to reduce code duplication.
 *
 * @param image - The gallery image document
 * @param speakerIds - Array of speaker IDs to notify
 * @returns Promise that resolves when event is published (or logs error)
 */
export async function publishSpeakerTaggedEvent(
  image: GalleryImageWithSpeakers,
  speakerIds: string[],
): Promise<void> {
  if (speakerIds.length === 0) {
    return
  }

  try {
    const result = await getConferenceForCurrentDomain()
    if (!result.conference || result.error) {
      logger.warn(
        'Cannot publish gallery.speaker.tagged event: no conference',
        {
          imageId: image._id,
        },
      )
      return
    }

    const conference = result.conference

    const speakerPromises = speakerIds.map((id) => getSpeaker(id))
    const speakerResults = await Promise.allSettled(speakerPromises)
    const fullSpeakers = speakerResults
      .filter(
        (result) => result.status === 'fulfilled' && result.value?.speaker,
      )
      .map(
        (result) =>
          (result as PromiseFulfilledResult<{ speaker: Speaker }>).value
            .speaker,
      )

    if (fullSpeakers.length === 0) {
      logger.warn('No valid speakers found for gallery.speaker.tagged event', {
        imageId: image._id,
        requestedSpeakerIds: speakerIds,
      })
      return
    }

    const domain =
      result.domain || (conference.domains && conference.domains[0])
    if (!domain) {
      logger.error(
        'Cannot publish gallery.speaker.tagged event: no domain available',
        {
          conferenceId: conference._id,
          imageId: image._id,
        },
      )
      return
    }

    const event: GallerySpeakerTaggedEvent = {
      eventType: 'gallery.speaker.tagged',
      timestamp: new Date(),
      image,
      conference,
      speakers: fullSpeakers,
      metadata: {
        domain,
        taggedBy: undefined, // TODO: Add admin user ID from session when available
      },
    }

    await eventBus.publish(event)
    logger.info('Published gallery.speaker.tagged event', {
      speakerCount: fullSpeakers.length,
      imageId: image._id,
    })
  } catch (error) {
    logger.warn('Failed to publish gallery speaker tagged event', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageId: image._id,
    })
  }
}
