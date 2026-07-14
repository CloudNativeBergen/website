import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import { generateErrorResponse, isJWTFormat } from '@/lib/openbadges'

/**
 * GET /api/badge/[badgeId]/json
 *
 * Returns the OpenBadges 3.0 credential.
 *
 * New badges: JSON-LD credential with embedded Data Integrity Proof — this
 * is the .json file recipients can upload directly to Credly and other
 * certified OB 3.0 displayers.
 * Legacy badges (badgeJson holds a JWT string): the JWT as text/plain.
 * The JWT for new badges is served from /api/badge/[badgeId]/jwt.
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

    if (isJWTFormat(badge.badgeJson)) {
      return new NextResponse(badge.badgeJson, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // Embedded Data Integrity Proof format (primary for new badges)
    try {
      const assertion = JSON.parse(badge.badgeJson)
      return new NextResponse(JSON.stringify(assertion, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
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
    // Log detail server-side; return a generic message to the client.
    console.error('Error fetching badge JSON:', error)

    return NextResponse.json(
      generateErrorResponse('Internal server error', 500),
      { status: 500 },
    )
  }
}
