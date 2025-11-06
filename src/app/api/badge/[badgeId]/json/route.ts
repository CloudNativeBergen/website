import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import {
  parseBadgeJson,
  BadgeNotFoundError,
  BadgeVerificationError,
} from '@/lib/badge/verification'

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
      throw new BadgeNotFoundError('Badge not found')
    }

    // Parse and validate badge JSON
    const { assertion, error: parseError } = parseBadgeJson(badge.badge_json)

    if (parseError || !assertion) {
      throw new BadgeVerificationError(
        parseError || 'Failed to parse badge JSON',
      )
    }

    return new NextResponse(JSON.stringify(assertion, null, 2), {
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

    if (error instanceof BadgeNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    if (error instanceof BadgeVerificationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
