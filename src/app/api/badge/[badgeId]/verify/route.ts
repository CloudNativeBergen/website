import { NextRequest, NextResponse } from 'next/server'
import { getBadgeById } from '@/lib/badge/sanity'
import {
  verifyCredential,
  verifyCredentialJWT,
  validateCredential,
  generateVerificationResponse,
  generateErrorResponse,
  isJWTFormat,
} from '@/lib/openbadges'

/**
 * GET /api/badge/[badgeId]/verify
 *
 * Verifies an OpenBadges 3.0 credential signature.
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
      return NextResponse.json({ error: 'Badge not found' }, { status: 404 })
    }

    const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

    if (!publicKey) {
      return NextResponse.json(
        generateErrorResponse('RSA public key not configured', 500),
        { status: 500 },
      )
    }

    if (isJWTFormat(badge.badge_json)) {
      try {
        const credential = await verifyCredentialJWT(
          badge.badge_json,
          publicKey,
        )

        const validation = validateCredential(
          credential as Parameters<typeof validateCredential>[0],
        )

        const response = generateVerificationResponse(
          validation.valid,
          credential as Parameters<typeof verifyCredential>[0],
          validation.errors,
        )

        return NextResponse.json(response, {
          headers: {
            'Content-Type': 'application/ld+json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      } catch (verifyError) {
        console.error('JWT verification failed:', verifyError)
        return NextResponse.json(
          {
            verified: false,
            errors: [
              verifyError instanceof Error
                ? verifyError.message
                : 'JWT signature verification failed',
            ],
          },
          {
            headers: {
              'Content-Type': 'application/ld+json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET',
              'Cache-Control': 'public, max-age=3600',
            },
          },
        )
      }
    }

    // Legacy: Verify Data Integrity Proof format
    let assertion
    try {
      assertion = JSON.parse(badge.badge_json)
    } catch {
      return NextResponse.json({ error: 'Invalid badge JSON' }, { status: 500 })
    }

    // Validate structure first
    const validation = validateCredential(
      assertion as Parameters<typeof validateCredential>[0],
    )

    // Verify signature using OpenBadges library
    let signatureValid = false
    try {
      signatureValid = await verifyCredential(
        assertion as Parameters<typeof verifyCredential>[0],
        publicKey,
      )
    } catch (error) {
      console.error('Verification error:', error)
      signatureValid = false
    }

    const isValid = validation.valid && signatureValid
    const response = generateVerificationResponse(
      isValid,
      assertion as Parameters<typeof verifyCredential>[0],
      validation.errors,
    )

    return NextResponse.json(response, {
      headers: {
        'Content-Type': 'application/ld+json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error verifying badge:', error)

    const message =
      error instanceof Error ? error.message : 'Failed to verify badge'

    return NextResponse.json(generateErrorResponse(message, 500), {
      status: 500,
    })
  }
}
