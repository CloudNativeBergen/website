import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'

export const runtime = 'nodejs'

/**
 * GET /api/badge/[badgeId]/achievement
 * Returns the Achievement (badge class) part of the OpenBadges credential
 */
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

    // Parse the badge JSON to extract the achievement
    const badgeAssertion = JSON.parse(badge.badge_json)
    const achievement = badgeAssertion.credentialSubject?.achievement

    if (!achievement) {
      return NextResponse.json(
        { error: 'Achievement not found in badge' },
        { status: 404 },
      )
    }

    return NextResponse.json(achievement, {
      status: 200,
      headers: {
        'Content-Type': 'application/ld+json',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error fetching badge achievement:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
