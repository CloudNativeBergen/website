import { NextAuthRequest, auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ConferenceSchedule } from '@/lib/conference/types'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account ||
    !req.auth.speaker.is_organizer
  ) {
    return NextResponse.json(
      { error: { message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({
        schedule: true, // Enable schedule fetching
      })

    if (conferenceError || !conference) {
      return NextResponse.json(
        { error: { message: 'Failed to fetch conference' } },
        { status: 500 },
      )
    }

    // Return the existing schedule if available, or create a default one
    let schedule: ConferenceSchedule | null = conference.schedules?.[0] || null

    // If no schedule exists, create a default one with the conference start date
    if (!schedule && conference.start_date) {
      schedule = {
        _id: '',
        date: conference.start_date,
        tracks: [],
      }
    }

    return NextResponse.json({ schedule })
  } catch (error) {
    console.error('Error fetching schedule:', error)
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

export const POST = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id ||
    !req.auth.account ||
    !req.auth.speaker.is_organizer
  ) {
    return NextResponse.json(
      { error: { message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  try {
    const { schedule } = await req.json()

    if (!schedule) {
      return NextResponse.json(
        { error: { message: 'Schedule data required' } },
        { status: 400 },
      )
    }

    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError || !conference) {
      return NextResponse.json(
        { error: { message: 'Failed to fetch conference' } },
        { status: 500 },
      )
    }

    // TODO: Implement saving to Sanity
    // For now, just return the schedule back
    console.log('Schedule to save:', schedule)

    return NextResponse.json({ schedule })
  } catch (error) {
    console.error('Error saving schedule:', error)
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
