import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSpeakers } from '@/lib/speaker/sanity'
import { Status } from '@/lib/proposal/types'

export const dynamic = 'force-dynamic'

export const GET = auth(async (req) => {
  try {
    // Check if user is authenticated and is an organizer
    if (!req.auth?.speaker?.is_organizer) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 },
      )
    }

    // Extract optional conferenceId query parameter
    const conferenceId = req.nextUrl.searchParams.get('conferenceId')

    // Fetch all speakers with any proposals (active speakers)
    const { speakers, err } = await getSpeakers(
      conferenceId || undefined,
      [Status.submitted, Status.accepted, Status.confirmed],
      true,
    )

    if (err) {
      return NextResponse.json(
        { error: 'Failed to fetch speakers' },
        { status: 500 },
      )
    }

    // Return speakers with basic fields needed for selection
    const speakersData = speakers.map((speaker) => ({
      _id: speaker._id,
      name: speaker.name || '',
      title: speaker.title || '',
      email: speaker.email || '',
      image: speaker.image || null,
      slug: speaker.slug || null,
    }))

    return NextResponse.json({ speakers: speakersData }, { status: 200 })
  } catch (error) {
    console.error('Error fetching speakers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch speakers' },
      { status: 500 },
    )
  }
})
