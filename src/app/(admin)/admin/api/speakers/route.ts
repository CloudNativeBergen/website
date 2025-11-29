import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakersWithAcceptedTalks } from '@/lib/speaker/sanity'

export const GET = auth(async (req: NextAuthRequest) => {
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
  }

  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({})

    if (conferenceError) {
      return Response.json({ error: conferenceError.message }, { status: 500 })
    }

    const { speakers, err: speakersError } = await getSpeakersWithAcceptedTalks(
      conference._id,
      true,
    )

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
