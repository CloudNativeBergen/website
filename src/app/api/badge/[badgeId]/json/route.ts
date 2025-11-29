import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import { generateErrorResponse, isJWTFormat } from '@/lib/openbadges'

/**
 * GET /api/badge/[badgeId]/json
 *
 * Returns the OpenBadges 3.0 credential.
 * Returns JWT string for new badges or JSON object for legacy badges.
 */
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

    if (isJWTFormat(badge.badge_json)) {
      return new NextResponse(badge.badge_json, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // Legacy: Parse and return JSON (Data Integrity Proof format)
    try {
      const assertion = JSON.parse(badge.badge_json)
      return new NextResponse(JSON.stringify(assertion, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/ld+json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return NextResponse.json(
        generateErrorResponse('Invalid badge JSON', 500),
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('Error fetching badge JSON:', error)

    const message =
      error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(generateErrorResponse(message, 500), {
      status: 500,
    })
  }
}
