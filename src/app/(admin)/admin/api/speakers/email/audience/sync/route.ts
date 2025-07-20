import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakers } from '@/lib/speaker/sanity'
import {
  syncConferenceAudience,
  getOrCreateConferenceAudience,
} from '@/lib/email/audience'
import { Status } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    // Get conference
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError) {
      return Response.json({ error: conferenceError.message }, { status: 500 })
    }

    // Get only confirmed speakers (not just accepted)
    const { speakers, err } = await getSpeakers(conference._id, [
      Status.confirmed,
    ])

    if (err) {
      console.error('Failed to get speakers:', err)
      return Response.json(
        { error: 'Failed to fetch speakers' },
        { status: 500 },
      )
    }

    const eligibleSpeakers = speakers.filter(
      (speaker: Speaker & { proposals: ProposalExisting[] }) =>
        speaker.email &&
        speaker.proposals?.some(
          (proposal: ProposalExisting) => proposal.status === 'confirmed',
        ),
    )

    // Sync the audience
    const { syncedCount, error } = await syncConferenceAudience(
      conference,
      eligibleSpeakers,
    )

    if (error) {
      console.error('Failed to sync audience:', error)
      return Response.json(
        { error: error?.message || 'Failed to sync audience' },
        { status: 500 },
      )
    }

    // Get the audience ID for response
    const { audienceId } = await getOrCreateConferenceAudience(conference)

    return Response.json({
      success: true,
      audienceId,
      syncedCount,
      message: `Successfully synced ${syncedCount} speakers with the conference audience`,
    })
  } catch (error) {
    console.error('Audience sync error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
