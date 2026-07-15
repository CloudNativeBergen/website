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
 *
 * Legacy badges (badgeJson holds a JWT) are verified with the RSA public
 * key; embedded-proof badges are verified with the published Ed25519 public
 * key (BADGE_ISSUER_ED25519_PUBLIC_KEY). Verification never needs the secret
 * seed. The proof's verificationMethod is pinned to OUR issuer's embedded VM
 * (`${issuer.id}#key-ed25519`), so a badge presented with a foreign or
 * did:key verification method is reported as not-issued-by-us.
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

    if (isJWTFormat(badge.badgeJson)) {
      const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

      if (!publicKey) {
        return NextResponse.json(
          generateErrorResponse('RSA public key not configured', 500),
          { status: 500 },
        )
      }

      try {
        const credential = await verifyCredentialJWT(badge.badgeJson, publicKey)

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

    // Embedded Data Integrity Proof format
    let assertion
    try {
      assertion = JSON.parse(badge.badgeJson)
    } catch {
      return NextResponse.json({ error: 'Invalid badge JSON' }, { status: 500 })
    }

    // Validate structure first
    const validation = validateCredential(
      assertion as Parameters<typeof validateCredential>[0],
    )

    // Verify the signature with OUR published Ed25519 public key. Verifying
    // never requires the secret seed.
    const publicKey = process.env.BADGE_ISSUER_ED25519_PUBLIC_KEY
    if (!publicKey) {
      return NextResponse.json(
        generateErrorResponse('Ed25519 issuer public key not configured', 500),
        { status: 500 },
      )
    }

    let signatureValid = false
    try {
      // Pin the verification method to OUR issuer's embedded VM. A badge
      // presented with a foreign / did:key VM must never earn a green check
      // from this endpoint, even if it is internally self-consistent.
      const issuerId =
        typeof assertion.issuer === 'object'
          ? assertion.issuer?.id
          : assertion.issuer
      const expectedVm = `${issuerId}#key-ed25519`
      const proofVm = assertion.proof?.[0]?.verificationMethod

      if (proofVm !== expectedVm) {
        signatureValid = false
      } else {
        signatureValid = await verifyCredential(
          assertion as Parameters<typeof verifyCredential>[0],
          publicKey,
        )
      }
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
    // Log the detail server-side; return a generic message to the client so
    // internal error details are not exposed.
    console.error('Error verifying badge:', error)

    return NextResponse.json(
      generateErrorResponse('Failed to verify badge', 500),
      { status: 500 },
    )
  }
}
