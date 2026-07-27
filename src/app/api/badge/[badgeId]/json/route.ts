import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import {
  BADGE_ARTIFACT_CACHE_CONTROL,
  BADGE_CORS_HEADERS,
  badgeArtifactETag,
  badgeNotModifiedResponse,
} from '@/lib/badge/http'
import { generateErrorResponse } from '@/lib/openbadges'
import { badgeCredentialBody } from '@/lib/badge/credential-response'

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
        headers: { ...BADGE_CORS_HEADERS },
      })
    }

    const etag = badgeArtifactETag(badge, 'json')
    const notModified = badgeNotModifiedResponse(request, etag, {
      ...BADGE_CORS_HEADERS,
    })
    if (notModified) return notModified

    let payload: { body: string; isJwt: boolean }
    try {
      // Shared with the credential-id route so both emit identical bytes.
      payload = badgeCredentialBody(badge)
    } catch {
      return NextResponse.json(
        generateErrorResponse('Invalid badge JSON', 500),
        { status: 500, headers: { ...BADGE_CORS_HEADERS } },
      )
    }

    return new NextResponse(payload.body, {
      status: 200,
      headers: {
        'Content-Type': payload.isJwt ? 'text/plain' : 'application/json',
        ...BADGE_CORS_HEADERS,
        'Cache-Control': BADGE_ARTIFACT_CACHE_CONTROL,
        ETag: etag,
      },
    })
  } catch (error) {
    // Log detail server-side; return a generic message to the client.
    console.error('Error fetching badge JSON:', error)

    return NextResponse.json(
      generateErrorResponse('Internal server error', 500),
      { status: 500, headers: { ...BADGE_CORS_HEADERS } },
    )
  }
}
