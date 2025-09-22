import { ProposalStatusChangeEvent } from '@/lib/events/types'
import {
  getOrCreateConferenceAudience,
  addSpeakerToAudience,
  removeSpeakerFromAudience,
} from '@/lib/email/audience'
import { Action, Status } from '@/lib/proposal/types'

const isRateLimitError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const err = error as { message?: string; status?: number }
  return (
    (typeof err.message === 'string' &&
      err.message.includes('Too many requests')) ||
    (typeof err.message === 'string' && err.message.includes('rate limit')) ||
    err.status === 429
  )
}

export async function handleAudienceUpdate(
  event: ProposalStatusChangeEvent,
): Promise<void> {
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

  const wasConfirmed = event.previousStatus === Status.confirmed
  const isNowConfirmed = event.newStatus === Status.confirmed

  if (wasConfirmed === isNowConfirmed) {
    console.log(
      `No audience change needed - status transition: ${event.previousStatus} → ${event.newStatus}`,
    )
    return
  }

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

  for (let i = 0; i < event.speakers.length; i++) {
    const speaker = event.speakers[i]

    try {
      if (!speaker.email) {
        console.log(`Skipping speaker ${speaker.name} - no email`)
        continue
      }

      if (isNowConfirmed) {
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

    if (i < event.speakers.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  console.log(
    `Audience ${action} operation completed for ${event.speakers.length} speaker(s)`,
  )
}
