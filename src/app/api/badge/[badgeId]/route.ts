import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import { generateErrorResponse } from '@/lib/openbadges'
import {
  BADGE_ARTIFACT_CACHE_CONTROL,
  badgeArtifactETag,
  badgeNotModifiedResponse,
} from '@/lib/badge/http'
import { badgeCredentialBody } from '@/lib/badge/credential-response'

/**
 * GET /api/badge/[badgeId]
 *
 * The credential's OWN `id` URL (`${baseUrl}/api/badge/{badgeId}`). OB 3.0
 * displayers dereference the credential id to confirm the badge's authenticity
 * against hosted data — Credly marks an imported badge "Unverified" when this id
 * does not resolve. It previously 404'd (only the `/json`, `/jwt`, `/achievement`
 * sub-paths existed), so this serves the SAME credential bytes as
 * `/api/badge/[badgeId]/json` (shared via badgeCredentialBody) as
 * application/ld+json with open CORS.
 *
 * Content negotiation: a browser (Accept: text/html) is redirected to the human
 * badge page at `/badge/[badgeId]`; machine clients get the credential.
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/#data-integrity-proof-verification
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

    // Humans get the rendered badge page; verifiers get the credential.
    const accept = request.headers?.get?.('accept') ?? ''
    if (accept.includes('text/html')) {
      return NextResponse.redirect(
        new URL(`/badge/${badgeId}`, request.url),
        302,
      )
    }

    const { badge, error } = await getBadgeById(badgeId)

    if (error || !badge) {
      return NextResponse.json(generateErrorResponse('Badge not found', 404), {
        status: 404,
      })
    }

    const etag = badgeArtifactETag(badge, 'credential')
    const notModified = badgeNotModifiedResponse(request, etag)
    if (notModified) return notModified

    let payload: { body: string; isJwt: boolean }
    try {
      payload = badgeCredentialBody(badge)
    } catch {
      return NextResponse.json(
        generateErrorResponse('Invalid badge JSON', 500),
        { status: 500 },
      )
    }

    return new NextResponse(payload.body, {
      status: 200,
      headers: {
        'Content-Type': payload.isJwt ? 'text/plain' : 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': BADGE_ARTIFACT_CACHE_CONTROL,
        ETag: etag,
      },
    })
  } catch (error) {
    console.error('Error serving badge credential:', error)
    return NextResponse.json(
      generateErrorResponse('Internal server error', 500),
      { status: 500 },
    )
  }
}
