import { Status } from '@/lib/proposal/types'
import { runGeneration } from '@/lib/marketing/generation'
import { getSignedSponsorSubject } from '@/lib/marketing/generation-sanity'
import { becameSigned } from '@/lib/sponsor-crm/events'
import type {
  ProposalStatusChangeEvent,
  SponsorStatusChangeEvent,
} from '../types'

/**
 * MARKETING PLAN TRIGGERS (spec §5.3). A domain event creates draft Tasks
 * from the recipe a Campaign's Trigger names. Idempotent per (Campaign,
 * recipe, subject) in `runGeneration`, so the contract-signed and the
 * closed-won halves of one signing, or a replayed event, create once.
 * Never throws into the bus: a failure is logged, and the expansion cron's
 * sponsor sweep picks a recently signed contract up again.
 */

export async function handleMarketingSponsorSigned(
  event: SponsorStatusChangeEvent,
): Promise<void> {
  if (!becameSigned(event.previous, event.next)) return
  try {
    const subject = await getSignedSponsorSubject(
      event.conferenceId,
      event.sponsorForConferenceId,
    )
    if (!subject) return
    const result = await runGeneration(event.conferenceId, [
      { kind: 'trigger', event: 'sponsorSigned', subjects: [subject] },
    ])
    if (result.created > 0 || result.warnings.length > 0) {
      console.info('marketing sponsorSigned', {
        conferenceId: event.conferenceId,
        sponsorForConferenceId: event.sponsorForConferenceId,
        ...result,
      })
    }
  } catch (error) {
    console.error('marketing sponsorSigned Trigger failed', error)
  }
}

export async function handleMarketingSpeakerConfirmed(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  if (event.newStatus !== Status.confirmed) return
  if (event.previousStatus === Status.confirmed) return
  const conferenceId = event.conference?._id
  if (!conferenceId) return
  try {
    const subjects = (event.speakers ?? [])
      .filter((s) => s?._id)
      .map((s) => ({
        _id: s._id,
        type: 'speaker' as const,
        values: {
          ...(s.name ? { name: s.name } : {}),
          // A speaker has a job title, not a company; it is the closest fit.
          ...(s.title ? { company: s.title } : {}),
          ...(event.proposal.title ? { title: event.proposal.title } : {}),
        },
      }))
    if (subjects.length === 0) return
    const result = await runGeneration(conferenceId, [
      { kind: 'trigger', event: 'speakerConfirmed', subjects },
    ])
    if (result.created > 0 || result.warnings.length > 0) {
      console.info('marketing speakerConfirmed', {
        conferenceId,
        proposalId: event.proposal._id,
        ...result,
      })
    }
  } catch (error) {
    console.error('marketing speakerConfirmed Trigger failed', error)
  }
}
