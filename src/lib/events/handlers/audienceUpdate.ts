import { ProposalStatusChangeEvent } from '@/lib/events/types'
import {
  handleSpeakerStatusChange,
  getOrCreateConferenceAudience,
  addSpeakerToAudience,
  removeSpeakerFromAudience,
} from '@/lib/email/audience'
import { Action, Status } from '@/lib/proposal/types'

/**
 * Helper function to check if an error is a rate limit error
 */
const isRateLimitError = (error: any): boolean => {
  return (
    error?.message?.includes('Too many requests') ||
    error?.message?.includes('rate limit') ||
    error?.status === 429
  )
}

/**
 * Handler for email audience management
 */
export async function handleAudienceUpdate(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  // Only update audience for actions that can change confirmed status
  const relevantActions = [
    Action.confirm,
    Action.withdraw,
    Action.reject,
    Action.accept,
    Action.delete,
  ]

  if (!relevantActions.includes(event.action)) {
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    return
  }

  // Determine if this is a status change that affects audience membership
  const wasConfirmed = event.previousStatus === Status.confirmed
  const isNowConfirmed = event.newStatus === Status.confirmed

  // No audience change needed if confirmation status didn't change
  if (wasConfirmed === isNowConfirmed) {
    console.log(
      `No audience change needed - status transition: ${event.previousStatus} → ${event.newStatus}`,
    )
    return
  }

  // Get or create audience once for all speakers (with rate limiting)
  const { audienceId, error: audienceError } =
    await getOrCreateConferenceAudience(event.conference)

  if (audienceError || !audienceId) {
    if (isRateLimitError(audienceError)) {
      console.warn('Audience update skipped due to persistent rate limiting')
    } else {
      console.error('Failed to get conference audience:', audienceError)
    }
    return
  }

  const action = isNowConfirmed ? 'add' : 'remove'
  console.log(
    `${action === 'add' ? 'Adding' : 'Removing'} ${event.speakers.length} speaker(s) ${action === 'add' ? 'to' : 'from'} audience due to status change: ${event.previousStatus} → ${event.newStatus}`,
  )

  // Process speakers sequentially to avoid rate limit issues
  for (let i = 0; i < event.speakers.length; i++) {
    const speaker = event.speakers[i]

    try {
      if (!speaker.email) {
        console.log(`Skipping speaker ${speaker.name} - no email`)
        continue
      }

      if (isNowConfirmed) {
        // Add to audience (newly confirmed)
        const result = await addSpeakerToAudience(audienceId, speaker)
        if (result.success) {
          console.log(`Added speaker ${speaker.name} to audience`)
        } else {
          if (isRateLimitError(result.error)) {
            console.warn(
              `Speaker ${speaker.name} addition skipped due to rate limiting`,
            )
          } else {
            console.error(
              `Failed to add speaker ${speaker.name}:`,
              result.error,
            )
          }
        }
      } else {
        // Remove from audience (no longer confirmed)
        const result = await removeSpeakerFromAudience(
          audienceId,
          speaker.email,
        )
        if (result.success) {
          console.log(`Removed speaker ${speaker.name} from audience`)
        } else {
          if (isRateLimitError(result.error)) {
            console.warn(
              `Speaker ${speaker.name} removal skipped due to rate limiting`,
            )
          } else {
            console.error(
              `Failed to remove speaker ${speaker.name}:`,
              result.error,
            )
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to update audience for speaker ${speaker.name}:`,
        error,
      )
    }

    // Add delay between speakers to prevent rate limiting (except for the last one)
    if (i < event.speakers.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000)) // 1 second delay
    }
  }

  console.log(
    `Audience ${action} operation completed for ${event.speakers.length} speaker(s)`,
  )
}
