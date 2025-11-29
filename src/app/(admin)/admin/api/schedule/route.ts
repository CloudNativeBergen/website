import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { NextResponse } from 'next/server'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { saveScheduleToSanity } from '@/lib/schedule/sanity'
import { revalidateTag } from 'next/cache'

export const dynamic = 'force-dynamic'

export const POST = auth(async (req: NextAuthRequest) => {
  const accessError = checkOrganizerAccess(req)
  if (accessError) {
    return accessError
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

    const { schedule: savedSchedule, error: saveError } =
      await saveScheduleToSanity(schedule, conference)

    if (saveError || !savedSchedule) {
      return NextResponse.json(
        { error: { message: saveError || 'Failed to save schedule' } },
        { status: 500 },
      )
    }

    revalidateTag('content:program', 'default')
    revalidateTag('content:conferences', 'default')
    revalidateTag(`sanity:conference-${conference._id}`, 'default')

    return NextResponse.json({ schedule: savedSchedule })
  } catch (error) {
    console.error('Error saving schedule:', error)
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- NextAuth route handler type workaround
}) as any
