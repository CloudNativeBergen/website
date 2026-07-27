import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import {
  BADGE_ARTIFACT_CACHE_CONTROL,
  BADGE_CORS_HEADERS,
  badgeArtifactETag,
  badgeNotModifiedResponse,
} from '@/lib/badge/http'
import { generateErrorResponse, isJWTFormat } from '@/lib/openbadges'

/**
 * GET /api/badge/[badgeId]/jwt
 *
 * Returns the OpenBadges 3.0 credential as an RS256 JWT (Compact JWS).
 *
 * New badges store the JWT in the dedicated badgeJwt field; legacy badges
 * store the JWT directly in badgeJson. Returns 404 when no JWT exists.
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
        headers: { ...BADGE_CORS_HEADERS },
      })
    }

    const etag = badgeArtifactETag(badge, 'jwt')
    const notModified = badgeNotModifiedResponse(request, etag, {
      ...BADGE_CORS_HEADERS,
    })
    if (notModified) return notModified

    const jwt =
      badge.badgeJwt ?? (isJWTFormat(badge.badgeJson) ? badge.badgeJson : null)

    if (!jwt) {
      return NextResponse.json(
        generateErrorResponse(
          'No JWT credential available for this badge',
          404,
        ),
        { status: 404, headers: { ...BADGE_CORS_HEADERS } },
      )
    }

    return new NextResponse(jwt, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        ...BADGE_CORS_HEADERS,
        'Cache-Control': BADGE_ARTIFACT_CACHE_CONTROL,
        ETag: etag,
      },
    })
  } catch (error) {
    // Log detail server-side; return a generic message to the client.
    console.error('Error fetching badge JWT:', error)

    return NextResponse.json(
      generateErrorResponse('Internal server error', 500),
      { status: 500 },
    )
  }
}
