import { NextAuthRequest, auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { saveScheduleToSanity } from '@/lib/schedule/sanity'

export const dynamic = 'force-dynamic'

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

    console.log('Saving schedule to Sanity:', schedule)

    const { schedule: savedSchedule, error: saveError } =
      await saveScheduleToSanity(schedule, conference)

    if (saveError || !savedSchedule) {
      return NextResponse.json(
        { error: { message: saveError || 'Failed to save schedule' } },
        { status: 500 },
      )
    }

    console.log('Schedule saved successfully:', savedSchedule._id)

    return NextResponse.json({ schedule: savedSchedule })
  } catch (error) {
    console.error('Error saving schedule:', error)
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
