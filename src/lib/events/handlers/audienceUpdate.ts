import { ProposalStatusChangeEvent } from '@/lib/events/types'
import {
  getOrCreateConferenceAudience,
  addSpeakerToAudience,
  removeSpeakerFromAudience,
  ListTruncatedError,
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

/**
 * A REFUSAL HERE IS SILENT, SO IT AT LEAST HAS TO BE UNAMBIGUOUS (#895).
 *
 * `getOrCreateConferenceAudience` and `removeSpeakerFromAudience` can now refuse
 * rather than act on a listing Resend could not exhaust (#893, #895). Refusing
 * is strictly safer than what those paths used to do — mint an empty duplicate
 * audience, or report a removal that removed nothing — but this handler runs on
 * a background event with no caller to return an error to, so a refusal turns
 * into a log line and nothing else.
 *
 * That is a real gap and it is NOT closed here: a log line is not an operator
 * surface. What this does is stop the refusal from being indistinguishable from
 * an ordinary failure in the log — it names the refusal, the reason the listing
 * stopped, and the CONSEQUENCE that is now outstanding, so whoever reads the log
 * knows a speaker is still on a list they should be off. Routing it to the
 * notification hub (a new `NotificationType`, organizer fan-out, its own render)
 * is the actual fix and wants its own change.
 */
function logRefusal(
  what: string,
  error: unknown,
  context: Record<string, unknown>,
): boolean {
  if (!(error instanceof ListTruncatedError)) return false
  console.error(`[Audience] REFUSED: ${what}`, {
    ...context,
    reason: error.name,
    stoppedBecause: error.stoppedBecause,
    pages: error.pages,
    seen: error.seen,
    message: error.message,
  })
  return true
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

  const {
    audienceId,
    client,
    error: audienceError,
  } = await getOrCreateConferenceAudience(event.conference)

  const action = isNowConfirmed ? 'add' : 'remove'

  if (audienceError || !audienceId) {
    const refused = logRefusal(
      `no speaker was ${action === 'add' ? 'added to' : 'removed from'} the audience — Resend returned an incomplete audience list`,
      audienceError,
      {
        conferenceId: event.conference._id,
        action,
        speakers: event.speakers.length,
      },
    )
    if (!refused) {
      if (isRateLimitError(audienceError)) {
        console.warn('Audience update skipped due to persistent rate limiting')
      } else {
        console.error('Failed to get conference audience:', audienceError)
      }
    }
    return
  }

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
        const result = await addSpeakerToAudience(client, audienceId, speaker)
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
          client,
          audienceId,
          speaker.email,
        )
        if (result.success) {
          console.log(`Removed speaker ${speaker.name} from audience`)
        } else if (
          !logRefusal(
            `speaker ${speaker.name} is STILL SUBSCRIBED — Resend returned an incomplete contact list, so the removal was refused rather than reported as done`,
            result.error,
            {
              conferenceId: event.conference._id,
              audienceId,
              speaker: speaker.name,
            },
          )
        ) {
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
