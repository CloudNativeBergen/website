import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ badgeId: string }> },
) {
  try {
    const { badgeId } = await segmentData.params

    if (!badgeId) {
      return NextResponse.json(
        { error: 'Badge ID is required' },
        { status: 400 },
      )
    }

    const { badge, error } = await getBadgeById(badgeId)

    if (error || !badge) {
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    const badgeAssertion = JSON.parse(badge.badge_json)

    return new NextResponse(JSON.stringify(badgeAssertion, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error fetching badge JSON:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
