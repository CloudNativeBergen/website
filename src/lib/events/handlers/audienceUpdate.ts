import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { handleSpeakerStatusChange } from '@/lib/email/audience'
import { Action, Status } from '@/lib/proposal/types'

/**
 * Handler for email audience management
 */
export async function handleAudienceUpdate(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  // Only update audience for confirm/withdraw actions
  if (![Action.confirm, Action.withdraw].includes(event.action)) {
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    return
  }

  // Process all speakers in parallel
  const speakerPromises = event.speakers.map(async (speaker) => {
    try {
      // Determine if speaker has confirmed talks after this action
      const hasConfirmedTalks = event.newStatus === Status.confirmed

      await handleSpeakerStatusChange(
        event.conference,
        speaker,
        hasConfirmedTalks,
      )

      console.log(`Audience updated for speaker ${speaker.name}`)
    } catch (error) {
      console.error(
        `Failed to update audience for speaker ${speaker.name}:`,
        error,
      )
    }
  })

  await Promise.allSettled(speakerPromises)

  console.log(`Audience update processed for ${event.speakers.length} speakers`)
}
