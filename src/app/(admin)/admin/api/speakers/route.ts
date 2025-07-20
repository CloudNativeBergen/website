import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakers } from '@/lib/speaker/sanity'
import { Status } from '@/lib/proposal/types'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest) => {
  // Check organizer access
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError) {
      return Response.json({ error: conferenceError.message }, { status: 500 })
    }

    const { speakers, err: speakersError } = await getSpeakers(conference._id, [
      Status.accepted,
      Status.confirmed,
    ])

    if (speakersError) {
      return Response.json({ error: speakersError.message }, { status: 500 })
    }

    return Response.json({
      conference,
      speakers,
    })
  } catch (error) {
    console.error('Speakers API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
