import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import { generateErrorResponse } from '@/lib/openbadges'
import {
  BADGE_ARTIFACT_CACHE_CONTROL,
  BADGE_CORS_HEADERS,
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

    // Humans get the rendered badge page; verifiers get the credential. Every
    // response of this route content-negotiates on Accept, so all of them
    // carry `Vary: Accept`; the redirect is additionally no-store so a shared
    // cache can never replay it to a machine client.
    const accept = request.headers?.get?.('accept') ?? ''
    if (accept.includes('text/html')) {
      const redirect = NextResponse.redirect(
        new URL(`/badge/${badgeId}`, request.url),
        302,
      )
      redirect.headers.set('Vary', 'Accept')
      redirect.headers.set('Cache-Control', 'no-store')
      return redirect
    }

    const { badge, error } = await getBadgeById(badgeId)

    if (error || !badge) {
      return NextResponse.json(generateErrorResponse('Badge not found', 404), {
        status: 404,
      })
    }

    const etag = badgeArtifactETag(badge, 'credential')
    const notModified = badgeNotModifiedResponse(request, etag, {
      ...BADGE_CORS_HEADERS,
      Vary: 'Accept',
    })
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
        ...BADGE_CORS_HEADERS,
        Vary: 'Accept',
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
