import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import { generateErrorResponse } from '@/lib/openbadges'
import type { BadgeAssertion } from '@/lib/badge/types'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  segmentData: { params: Promise<{ badgeId: string }> },
) {
  try {
    const { badgeId } = await segmentData.params

    if (!badgeId) {
      return NextResponse.json(
        generateErrorResponse('Badge ID is required', 400),
        { status: 400 },
      )
    }

    const { badge, error } = await getBadgeById(badgeId)

    if (error || !badge) {
      return NextResponse.json(generateErrorResponse('Badge not found', 404), {
        status: 404,
      })
    }

    // Parse badge JSON
    let assertion: BadgeAssertion
    try {
      assertion = JSON.parse(badge.badge_json) as BadgeAssertion
    } catch {
      return NextResponse.json(
        generateErrorResponse('Invalid badge JSON', 500),
        { status: 500 },
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

    const message =
      error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(generateErrorResponse(message, 500), {
      status: 500,
    })
  }
}
