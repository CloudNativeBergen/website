import { GallerySpeakerTaggedEvent } from '@/lib/events/types'
import { sendGalleryTagEmail } from '@/lib/email/gallery'
import { logger } from '@/lib/logger'
import { GALLERY_CONSTANTS } from '@/lib/gallery/constants'

export async function handleGalleryTagNotification(
  event: GallerySpeakerTaggedEvent,
): Promise<void> {
  logger.info('Handling gallery speaker tagged event', {
    imageId: event.image._id,
    speakerCount: event.speakers.length,
    conference: event.conference.title,
  })

  const { image, conference, speakers, metadata } = event
  const { domain } = metadata

  let successCount = 0
  let failureCount = 0
  const errors: Array<{ speaker: string; error: string }> = []

  // Process speakers in batches with limited concurrency
  const BATCH_SIZE = GALLERY_CONSTANTS.NOTIFICATION.EMAIL_CONCURRENCY
  const speakersWithEmail = speakers.filter((speaker) => {
    if (!speaker.email) {
      logger.warn('Speaker has no email address, skipping notification', {
        speakerName: speaker.name,
        speakerId: speaker._id,
      })
      return false
    }
    return true
  })

  for (let i = 0; i < speakersWithEmail.length; i += BATCH_SIZE) {
    const batch = speakersWithEmail.slice(i, i + BATCH_SIZE)

    const batchPromises = batch.map(async (speaker) => {
      try {
        const result = await sendGalleryTagEmail({
          speaker,
          image,
          conference,
          domain,
        })

        if (result.success) {
          logger.info('Gallery tag notification sent', {
            speakerName: speaker.name,
            emailId: result.emailId,
            speakerId: speaker._id,
          })
          return { success: true, speaker }
        } else {
          logger.error('Failed to send gallery tag notification', {
            speakerName: speaker.name,
            error: result.message,
            speakerId: speaker._id,
          })
          return {
            success: false,
            speaker,
            error: result.message,
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        logger.error('Error sending gallery tag notification', {
          speakerName: speaker.name,
          error: errorMessage,
          speakerId: speaker._id,
        })
        return {
          success: false,
          speaker,
          error: errorMessage,
        }
      }
    })

    const batchResults = await Promise.allSettled(batchPromises)

    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { success, speaker, error } = result.value
        if (success) {
          successCount++
        } else {
          failureCount++
          errors.push({
            speaker: speaker.name,
            error: error || 'Unknown error',
          })
        }
      } else {
        failureCount++
        errors.push({
          speaker: 'Unknown',
          error: result.reason?.message || 'Promise rejected',
        })
      }
    })
  }

  const logLevel =
    failureCount > 0 && successCount === 0
      ? 'error'
      : failureCount > 0
        ? 'warn'
        : 'info'
  const logData = {
    imageId: event.image._id,
    totalSpeakers: speakers.length,
    successCount,
    failureCount,
    errors: errors.length > 0 ? errors : undefined,
  }

  if (logLevel === 'error') {
    logger.error(
      'Gallery tag notification handling failed for all speakers',
      logData,
    )
  } else if (logLevel === 'warn') {
    logger.warn(
      'Gallery tag notification handling completed with some failures',
      logData,
    )
  } else {
    logger.info('Gallery tag notification handling complete', logData)
  }
}
